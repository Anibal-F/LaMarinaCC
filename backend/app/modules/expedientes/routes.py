import re
import json
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
    "paquete_pieza_foto",
}

ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".mp4", ".mov", ".webm"}
ALLOWED_CATEGORIAS = {
    "frontal",
    "trasera",
    "lateral_izquierdo",
    "lateral_derecho",
    "interior",
    "motor",
    "otros",
}


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


def _expedientes_media_root() -> Path:
    return Path(__file__).resolve().parent.parent.parent / "media" / "expedientes"


def _ensure_categoria_column(conn):
    conn.execute(
        """
        ALTER TABLE expediente_archivos
        ADD COLUMN IF NOT EXISTS categoria VARCHAR(40)
        """
    )


def _ensure_anotaciones_column(conn):
    conn.execute(
        """
        ALTER TABLE expediente_archivos
        ADD COLUMN IF NOT EXISTS anotaciones JSONB NOT NULL DEFAULT '[]'::jsonb
        """
    )


def _sanitize_annotations(value):
    def _to_float(raw, default=0.0):
        try:
            return float(raw)
        except (TypeError, ValueError):
            return float(default)

    if not isinstance(value, list):
        return []

    clean = []
    for raw in value:
        if not isinstance(raw, dict):
            continue
        annotation_id = str(raw.get("id") or "").strip()
        annotation_type = str(raw.get("type") or "").strip().lower()
        if not annotation_id:
            continue
        if annotation_type not in {"square", "circle", "arrow", "line"}:
            annotation_type = "square"
        clean.append(
            {
                "id": annotation_id,
                "type": annotation_type,
                "label": str(raw.get("label") or "").strip()[:120],
                "x": max(0.0, min(100.0, _to_float(raw.get("x"), 0))),
                "y": max(0.0, min(100.0, _to_float(raw.get("y"), 0))),
                "w": max(1.0, min(100.0, _to_float(raw.get("w"), 1))),
                "h": max(1.0, min(100.0, _to_float(raw.get("h"), 1))),
                "rotation": _to_float(raw.get("rotation"), 0),
            }
        )

    return clean


def copy_paquete_media_to_expediente(conn, reporte_siniestro: str, paquete_id: int) -> list:
    """
    Copia las fotos de un paquete al expediente del reporte/siniestro.
    Se utiliza cuando un paquete se marca como 'Completado'.
    Las fotos se guardan en la carpeta "Recepción Piezas" dentro del expediente.
    
    Returns:
        Lista de rutas de archivos copiados
    """
    from pathlib import Path
    from uuid import uuid4
    import shutil
    
    conn.row_factory = dict_row
    
    # Obtener las fotos del paquete
    media_rows = conn.execute(
        """
        SELECT id, media_type, file_path, original_name, mime_type, file_size
        FROM paquetes_piezas_media
        WHERE paquete_id = %s AND media_type = 'photo'
        """,
        (paquete_id,),
    ).fetchall()
    
    if not media_rows:
        return []
    
    # Asegurar que existe el expediente
    expediente_id = _ensure_expediente(conn, reporte_siniestro)
    
    # Directorio destino en expedientes - Carpeta "Recepción Piezas"
    media_root = Path(__file__).resolve().parent.parent.parent / "media" / "expedientes" / reporte_siniestro / "Recepción Piezas"
    media_root.mkdir(parents=True, exist_ok=True)
    
    # Directorio origen de paquetes
    paquetes_root = Path(__file__).resolve().parent.parent.parent / "media" / "paquetes_piezas" / str(paquete_id)
    
    copied_files = []
    
    for media in media_rows:
        source_path = paquetes_root / Path(media["file_path"]).name
        
        if not source_path.exists():
            # Intentar con la ruta completa
            source_path = Path(__file__).resolve().parent.parent.parent / str(media["file_path"]).lstrip("/")
        
        if not source_path.exists():
            continue
        
        # Generar nombre único para el archivo
        extension = Path(media["file_path"]).suffix.lower()
        filename = f"recepcion_piezas_{uuid4().hex}{extension}"
        dest_path = media_root / filename
        
        # Copiar archivo
        try:
            shutil.copy2(source_path, dest_path)
        except Exception:
            continue
        
        file_size = dest_path.stat().st_size
        relative_path = f"/media/expedientes/{reporte_siniestro}/Recepción Piezas/{filename}"
        
        # Crear registro en expediente_archivos
        conn.execute(
            """
            INSERT INTO expediente_archivos (
                expediente_id,
                tipo,
                categoria,
                archivo_path,
                archivo_nombre,
                archivo_size,
                mime_type,
                anotaciones
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, '[]'::jsonb)
            """,
            (
                expediente_id,
                "recepcion_piezas",
                "otros",
                relative_path,
                media["original_name"] or f"foto_paquete_{media['id']}",
                file_size,
                media["mime_type"] or "image/jpeg",
            ),
        )
        
        copied_files.append(relative_path)
    
    return copied_files


@router.post("", status_code=status.HTTP_201_CREATED)
def create_expediente(payload: dict):
    reporte_siniestro = (payload.get("reporte_siniestro") or "").strip()
    if not reporte_siniestro:
        raise HTTPException(status_code=400, detail="reporte_siniestro requerido")

    with get_connection() as conn:
        expediente_id = _ensure_expediente(conn, reporte_siniestro)

    return {"id": expediente_id, "reporte_siniestro": reporte_siniestro}


@router.put("/{expediente_id}")
def update_expediente(expediente_id: int, payload: dict):
    reporte_siniestro = (payload.get("reporte_siniestro") or "").strip()
    if not reporte_siniestro:
        raise HTTPException(status_code=400, detail="reporte_siniestro requerido")

    with get_connection() as conn:
        conn.row_factory = dict_row
        expediente = conn.execute(
            "SELECT id, reporte_siniestro, created_at FROM expedientes WHERE id = %s LIMIT 1",
            (expediente_id,),
        ).fetchone()
        if not expediente:
            raise HTTPException(status_code=404, detail="Expediente no encontrado")

        duplicate = conn.execute(
            """
            SELECT id
            FROM expedientes
            WHERE LOWER(reporte_siniestro) = LOWER(%s) AND id <> %s
            LIMIT 1
            """,
            (reporte_siniestro, expediente_id),
        ).fetchone()
        if duplicate:
            raise HTTPException(status_code=409, detail="Ya existe un expediente con ese reporte/siniestro")

        current_report = str(expediente["reporte_siniestro"] or "").strip()
        if current_report != reporte_siniestro:
            archivo_rows = conn.execute(
                """
                SELECT id, archivo_path
                FROM expediente_archivos
                WHERE expediente_id = %s
                """,
                (expediente_id,),
            ).fetchall()

            media_root = _expedientes_media_root()
            source_dir = media_root / current_report
            target_dir = media_root / reporte_siniestro
            if source_dir.exists() and source_dir.is_dir():
                target_dir.parent.mkdir(parents=True, exist_ok=True)
                if target_dir.exists():
                    raise HTTPException(
                        status_code=409,
                        detail="Ya existe una carpeta de archivos para ese reporte/siniestro",
                    )
                source_dir.rename(target_dir)

            for row in archivo_rows:
                current_path = str(row.get("archivo_path") or "").strip()
                if not current_path:
                    continue
                next_path = current_path.replace(
                    f"/media/expedientes/{current_report}/",
                    f"/media/expedientes/{reporte_siniestro}/",
                    1,
                )
                conn.execute(
                    "UPDATE expediente_archivos SET archivo_path = %s WHERE id = %s",
                    (next_path, row["id"]),
                )

        updated = conn.execute(
            """
            UPDATE expedientes
            SET reporte_siniestro = %s
            WHERE id = %s
            RETURNING id, reporte_siniestro, created_at
            """,
            (reporte_siniestro, expediente_id),
        ).fetchone()

    return updated


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


@router.delete("/{expediente_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expediente(expediente_id: int):
    with get_connection() as conn:
        conn.row_factory = dict_row
        expediente = conn.execute(
            "SELECT id, reporte_siniestro FROM expedientes WHERE id = %s LIMIT 1",
            (expediente_id,),
        ).fetchone()
        if not expediente:
            raise HTTPException(status_code=404, detail="Expediente no encontrado")

        archivos = conn.execute(
            """
            SELECT id, archivo_path
            FROM expediente_archivos
            WHERE expediente_id = %s
            """,
            (expediente_id,),
        ).fetchall()

        conn.execute("DELETE FROM expediente_archivos WHERE expediente_id = %s", (expediente_id,))
        conn.execute("DELETE FROM expedientes WHERE id = %s", (expediente_id,))

    app_root = Path(__file__).resolve().parent.parent.parent
    for row in archivos:
        relative_path = str(row.get("archivo_path") or "").strip()
        if not relative_path:
            continue
        disk_path = app_root / relative_path.lstrip("/")
        if disk_path.exists() and disk_path.is_file():
            try:
                disk_path.unlink()
            except Exception:
                pass

    media_folder = _expedientes_media_root() / str(expediente["reporte_siniestro"] or "").strip()
    if media_folder.exists() and media_folder.is_dir():
        for child in sorted(media_folder.rglob("*"), reverse=True):
            try:
                if child.is_file():
                    child.unlink()
                elif child.is_dir():
                    child.rmdir()
            except Exception:
                pass
        try:
            media_folder.rmdir()
        except Exception:
            pass

    return None


@router.get("/{reporte_siniestro}")
def get_expediente(reporte_siniestro: str):
    reporte_siniestro = (reporte_siniestro or "").strip()
    if not reporte_siniestro:
        raise HTTPException(status_code=400, detail="reporte_siniestro requerido")

    with get_connection() as conn:
        _ensure_categoria_column(conn)
        _ensure_anotaciones_column(conn)
        conn.row_factory = dict_row
        expediente = conn.execute(
            "SELECT id, reporte_siniestro, created_at FROM expedientes WHERE reporte_siniestro = %s",
            (reporte_siniestro,),
        ).fetchone()
        if not expediente:
            raise HTTPException(status_code=404, detail="Expediente no encontrado")

        archivos = conn.execute(
            """
            SELECT
                id,
                tipo,
                categoria,
                archivo_path,
                archivo_nombre,
                archivo_size,
                mime_type,
                created_at,
                COALESCE(anotaciones, '[]'::jsonb) AS anotaciones
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
    categoria: str = Form(default="otros"),
    file: UploadFile = File(...),
):
    reporte_siniestro = (reporte_siniestro or "").strip()
    tipo = (tipo or "").strip()
    categoria = (categoria or "otros").strip().lower()
    if not reporte_siniestro:
        raise HTTPException(status_code=400, detail="reporte_siniestro requerido")
    if tipo not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="tipo de archivo inválido")
    if categoria not in ALLOWED_CATEGORIAS:
        categoria = "otros"

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
        _ensure_categoria_column(conn)
        _ensure_anotaciones_column(conn)
        expediente_id = _ensure_expediente(conn, reporte_siniestro)
        conn.execute(
            """
            INSERT INTO expediente_archivos (
                expediente_id,
                tipo,
                categoria,
                archivo_path,
                archivo_nombre,
                archivo_size,
                mime_type,
                anotaciones
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, '[]'::jsonb)
            """,
            (
                expediente_id,
                tipo,
                categoria,
                relative_path,
                file.filename,
                file_size,
                file.content_type,
            ),
        )

    return {
        "reporte_siniestro": reporte_siniestro,
        "tipo": tipo,
        "categoria": categoria,
        "path": relative_path,
        "name": file.filename,
        "size": file_size,
        "anotaciones": [],
    }


@router.put("/archivos/{archivo_id}/anotaciones")
def update_expediente_archivo_anotaciones(archivo_id: int, payload: dict):
    anotaciones = _sanitize_annotations(payload.get("anotaciones"))

    with get_connection() as conn:
        _ensure_anotaciones_column(conn)
        row = conn.execute(
            "SELECT id FROM expediente_archivos WHERE id = %s LIMIT 1",
            (archivo_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Archivo no encontrado")

        conn.execute(
            "UPDATE expediente_archivos SET anotaciones = %s::jsonb WHERE id = %s",
            (json.dumps(anotaciones, ensure_ascii=False), archivo_id),
        )

    return {"archivo_id": archivo_id, "anotaciones": anotaciones}


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
