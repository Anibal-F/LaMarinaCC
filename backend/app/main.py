import json
import re
import unicodedata
from fastapi import FastAPI
from fastapi import HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from fastapi.responses import FileResponse, PlainTextResponse
from urllib.error import HTTPError, URLError
from urllib.request import Request as UrlRequest, urlopen

from app.core.config import settings
from app.auth.routes import router as auth_router
from app.modules.administracion.routes import router as administracion_router
from app.modules.clientes.routes import router as clientes_router
from app.modules.catalogos.routes import router as catalogos_router
from app.modules.expedientes.routes import router as expedientes_router
from app.modules.reportes.routes import router as reportes_router
from app.modules.inventario.routes import router as inventario_router
from app.modules.pintura.routes import router as pintura_router
from app.modules.recepcion.routes import router as recepcion_router
from app.modules.taller.routes import router as taller_router
from app.modules.valuacion_danos.routes import router as valuacion_router


def _parse_origins(raw: str) -> list[str]:
    if not raw:
        return []
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


def _normalize_trigger(text: str) -> str:
    value = unicodedata.normalize("NFD", (text or "").strip().lower())
    value = "".join(ch for ch in value if unicodedata.category(ch) != "Mn")
    value = re.sub(r"\s+", " ", value)
    return value


def _resolve_auto_reply(user_text: str) -> str:
    normalized = _normalize_trigger(user_text)
    if "donde se encuentran ubicados" in normalized or "ubicacion" in normalized:
        return settings.whatsapp_auto_reply_ubicacion
    if "que horario de servicio tienen" in normalized or "horario" in normalized:
        return settings.whatsapp_auto_reply_horario
    if "tengo una duda" in normalized:
        return settings.whatsapp_auto_reply_duda
    return settings.whatsapp_auto_reply_default


def _send_whatsapp_text_message(*, to_phone: str, text: str) -> dict:
    if not settings.whatsapp_phone_number_id:
        raise RuntimeError("WHATSAPP_PHONE_NUMBER_ID no configurado.")
    if not settings.whatsapp_access_token:
        raise RuntimeError("WHATSAPP_ACCESS_TOKEN no configurado.")
    endpoint = (
        f"{settings.whatsapp_graph_api_base_url.rstrip('/')}/"
        f"{settings.whatsapp_api_version}/{settings.whatsapp_phone_number_id}/messages"
    )
    payload = {
        "messaging_product": "whatsapp",
        "to": to_phone,
        "type": "text",
        "text": {"body": text},
    }
    request = UrlRequest(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {settings.whatsapp_access_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=20) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except HTTPError as exc:
        details = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"Meta API error ({exc.code}): {details or str(exc)}") from exc
    except URLError as exc:
        raise RuntimeError(f"No se pudo contactar Meta API: {exc}") from exc


app = FastAPI(title=settings.app_name)

origins = _parse_origins(settings.cors_origins)
if origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition"],
    )

app.include_router(recepcion_router)
app.include_router(inventario_router)
app.include_router(valuacion_router)
app.include_router(pintura_router)
app.include_router(taller_router)
app.include_router(administracion_router)
app.include_router(clientes_router)
app.include_router(catalogos_router)
app.include_router(expedientes_router)
app.include_router(reportes_router)
app.include_router(auth_router)

app_media_dir = Path(__file__).resolve().parent / "media"
legacy_media_dir = Path(__file__).resolve().parent.parent / "media"
app_media_dir.mkdir(parents=True, exist_ok=True)


@app.get("/media/{file_path:path}")
def serve_media(file_path: str):
    requested = Path(file_path)
    if requested.is_absolute() or ".." in requested.parts:
        raise HTTPException(status_code=400, detail="Ruta de archivo invalida")

    for base_dir in (app_media_dir, legacy_media_dir):
        base_resolved = base_dir.resolve()
        candidate = (base_dir / requested).resolve()
        if str(candidate).startswith(str(base_resolved)) and candidate.exists() and candidate.is_file():
            return FileResponse(candidate)

    raise HTTPException(status_code=404, detail="Archivo no encontrado")


@app.get("/")
def root():
    return {"app": settings.app_name, "status": "running"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/webhooks/whatsapp")
def verify_whatsapp_webhook(
    hub_mode: str | None = Query(default=None, alias="hub.mode"),
    hub_verify_token: str | None = Query(default=None, alias="hub.verify_token"),
    hub_challenge: str | None = Query(default=None, alias="hub.challenge"),
):
    expected_token = (settings.whatsapp_webhook_verify_token or "").strip()
    if not expected_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="WHATSAPP_WEBHOOK_VERIFY_TOKEN no configurado en backend.",
        )
    if hub_mode == "subscribe" and hub_verify_token == expected_token and hub_challenge:
        return PlainTextResponse(content=hub_challenge, status_code=status.HTTP_200_OK)
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="No se pudo validar webhook de WhatsApp.",
    )


@app.post("/webhooks/whatsapp")
async def receive_whatsapp_webhook(request: Request):
    payload = await request.json()
    if not settings.whatsapp_auto_reply_enabled:
        return {"received": True, "auto_reply": "disabled"}

    entries = payload.get("entry") or []
    for entry in entries:
        for change in entry.get("changes") or []:
            value = change.get("value") or {}
            messages = value.get("messages") or []
            for message in messages:
                # Only auto-respond to incoming text messages from users.
                if message.get("type") != "text":
                    continue
                user_text = ((message.get("text") or {}).get("body") or "").strip()
                if not user_text:
                    continue
                to_phone = str(message.get("from") or "").strip()
                if not to_phone:
                    continue
                reply = _resolve_auto_reply(user_text)
                if not reply:
                    continue
                try:
                    _send_whatsapp_text_message(to_phone=to_phone, text=reply)
                except Exception as exc:
                    print(f"[whatsapp-webhook] auto-reply error to={to_phone}: {exc}")
    return {"received": True}
