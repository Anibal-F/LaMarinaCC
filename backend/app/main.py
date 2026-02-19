from fastapi import FastAPI
from fastapi import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from fastapi.responses import FileResponse

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
