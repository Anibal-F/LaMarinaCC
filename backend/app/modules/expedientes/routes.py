from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from psycopg.rows import dict_row

from app.core.db import get_connection


router = APIRouter(prefix="/expedientes", tags=["expedientes"])

ALLOWED_TYPES = {
    "archivoorden_admision",
    "archivo_valuacion",
    "valuacion_foto",
    "archivorecepcion_vehiculo",
    "recepcion_foto",
    "recepcion_video",
}

ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".mp4", ".mov", ".webm"}


def _ensure_expediente(conn, reporte_siniestro: str) -> int:
    conn.row_factory = dict_row
    row = conn.execute(
        "SELECT id FROM expedientes WHERE reporte_siniestro = %s",
        (reporte_siniestro,),
    ).fetchone()
    if row:
        return row["id"]

    row = conn.execute(
        """
        INSERT INTO expedientes (reporte_siniestro)
        VALUES (%s)
        RETURNING id
        """,
        (reporte_siniestro,),
    ).fetchone()
    return row["id"]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_expediente(payload: dict):
    reporte_siniestro = (payload.get("reporte_siniestro") or "").strip()
    if not reporte_siniestro:
        raise HTTPException(status_code=400, detail="reporte_siniestro requerido")

    with get_connection() as conn:
        expediente_id = _ensure_expediente(conn, reporte_siniestro)

    return {"id": expediente_id, "reporte_siniestro": reporte_siniestro}


@router.get("/{reporte_siniestro}")
def get_expediente(reporte_siniestro: str):
    reporte_siniestro = (reporte_siniestro or "").strip()
    if not reporte_siniestro:
        raise HTTPException(status_code=400, detail="reporte_siniestro requerido")

    with get_connection() as conn:
        conn.row_factory = dict_row
        expediente = conn.execute(
            "SELECT id, reporte_siniestro, created_at FROM expedientes WHERE reporte_siniestro = %s",
            (reporte_siniestro,),
        ).fetchone()
        if not expediente:
            raise HTTPException(status_code=404, detail="Expediente no encontrado")

        archivos = conn.execute(
            """
            SELECT id, tipo, archivo_path, archivo_nombre, archivo_size, mime_type, created_at
            FROM expediente_archivos
            WHERE expediente_id = %s
            ORDER BY created_at DESC
            """,
            (expediente["id"],),
        ).fetchall()

    return {"expediente": expediente, "archivos": archivos}


@router.post("/{reporte_siniestro}/archivos", status_code=status.HTTP_201_CREATED)
def upload_expediente_archivo(
    reporte_siniestro: str,
    tipo: str = Form(...),
    file: UploadFile = File(...),
):
    reporte_siniestro = (reporte_siniestro or "").strip()
    tipo = (tipo or "").strip()
    if not reporte_siniestro:
        raise HTTPException(status_code=400, detail="reporte_siniestro requerido")
    if tipo not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="tipo de archivo inválido")

    extension = Path(file.filename or "").suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Formato inválido")

    media_root = Path(__file__).resolve().parent.parent.parent / "media" / "expedientes" / reporte_siniestro / tipo
    media_root.mkdir(parents=True, exist_ok=True)
    filename = f"{tipo}_{uuid4().hex}{extension}"
    file_path = media_root / filename

    with file_path.open("wb") as buffer:
        buffer.write(file.file.read())

    file_size = file_path.stat().st_size
    relative_path = f"/media/expedientes/{reporte_siniestro}/{tipo}/{filename}"

    with get_connection() as conn:
        expediente_id = _ensure_expediente(conn, reporte_siniestro)
        conn.execute(
            """
            INSERT INTO expediente_archivos (
                expediente_id,
                tipo,
                archivo_path,
                archivo_nombre,
                archivo_size,
                mime_type
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                expediente_id,
                tipo,
                relative_path,
                file.filename,
                file_size,
                file.content_type,
            ),
        )

    return {
        "reporte_siniestro": reporte_siniestro,
        "tipo": tipo,
        "path": relative_path,
        "name": file.filename,
        "size": file_size,
    }
