import json
import re
import unicodedata
from fastapi import FastAPI
from fastapi import File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from pydantic import BaseModel
from psycopg.rows import dict_row
from fastapi.responses import FileResponse, PlainTextResponse, Response
from uuid import uuid4
from urllib.error import HTTPError, URLError
from urllib.request import Request as UrlRequest, urlopen

from app.core.config import settings
from app.core.db import get_connection
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


def _send_whatsapp_media_message(
    *,
    to_phone: str,
    media_type: str,
    media_link: str,
    caption: str | None = None,
    filename: str | None = None,
) -> dict:
    if not settings.whatsapp_phone_number_id:
        raise RuntimeError("WHATSAPP_PHONE_NUMBER_ID no configurado.")
    if not settings.whatsapp_access_token:
        raise RuntimeError("WHATSAPP_ACCESS_TOKEN no configurado.")
    endpoint = (
        f"{settings.whatsapp_graph_api_base_url.rstrip('/')}/"
        f"{settings.whatsapp_api_version}/{settings.whatsapp_phone_number_id}/messages"
    )
    media_payload: dict[str, str] = {"link": media_link}
    if caption and media_type in {"image", "video", "document"}:
        media_payload["caption"] = caption
    if filename and media_type == "document":
        media_payload["filename"] = filename
    payload = {
        "messaging_product": "whatsapp",
        "to": to_phone,
        "type": media_type,
        media_type: media_payload,
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


def _fetch_whatsapp_media_info(media_id: str) -> dict:
    endpoint = (
        f"{settings.whatsapp_graph_api_base_url.rstrip('/')}/"
        f"{settings.whatsapp_api_version}/{media_id}"
    )
    request = UrlRequest(
        endpoint,
        headers={"Authorization": f"Bearer {settings.whatsapp_access_token}"},
        method="GET",
    )
    try:
        with urlopen(request, timeout=20) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except HTTPError as exc:
        details = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"Meta API media error ({exc.code}): {details or str(exc)}") from exc
    except URLError as exc:
        raise RuntimeError(f"No se pudo contactar Meta API: {exc}") from exc


def _download_whatsapp_media(media_url: str) -> tuple[bytes, str]:
    request = UrlRequest(
        media_url,
        headers={"Authorization": f"Bearer {settings.whatsapp_access_token}"},
        method="GET",
    )
    try:
        with urlopen(request, timeout=30) as response:
            content_type = response.headers.get("Content-Type", "application/octet-stream")
            return response.read(), content_type
    except HTTPError as exc:
        details = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"Meta API download error ({exc.code}): {details or str(exc)}") from exc
    except URLError as exc:
        raise RuntimeError(f"No se pudo descargar media de Meta: {exc}") from exc


def _detect_media_type(filename: str, content_type: str) -> str:
    extension = Path(filename or "").suffix.lower()
    mime = (content_type or "").lower()
    if mime.startswith("image/") or extension in {".jpg", ".jpeg", ".png", ".webp"}:
        return "image"
    if mime.startswith("video/") or extension in {".mp4", ".mov", ".webm", ".mkv"}:
        return "video"
    if mime.startswith("audio/") or extension in {".mp3", ".ogg", ".wav", ".m4a"}:
        return "audio"
    return "document"


def _ensure_whatsapp_chat_tables(conn) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS whatsapp_chat_messages (
            id BIGSERIAL PRIMARY KEY,
            wa_id TEXT NOT NULL,
            direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
            message_type TEXT NOT NULL DEFAULT 'text',
            text_body TEXT,
            message_id TEXT UNIQUE,
            status TEXT,
            raw_payload JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_whatsapp_chat_messages_wa_time ON whatsapp_chat_messages (wa_id, created_at DESC)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_whatsapp_chat_messages_message_id ON whatsapp_chat_messages (message_id)"
    )


def _insert_whatsapp_chat_message(
    conn,
    *,
    wa_id: str,
    direction: str,
    message_type: str = "text",
    text_body: str | None = None,
    message_id: str | None = None,
    status_name: str | None = None,
    raw_payload: dict | None = None,
    created_at_epoch: str | None = None,
) -> None:
    timestamp_sql = "TO_TIMESTAMP(%s)::timestamptz" if created_at_epoch else "NOW()"
    params: list[object] = [
        wa_id,
        direction,
        message_type,
        text_body,
        message_id,
        status_name,
        json.dumps(raw_payload or {}),
    ]
    if created_at_epoch:
        params.append(created_at_epoch)
    conn.execute(
        f"""
        INSERT INTO whatsapp_chat_messages (
            wa_id,
            direction,
            message_type,
            text_body,
            message_id,
            status,
            raw_payload,
            created_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, CAST(%s AS jsonb), {timestamp_sql})
        ON CONFLICT (message_id) DO UPDATE
        SET
            status = COALESCE(EXCLUDED.status, whatsapp_chat_messages.status),
            raw_payload = COALESCE(EXCLUDED.raw_payload, whatsapp_chat_messages.raw_payload)
        """,
        params,
    )


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


class WhatsAppChatSendRequest(BaseModel):
    wa_id: str
    text: str


@app.get("/whatsapp/chat/conversations")
def list_whatsapp_conversations(limit: int = 50):
    safe_limit = max(1, min(limit, 200))
    with get_connection() as conn:
        _ensure_whatsapp_chat_tables(conn)
        conn.row_factory = dict_row
        rows = conn.execute(
            """
            SELECT DISTINCT ON (wa_id)
                wa_id,
                text_body AS last_text,
                direction AS last_direction,
                status AS last_status,
                created_at AS last_at
            FROM whatsapp_chat_messages
            ORDER BY wa_id, created_at DESC
            """
        ).fetchall()
    rows_sorted = sorted(
        rows,
        key=lambda item: (item.get("last_at").timestamp() if item.get("last_at") else 0),
        reverse=True,
    )
    return rows_sorted[:safe_limit]


@app.get("/whatsapp/chat/messages")
def list_whatsapp_messages(wa_id: str, limit: int = 100):
    if not wa_id.strip():
        raise HTTPException(status_code=400, detail="wa_id requerido")
    safe_limit = max(1, min(limit, 500))
    with get_connection() as conn:
        _ensure_whatsapp_chat_tables(conn)
        conn.row_factory = dict_row
        rows = conn.execute(
            """
            SELECT
                id,
                wa_id,
                direction,
                message_type,
                text_body,
                message_id,
                status,
                created_at,
                raw_payload->>'media_link' AS media_link,
                raw_payload->>'file_name' AS file_name,
                raw_payload->>'media_id' AS media_id
            FROM whatsapp_chat_messages
            WHERE wa_id = %s
            ORDER BY created_at ASC
            LIMIT %s
            """,
            (wa_id.strip(), safe_limit),
        ).fetchall()
    for row in rows:
        if not row.get("media_link") and row.get("media_id"):
            row["media_link"] = f"{settings.whatsapp_pdf_public_base_url.rstrip('/')}/whatsapp/chat/media/{row['media_id']}"
            if not settings.whatsapp_pdf_public_base_url:
                row["media_link"] = f"/whatsapp/chat/media/{row['media_id']}"
    return rows


@app.get("/whatsapp/chat/media/{media_id}")
def get_whatsapp_chat_media(media_id: str):
    if not media_id.strip():
        raise HTTPException(status_code=400, detail="media_id requerido")
    if not settings.whatsapp_access_token:
        raise HTTPException(status_code=503, detail="WHATSAPP_ACCESS_TOKEN no configurado en backend.")
    try:
        info = _fetch_whatsapp_media_info(media_id.strip())
        media_url = str(info.get("url") or "").strip()
        if not media_url:
            raise HTTPException(status_code=404, detail="Media no disponible en Meta.")
        content, content_type = _download_whatsapp_media(media_url)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return Response(content=content, media_type=content_type or "application/octet-stream")


@app.post("/whatsapp/chat/messages")
def send_whatsapp_chat_message(payload: WhatsAppChatSendRequest):
    wa_id = payload.wa_id.strip()
    text = payload.text.strip()
    if not wa_id:
        raise HTTPException(status_code=400, detail="wa_id requerido")
    if not text:
        raise HTTPException(status_code=400, detail="text requerido")
    try:
        meta_response = _send_whatsapp_text_message(to_phone=wa_id, text=text)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    message_id = ((meta_response.get("messages") or [{}])[0] or {}).get("id")
    with get_connection() as conn:
        _ensure_whatsapp_chat_tables(conn)
        _insert_whatsapp_chat_message(
            conn,
            wa_id=wa_id,
            direction="out",
            message_type="text",
            text_body=text,
            message_id=message_id,
            status_name="submitted",
            raw_payload=meta_response,
        )
    return {"ok": True, "wa_id": wa_id, "message_id": message_id, "meta_response": meta_response}


@app.post("/whatsapp/chat/messages/media")
async def send_whatsapp_chat_media_message(
    request: Request,
    wa_id: str = Form(...),
    caption: str = Form(default=""),
    file: UploadFile = File(...),
):
    normalized_wa_id = wa_id.strip()
    if not normalized_wa_id:
        raise HTTPException(status_code=400, detail="wa_id requerido")
    if not file.filename:
        raise HTTPException(status_code=400, detail="Archivo requerido")

    safe_name = Path(file.filename).name
    extension = Path(safe_name).suffix.lower()
    unique_name = f"wa_{uuid4().hex}{extension}"
    upload_dir = app_media_dir / "whatsapp_chat_uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    target_path = upload_dir / unique_name

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Archivo vacío")
    with target_path.open("wb") as out:
        out.write(content)

    public_base = (settings.whatsapp_pdf_public_base_url or "").strip()
    if not public_base:
        public_base = str(request.base_url).rstrip("/")
    else:
        public_base = public_base.rstrip("/")
    media_link = f"{public_base}/media/whatsapp_chat_uploads/{unique_name}"
    media_type = _detect_media_type(file.filename, file.content_type or "")

    try:
        meta_response = _send_whatsapp_media_message(
            to_phone=normalized_wa_id,
            media_type=media_type,
            media_link=media_link,
            caption=caption.strip() or None,
            filename=safe_name,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    message_id = ((meta_response.get("messages") or [{}])[0] or {}).get("id")
    preview_text = f"[{media_type}] {safe_name}"
    if caption.strip():
        preview_text = f"{preview_text}\n{caption.strip()}"
    with get_connection() as conn:
        _ensure_whatsapp_chat_tables(conn)
        _insert_whatsapp_chat_message(
            conn,
            wa_id=normalized_wa_id,
            direction="out",
            message_type=media_type,
            text_body=preview_text,
            message_id=message_id,
            status_name="submitted",
            raw_payload={
                "meta_response": meta_response,
                "media_link": media_link,
                "file_name": safe_name,
            },
        )
    return {
        "ok": True,
        "wa_id": normalized_wa_id,
        "message_id": message_id,
        "media_type": media_type,
        "media_link": media_link,
        "meta_response": meta_response,
    }


@app.post("/webhooks/whatsapp")
async def receive_whatsapp_webhook(request: Request):
    payload = await request.json()
    with get_connection() as conn:
        _ensure_whatsapp_chat_tables(conn)

        entries = payload.get("entry") or []
        for entry in entries:
            for change in entry.get("changes") or []:
                value = change.get("value") or {}

                # Incoming user messages.
                messages = value.get("messages") or []
                for message in messages:
                    wa_id = str(message.get("from") or "").strip()
                    message_type = str(message.get("type") or "unknown").strip()
                    body_text = ((message.get("text") or {}).get("body") or "").strip()
                    media_block = message.get(message_type) if message_type in {"image", "video", "audio", "document"} else {}
                    media_id = str((media_block or {}).get("id") or "").strip() or None
                    if not body_text and message_type in {"image", "video", "audio", "document"}:
                        caption = ((media_block or {}).get("caption") or "").strip()
                        body_text = caption or f"[{message_type}]"
                    message_id = str(message.get("id") or "").strip() or None
                    timestamp = str(message.get("timestamp") or "").strip() or None
                    if not wa_id:
                        continue
                    payload_to_store = dict(message)
                    if media_id:
                        payload_to_store["media_id"] = media_id
                    _insert_whatsapp_chat_message(
                        conn,
                        wa_id=wa_id,
                        direction="in",
                        message_type=message_type,
                        text_body=body_text,
                        message_id=message_id,
                        status_name="received",
                        raw_payload=payload_to_store,
                        created_at_epoch=timestamp,
                    )

                # Delivery/read statuses for outbound messages.
                statuses = value.get("statuses") or []
                for status_item in statuses:
                    message_id = str(status_item.get("id") or "").strip() or None
                    if not message_id:
                        continue
                    recipient_id = str(status_item.get("recipient_id") or "").strip() or "desconocido"
                    status_name = str(status_item.get("status") or "").strip() or "unknown"
                    timestamp = str(status_item.get("timestamp") or "").strip() or None
                    _insert_whatsapp_chat_message(
                        conn,
                        wa_id=recipient_id,
                        direction="out",
                        message_type="status",
                        text_body=None,
                        message_id=message_id,
                        status_name=status_name,
                        raw_payload=status_item,
                        created_at_epoch=timestamp,
                    )

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
                    meta_response = _send_whatsapp_text_message(to_phone=to_phone, text=reply)
                    message_id = ((meta_response.get("messages") or [{}])[0] or {}).get("id")
                    with get_connection() as conn:
                        _ensure_whatsapp_chat_tables(conn)
                        _insert_whatsapp_chat_message(
                            conn,
                            wa_id=to_phone,
                            direction="out",
                            message_type="text",
                            text_body=reply,
                            message_id=message_id,
                            status_name="submitted",
                            raw_payload=meta_response,
                        )
                except Exception as exc:
                    print(f"[whatsapp-webhook] auto-reply error to={to_phone}: {exc}")
    return {"received": True}
