import re
from io import BytesIO
from pathlib import Path
from uuid import uuid4
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
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


def _safe_token(value: str, fallback: str = "archivo") -> str:
    raw = (value or "").strip()
    if not raw:
        return fallback
    token = re.sub(r"\s+", "_", raw)
    token = re.sub(r"[^A-Za-z0-9_.-]", "", token)
    return token or fallback


@router.post("", status_code=status.HTTP_201_CREATED)
def create_expediente(payload: dict):
    reporte_siniestro = (payload.get("reporte_siniestro") or "").strip()
    if not reporte_siniestro:
        raise HTTPException(status_code=400, detail="reporte_siniestro requerido")

    with get_connection() as conn:
        expediente_id = _ensure_expediente(conn, reporte_siniestro)

    return {"id": expediente_id, "reporte_siniestro": reporte_siniestro}


@router.get("")
def list_expedientes(query: str = Query(default="", max_length=120), limit: int = Query(default=100, ge=1, le=500)):
    search = (query or "").strip()

    with get_connection() as conn:
        conn.row_factory = dict_row
        rows = conn.execute(
            """
            SELECT
                e.id,
                e.reporte_siniestro,
                e.created_at,
                COUNT(a.id)::int AS archivos_total,
                MAX(a.created_at) AS ultima_actividad
            FROM expedientes e
            LEFT JOIN expediente_archivos a ON a.expediente_id = e.id
            WHERE (%s = '' OR e.reporte_siniestro ILIKE %s)
            GROUP BY e.id, e.reporte_siniestro, e.created_at
            ORDER BY COALESCE(MAX(a.created_at), e.created_at) DESC
            LIMIT %s
            """,
            (search, f"%{search}%", limit),
        ).fetchall()

    return rows


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


@router.delete("/archivos/{archivo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expediente_archivo(archivo_id: int):
    with get_connection() as conn:
        conn.row_factory = dict_row
        row = conn.execute(
            """
            SELECT id, archivo_path
            FROM expediente_archivos
            WHERE id = %s
            LIMIT 1
            """,
            (archivo_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Archivo no encontrado")

        conn.execute("DELETE FROM expediente_archivos WHERE id = %s", (archivo_id,))

    relative_path = (row.get("archivo_path") or "").strip()
    if relative_path:
        app_root = Path(__file__).resolve().parent.parent.parent
        disk_path = app_root / relative_path.lstrip("/")
        if disk_path.exists() and disk_path.is_file():
            disk_path.unlink()

    return None


@router.get("/{reporte_siniestro}/download")
def download_expediente_zip(reporte_siniestro: str):
    reporte_siniestro = (reporte_siniestro or "").strip()
    if not reporte_siniestro:
        raise HTTPException(status_code=400, detail="reporte_siniestro requerido")

    with get_connection() as conn:
        conn.row_factory = dict_row
        expediente = conn.execute(
            "SELECT id, reporte_siniestro FROM expedientes WHERE reporte_siniestro = %s",
            (reporte_siniestro,),
        ).fetchone()
        if not expediente:
            raise HTTPException(status_code=404, detail="Expediente no encontrado")

        rows = conn.execute(
            """
            SELECT id, tipo, archivo_path, archivo_nombre
            FROM expediente_archivos
            WHERE expediente_id = %s
            ORDER BY created_at ASC
            """,
            (expediente["id"],),
        ).fetchall()

    if not rows:
        raise HTTPException(status_code=404, detail="No hay archivos para descargar")

    app_root = Path(__file__).resolve().parent.parent.parent
    buffer = BytesIO()
    added = 0

    with ZipFile(buffer, "w", compression=ZIP_DEFLATED) as zip_file:
        for index, row in enumerate(rows, start=1):
            relative_path = (row.get("archivo_path") or "").strip()
            if not relative_path:
                continue

            disk_path = app_root / relative_path.lstrip("/")
            if not disk_path.exists() or not disk_path.is_file():
                continue

            original_name = row.get("archivo_nombre") or disk_path.name
            safe_original = _safe_token(original_name, fallback=f"archivo_{index}")
            safe_tipo = _safe_token(row.get("tipo") or "archivo", fallback="archivo")
            arcname = f"{index:03d}_{safe_tipo}_{safe_original}"
            zip_file.write(disk_path, arcname=arcname)
            added += 1

    if added == 0:
        raise HTTPException(status_code=404, detail="No se encontraron archivos físicos para comprimir")

    buffer.seek(0)
    zip_name = f"Expediente_{_safe_token(expediente['reporte_siniestro'], fallback='sin_folio')}.zip"
    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{zip_name}"'},
    )
