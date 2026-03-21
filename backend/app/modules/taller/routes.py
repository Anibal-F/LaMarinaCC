from typing import Any, List

from fastapi import APIRouter, Body, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from psycopg.rows import dict_row

from app.core.db import get_connection

router = APIRouter(prefix="/taller", tags=["taller"])


class EtapaPayload(BaseModel):
    clave: str = Field(min_length=1, max_length=50)
    nb_etapa: str = Field(min_length=1, max_length=120)
    orden: int = Field(ge=1, le=999)
    activo: bool = True


class ChecklistItemPayload(BaseModel):
    etapa_id: int
    descripcion: str = Field(min_length=1, max_length=255)
    orden: int = Field(default=1, ge=1, le=999)
    obligatorio: bool = True
    activo: bool = True


class AreaPayload(BaseModel):
    nb_area: str = Field(min_length=1, max_length=120)
    etapa_id: int
    capacidad_maxima: int = Field(default=1, ge=1, le=999)
    activo: bool = True


class EstacionPayload(BaseModel):
    area_id: int
    nb_estacion: str = Field(min_length=1, max_length=120)
    tipo_estacion: str | None = Field(default=None, max_length=120)
    estatus: str = Field(default="ACTIVA", min_length=1, max_length=40)
    activo: bool = True


class PuestoPayload(BaseModel):
    nb_puesto: str = Field(min_length=1, max_length=120)
    etapa_id: int
    activo: bool = True


class PersonalPayload(BaseModel):
    nb_personal: str = Field(min_length=1, max_length=150)
    puesto_id: int
    activo: bool = True


class OtEtapaPayload(BaseModel):
    estatus: str | None = Field(default=None, max_length=40)
    progreso: int | None = Field(default=None, ge=0, le=100)
    area_id: int | None = None
    estacion_id: int | None = None
    personal_id_responsable: int | None = None
    fecha_inicio: str | None = None
    fecha_fin: str | None = None


class OtChecklistPayload(BaseModel):
    completado: bool
    completado_por: str | None = Field(default=None, max_length=150)


class OtNotaPayload(BaseModel):
    nota: str = Field(min_length=1, max_length=5000)
    creado_por: str | None = Field(default=None, max_length=150)


class EstacionAsignacionPayload(BaseModel):
    estacion_id: int
    personal_id: int
    recepcion_id: int | None = None
    folio_ot: str | None = Field(default=None, max_length=20)
    etapa_id: int | None = None
    fecha_inicio: str | None = None
    fecha_fin: str | None = None
    activa: bool = True


DEFAULT_STAGES = [
    ("recepcionado", "Recepcionado", 1),
    ("carroceria", "Carroceria", 2),
    ("pintura", "Pintura", 3),
    ("armado", "Armado", 4),
    ("lavado", "Lavado", 5),
    ("entrega", "Entrega", 6),
]

DEFAULT_CHECKLISTS = {
    "recepcionado": [
        ("Validar expediente digital", 1),
        ("Confirmar evidencia inicial", 2),
        ("Liberar unidad a taller", 3),
    ],
    "carroceria": [
        ("Inspeccion de chasis", 1),
        ("Desmontaje de paneles", 2),
        ("Preparacion de superficie", 3),
    ],
    "pintura": [
        ("Empapelado y proteccion", 1),
        ("Aplicacion de base", 2),
        ("Secado y pulido", 3),
    ],
    "armado": [
        ("Montaje de piezas", 1),
        ("Ajustes de claros", 2),
        ("Revision electrica", 3),
    ],
    "lavado": [
        ("Lavado exterior", 1),
        ("Detalle interior", 2),
        ("Inspeccion final", 3),
    ],
    "entrega": [
        ("Confirmar documentos", 1),
        ("Explicar reparacion", 2),
        ("Cerrar orden", 3),
    ],
}


def _ensure_taller_schema() -> None:
    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS taller_etapas (
                id BIGSERIAL PRIMARY KEY,
                clave VARCHAR(50) NOT NULL UNIQUE,
                nb_etapa VARCHAR(120) NOT NULL,
                orden INTEGER NOT NULL,
                activo BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
                CONSTRAINT taller_etapas_orden_unique UNIQUE (orden)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS taller_checklist_items (
                id BIGSERIAL PRIMARY KEY,
                etapa_id BIGINT NOT NULL REFERENCES taller_etapas(id) ON DELETE CASCADE,
                descripcion VARCHAR(255) NOT NULL,
                orden INTEGER NOT NULL DEFAULT 1,
                obligatorio BOOLEAN NOT NULL DEFAULT TRUE,
                activo BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
                CONSTRAINT taller_checklist_items_unique UNIQUE (etapa_id, descripcion)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS taller_areas (
                id BIGSERIAL PRIMARY KEY,
                nb_area VARCHAR(120) NOT NULL,
                etapa_id BIGINT NOT NULL REFERENCES taller_etapas(id) ON DELETE RESTRICT,
                capacidad_maxima INTEGER NOT NULL DEFAULT 1,
                activo BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
                CONSTRAINT taller_areas_unique UNIQUE (nb_area)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS taller_estaciones (
                id BIGSERIAL PRIMARY KEY,
                area_id BIGINT NOT NULL REFERENCES taller_areas(id) ON DELETE CASCADE,
                nb_estacion VARCHAR(120) NOT NULL,
                tipo_estacion VARCHAR(120),
                estatus VARCHAR(40) NOT NULL DEFAULT 'ACTIVA',
                activo BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
                CONSTRAINT taller_estaciones_unique UNIQUE (area_id, nb_estacion)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS taller_puestos (
                id BIGSERIAL PRIMARY KEY,
                nb_puesto VARCHAR(120) NOT NULL,
                etapa_id BIGINT NOT NULL REFERENCES taller_etapas(id) ON DELETE RESTRICT,
                activo BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
                CONSTRAINT taller_puestos_unique UNIQUE (etapa_id, nb_puesto)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS taller_personal (
                id BIGSERIAL PRIMARY KEY,
                nb_personal VARCHAR(150) NOT NULL,
                puesto_id BIGINT NOT NULL REFERENCES taller_puestos(id) ON DELETE RESTRICT,
                activo BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS taller_ot_etapas (
                id BIGSERIAL PRIMARY KEY,
                recepcion_id BIGINT NOT NULL REFERENCES recepciones(id) ON DELETE CASCADE,
                folio_ot VARCHAR(20),
                etapa_id BIGINT NOT NULL REFERENCES taller_etapas(id) ON DELETE RESTRICT,
                estatus VARCHAR(40) NOT NULL DEFAULT 'PENDIENTE',
                progreso INTEGER NOT NULL DEFAULT 0,
                area_id BIGINT REFERENCES taller_areas(id) ON DELETE SET NULL,
                estacion_id BIGINT REFERENCES taller_estaciones(id) ON DELETE SET NULL,
                personal_id_responsable BIGINT REFERENCES taller_personal(id) ON DELETE SET NULL,
                fecha_inicio TIMESTAMP WITHOUT TIME ZONE,
                fecha_fin TIMESTAMP WITHOUT TIME ZONE,
                updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
                created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
                CONSTRAINT taller_ot_etapas_unique UNIQUE (recepcion_id, etapa_id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS taller_ot_checklist (
                id BIGSERIAL PRIMARY KEY,
                ot_etapa_id BIGINT NOT NULL REFERENCES taller_ot_etapas(id) ON DELETE CASCADE,
                checklist_item_id BIGINT NOT NULL REFERENCES taller_checklist_items(id) ON DELETE CASCADE,
                completado BOOLEAN NOT NULL DEFAULT FALSE,
                completado_por VARCHAR(150),
                completado_en TIMESTAMP WITHOUT TIME ZONE,
                created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
                CONSTRAINT taller_ot_checklist_unique UNIQUE (ot_etapa_id, checklist_item_id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS taller_ot_notas (
                id BIGSERIAL PRIMARY KEY,
                ot_etapa_id BIGINT NOT NULL REFERENCES taller_ot_etapas(id) ON DELETE CASCADE,
                nota TEXT NOT NULL,
                creado_por VARCHAR(150),
                created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS taller_estacion_asignaciones (
                id BIGSERIAL PRIMARY KEY,
                estacion_id BIGINT NOT NULL REFERENCES taller_estaciones(id) ON DELETE CASCADE,
                personal_id BIGINT NOT NULL REFERENCES taller_personal(id) ON DELETE CASCADE,
                recepcion_id BIGINT REFERENCES recepciones(id) ON DELETE SET NULL,
                folio_ot VARCHAR(20),
                etapa_id BIGINT REFERENCES taller_etapas(id) ON DELETE SET NULL,
                fecha_inicio TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
                fecha_fin TIMESTAMP WITHOUT TIME ZONE,
                activa BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_taller_ot_etapas_recepcion ON taller_ot_etapas(recepcion_id)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_taller_ot_etapas_estatus ON taller_ot_etapas(estatus)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_taller_estacion_asignaciones_activa ON taller_estacion_asignaciones(estacion_id, activa)"
        )

        for clave, nb_etapa, orden in DEFAULT_STAGES:
            conn.execute(
                """
                INSERT INTO taller_etapas (clave, nb_etapa, orden, activo)
                VALUES (%s, %s, %s, TRUE)
                ON CONFLICT (clave) DO UPDATE
                SET nb_etapa = EXCLUDED.nb_etapa,
                    orden = EXCLUDED.orden
                """,
                (clave, nb_etapa, orden),
            )

        conn.row_factory = dict_row
        etapa_rows = conn.execute("SELECT id, clave FROM taller_etapas").fetchall()
        etapa_ids = {row["clave"]: row["id"] for row in etapa_rows}
        for clave, items in DEFAULT_CHECKLISTS.items():
            etapa_id = etapa_ids.get(clave)
            if not etapa_id:
                continue
            for descripcion, orden in items:
                conn.execute(
                    """
                    INSERT INTO taller_checklist_items (etapa_id, descripcion, orden, obligatorio, activo)
                    VALUES (%s, %s, %s, TRUE, TRUE)
                    ON CONFLICT (etapa_id, descripcion) DO NOTHING
                    """,
                    (etapa_id, descripcion, orden),
                )


def _fetch_catalog_row(sql: str, params: tuple[Any, ...]) -> dict[str, Any]:
    with get_connection() as conn:
        conn.row_factory = dict_row
        row = conn.execute(sql, params).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    return row


def _validate_reference(conn, table: str, item_id: int, detail: str) -> None:
    row = conn.execute(f"SELECT 1 FROM {table} WHERE id = %s LIMIT 1", (item_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=detail)


def _get_recepcion_reference(conn, recepcion_id: int) -> dict[str, Any]:
    conn.row_factory = dict_row
    row = conn.execute(
        """
        SELECT r.id, r.folio_recep, COALESCE(NULLIF(he.folio_ot, ''), r.folio_recep) AS folio_ot
        FROM recepciones r
        LEFT JOIN LATERAL (
            SELECT folio_ot
            FROM historical_entries
            WHERE folio_recep = r.folio_recep
            ORDER BY id DESC
            LIMIT 1
        ) he ON TRUE
        WHERE r.id = %s
        LIMIT 1
        """,
        (recepcion_id,),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Recepcion no encontrada")
    return row


def _get_station_context(conn, estacion_id: int) -> dict[str, Any]:
    conn.row_factory = dict_row
    row = conn.execute(
        """
        SELECT es.id, es.nb_estacion, es.area_id, ta.nb_area, ta.etapa_id, te.nb_etapa, te.clave, te.orden
        FROM taller_estaciones es
        JOIN taller_areas ta ON ta.id = es.area_id
        JOIN taller_etapas te ON te.id = ta.etapa_id
        WHERE es.id = %s
        LIMIT 1
        """,
        (estacion_id,),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Estacion no encontrada")
    return row


def _is_workshop_status(status_value: str | None) -> bool:
    normalized = str(status_value or "").strip().lower()
    if not normalized:
        return True
    return any(value in normalized for value in ("recepcion", "valuacion", "autorizacion", "taller"))


def _sync_assignment_to_ot_stage(
    conn,
    recepcion_id: int | None,
    etapa_id: int | None,
    area_id: int | None,
    estacion_id: int | None,
    personal_id: int | None,
) -> None:
    if recepcion_id is None or etapa_id is None:
        return
    _sync_ot_stages(conn, recepcion_id)
    conn.execute(
        """
        UPDATE taller_ot_etapas
        SET area_id = COALESCE(%s, area_id),
            estacion_id = %s,
            personal_id_responsable = %s,
            fecha_inicio = COALESCE(fecha_inicio, NOW()),
            estatus = CASE
                WHEN UPPER(COALESCE(estatus, '')) = 'PENDIENTE' THEN 'EN_PROCESO'
                ELSE estatus
            END,
            updated_at = NOW()
        WHERE recepcion_id = %s AND etapa_id = %s
        """,
        (area_id, estacion_id, personal_id, recepcion_id, etapa_id),
    )


def _clear_assignment_from_ot_stage(conn, recepcion_id: int | None, etapa_id: int | None, estacion_id: int | None) -> None:
    if recepcion_id is None or etapa_id is None:
        return
    conn.execute(
        """
        UPDATE taller_ot_etapas
        SET estacion_id = CASE WHEN estacion_id = %s THEN NULL ELSE estacion_id END,
            personal_id_responsable = CASE WHEN estacion_id = %s THEN NULL ELSE personal_id_responsable END,
            updated_at = NOW()
        WHERE recepcion_id = %s AND etapa_id = %s
        """,
        (estacion_id, estacion_id, recepcion_id, etapa_id),
    )


def _sync_ot_stages(conn, recepcion_id: int) -> list[dict[str, Any]]:
    reference = _get_recepcion_reference(conn, recepcion_id)
    conn.execute(
        """
        INSERT INTO taller_ot_etapas (recepcion_id, folio_ot, etapa_id, estatus, progreso)
        SELECT %s, %s, te.id,
               CASE WHEN te.clave = 'recepcionado' THEN 'EN_PROCESO' ELSE 'PENDIENTE' END,
               CASE WHEN te.clave = 'recepcionado' THEN 10 ELSE 0 END
        FROM taller_etapas te
        WHERE te.activo = TRUE
        ON CONFLICT (recepcion_id, etapa_id) DO NOTHING
        """,
        (recepcion_id, reference["folio_ot"]),
    )
    conn.row_factory = dict_row
    return conn.execute(
        """
        SELECT ote.id, ote.recepcion_id, ote.folio_ot, ote.etapa_id, te.clave, te.nb_etapa, te.orden,
               ote.estatus, ote.progreso, ote.area_id, a.nb_area,
               ote.estacion_id, es.nb_estacion,
               ote.personal_id_responsable, p.nb_personal AS personal_responsable,
               ote.fecha_inicio, ote.fecha_fin, ote.updated_at
        FROM taller_ot_etapas ote
        JOIN taller_etapas te ON te.id = ote.etapa_id
        LEFT JOIN taller_areas a ON a.id = ote.area_id
        LEFT JOIN taller_estaciones es ON es.id = ote.estacion_id
        LEFT JOIN taller_personal p ON p.id = ote.personal_id_responsable
        WHERE ote.recepcion_id = %s
        ORDER BY te.orden ASC
        """,
        (recepcion_id,),
    ).fetchall()


def _get_ot_stage(conn, recepcion_id: int, etapa_id: int) -> dict[str, Any]:
    conn.row_factory = dict_row
    row = conn.execute(
        """
        SELECT ote.id, ote.recepcion_id, ote.folio_ot, ote.etapa_id, te.clave, te.nb_etapa, te.orden,
               ote.estatus, ote.progreso, ote.area_id, a.nb_area,
               ote.estacion_id, es.nb_estacion,
               ote.personal_id_responsable, p.nb_personal AS personal_responsable,
               ote.fecha_inicio, ote.fecha_fin, ote.updated_at
        FROM taller_ot_etapas ote
        JOIN taller_etapas te ON te.id = ote.etapa_id
        LEFT JOIN taller_areas a ON a.id = ote.area_id
        LEFT JOIN taller_estaciones es ON es.id = ote.estacion_id
        LEFT JOIN taller_personal p ON p.id = ote.personal_id_responsable
        WHERE ote.recepcion_id = %s AND ote.etapa_id = %s
        LIMIT 1
        """,
        (recepcion_id, etapa_id),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Etapa de OT no encontrada")
    return row


def _sync_ot_checklist(conn, ot_etapa_id: int, etapa_id: int) -> list[dict[str, Any]]:
    conn.execute(
        """
        INSERT INTO taller_ot_checklist (ot_etapa_id, checklist_item_id)
        SELECT %s, tci.id
        FROM taller_checklist_items tci
        WHERE tci.etapa_id = %s AND tci.activo = TRUE
        ON CONFLICT (ot_etapa_id, checklist_item_id) DO NOTHING
        """,
        (ot_etapa_id, etapa_id),
    )
    conn.row_factory = dict_row
    return conn.execute(
        """
        SELECT toc.id, toc.ot_etapa_id, toc.checklist_item_id, tci.descripcion, tci.orden,
               tci.obligatorio, toc.completado, toc.completado_por, toc.completado_en
        FROM taller_ot_checklist toc
        JOIN taller_checklist_items tci ON tci.id = toc.checklist_item_id
        WHERE toc.ot_etapa_id = %s
        ORDER BY tci.orden ASC, toc.id ASC
        """,
        (ot_etapa_id,),
    ).fetchall()


@router.get("/health")
def health_check():
    _ensure_taller_schema()
    return {"module": "taller", "status": "ok"}


@router.get("/catalogos/bootstrap")
def get_taller_bootstrap():
    _ensure_taller_schema()
    with get_connection() as conn:
        conn.row_factory = dict_row
        etapas = conn.execute(
            "SELECT id, clave, nb_etapa, orden, activo, created_at FROM taller_etapas ORDER BY orden ASC"
        ).fetchall()
        checklist = conn.execute(
            """
            SELECT tci.id, tci.etapa_id, te.nb_etapa, te.clave, tci.descripcion, tci.orden, tci.obligatorio, tci.activo, tci.created_at
            FROM taller_checklist_items tci
            JOIN taller_etapas te ON te.id = tci.etapa_id
            ORDER BY te.orden ASC, tci.orden ASC
            """
        ).fetchall()
        areas = conn.execute(
            """
            SELECT ta.id, ta.nb_area, ta.etapa_id, te.nb_etapa, te.clave, ta.capacidad_maxima, ta.activo, ta.created_at
            FROM taller_areas ta
            JOIN taller_etapas te ON te.id = ta.etapa_id
            ORDER BY te.orden ASC, ta.nb_area ASC
            """
        ).fetchall()
        estaciones = conn.execute(
            """
            SELECT ts.id, ts.area_id, ta.nb_area, ts.nb_estacion, ts.tipo_estacion, ts.estatus, ts.activo, ts.created_at
            FROM taller_estaciones ts
            JOIN taller_areas ta ON ta.id = ts.area_id
            ORDER BY ta.nb_area ASC, ts.nb_estacion ASC
            """
        ).fetchall()
        puestos = conn.execute(
            """
            SELECT tp.id, tp.nb_puesto, tp.etapa_id, te.nb_etapa, te.clave, tp.activo, tp.created_at
            FROM taller_puestos tp
            JOIN taller_etapas te ON te.id = tp.etapa_id
            ORDER BY te.orden ASC, tp.nb_puesto ASC
            """
        ).fetchall()
        personal = conn.execute(
            """
            SELECT tper.id, tper.nb_personal, tper.puesto_id, tp.nb_puesto, tp.etapa_id, te.nb_etapa, tper.activo, tper.created_at
            FROM taller_personal tper
            JOIN taller_puestos tp ON tp.id = tper.puesto_id
            JOIN taller_etapas te ON te.id = tp.etapa_id
            ORDER BY tper.nb_personal ASC
            """
        ).fetchall()

    return {
        "etapas": etapas,
        "checklist_items": checklist,
        "areas": areas,
        "estaciones": estaciones,
        "puestos": puestos,
        "personal": personal,
    }


@router.get("/catalogos/etapas")
def list_etapas(activo: bool | None = None):
    _ensure_taller_schema()
    where_clause = ""
    params: list[Any] = []
    if activo is not None:
        where_clause = "WHERE activo = %s"
        params.append(activo)

    with get_connection() as conn:
        conn.row_factory = dict_row
        rows = conn.execute(
            f"""
            SELECT id, clave, nb_etapa, orden, activo, created_at
            FROM taller_etapas
            {where_clause}
            ORDER BY orden ASC
            """,
            tuple(params),
        ).fetchall()
    return rows


@router.post("/catalogos/etapas", status_code=status.HTTP_201_CREATED)
def create_etapa(payload: EtapaPayload):
    _ensure_taller_schema()
    with get_connection() as conn:
        exists = conn.execute(
            "SELECT 1 FROM taller_etapas WHERE LOWER(clave) = LOWER(%s) OR LOWER(nb_etapa) = LOWER(%s) LIMIT 1",
            (payload.clave.strip(), payload.nb_etapa.strip()),
        ).fetchone()
        if exists:
            raise HTTPException(status_code=409, detail="La etapa ya existe")

        conn.row_factory = dict_row
        row = conn.execute(
            """
            INSERT INTO taller_etapas (clave, nb_etapa, orden, activo)
            VALUES (%s, %s, %s, %s)
            RETURNING id, clave, nb_etapa, orden, activo, created_at
            """,
            (payload.clave.strip(), payload.nb_etapa.strip(), payload.orden, payload.activo),
        ).fetchone()
    return row


@router.put("/catalogos/etapas/{etapa_id}")
def update_etapa(etapa_id: int, payload: EtapaPayload):
    _ensure_taller_schema()
    with get_connection() as conn:
        conn.row_factory = dict_row
        row = conn.execute(
            """
            UPDATE taller_etapas
            SET clave = %s, nb_etapa = %s, orden = %s, activo = %s
            WHERE id = %s
            RETURNING id, clave, nb_etapa, orden, activo, created_at
            """,
            (payload.clave.strip(), payload.nb_etapa.strip(), payload.orden, payload.activo, etapa_id),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Etapa no encontrada")
    return row


@router.post("/catalogos/etapas/reordenar", response_model=None)
async def reorder_etapas(request: Request):
    """Reordena las etapas. Acepta un array de IDs o un objeto {ordered_ids: [...]}."""
    _ensure_taller_schema()
    
    # Obtener el body crudo como JSON
    try:
        body = await request.json()
        print(f"[reorder_etapas] Body recibido: {body}", flush=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error parseando JSON: {e}")
    
    # Extraer los IDs del body
    if isinstance(body, list):
        ordered_ids = body
    elif isinstance(body, dict):
        if 'ordered_ids' in body:
            ordered_ids = body['ordered_ids']
        else:
            raise HTTPException(status_code=400, detail="Se esperaba {ordered_ids: [...]} o un array")
    else:
        raise HTTPException(status_code=400, detail="Body inválido")
    
    # Convertir IDs a enteros
    try:
        parsed_ids = []
        for item_id in ordered_ids:
            if item_id is None:
                continue
            if isinstance(item_id, dict):
                item_id = item_id.get('id', item_id.get('ID'))
            if item_id is not None and str(item_id).strip() != '':
                parsed_ids.append(int(item_id))
    except (ValueError, TypeError) as e:
        raise HTTPException(status_code=400, detail=f"IDs inválidos: {e}")
    
    print(f"[reorder_etapas] IDs parseados: {parsed_ids}", flush=True)
    
    if len(parsed_ids) == 0:
        raise HTTPException(status_code=400, detail="La lista de etapas está vacía")
    
    if len(set(parsed_ids)) != len(parsed_ids):
        raise HTTPException(status_code=400, detail="La lista contiene duplicados")

    conn = get_connection()
    try:
        conn.row_factory = dict_row
        
        # Desactivar autocommit para manejar la transacción manualmente
        conn.autocommit = False
        
        try:
            # Verificar que tenemos todas las etapas
            current_rows = conn.execute(
                "SELECT id FROM taller_etapas ORDER BY orden ASC"
            ).fetchall()
            current_ids = [int(row["id"]) for row in current_rows]
            if set(current_ids) != set(parsed_ids):
                conn.rollback()
                raise HTTPException(status_code=400, detail="Debes enviar todas las etapas")

            # Usar un offset muy grande para evitar conflictos con el constraint unique
            offset = 100000
            
            # Paso 1: Mover todo al offset (valores temporales altos)
            for index, etapa_id in enumerate(parsed_ids, start=1):
                conn.execute(
                    "UPDATE taller_etapas SET orden = %s WHERE id = %s",
                    (offset + index, etapa_id),
                )
            
            # Paso 2: Asignar el orden final correcto
            for index, etapa_id in enumerate(parsed_ids, start=1):
                conn.execute(
                    "UPDATE taller_etapas SET orden = %s WHERE id = %s",
                    (index, etapa_id),
                )
            
            conn.commit()
            
            rows = conn.execute(
                "SELECT id, clave, nb_etapa, orden, activo, created_at FROM taller_etapas ORDER BY orden ASC"
            ).fetchall()
            return rows
            
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            conn.autocommit = True
            conn.close()
    except Exception as e:
        if hasattr(conn, 'close'):
            conn.close()
        raise


@router.delete("/catalogos/etapas/{etapa_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_etapa(etapa_id: int):
    _ensure_taller_schema()
    with get_connection() as conn:
        result = conn.execute("DELETE FROM taller_etapas WHERE id = %s", (etapa_id,))
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Etapa no encontrada")
    return None


@router.get("/catalogos/checklist-items")
def list_checklist_items(etapa_id: int | None = None, activo: bool | None = None):
    _ensure_taller_schema()
    filters: list[str] = []
    params: list[Any] = []
    if etapa_id is not None:
        filters.append("tci.etapa_id = %s")
        params.append(etapa_id)
    if activo is not None:
        filters.append("tci.activo = %s")
        params.append(activo)
    where_clause = f"WHERE {' AND '.join(filters)}" if filters else ""

    with get_connection() as conn:
        conn.row_factory = dict_row
        rows = conn.execute(
            f"""
            SELECT tci.id, tci.etapa_id, te.nb_etapa, te.clave, tci.descripcion, tci.orden,
                   tci.obligatorio, tci.activo, tci.created_at
            FROM taller_checklist_items tci
            JOIN taller_etapas te ON te.id = tci.etapa_id
            {where_clause}
            ORDER BY te.orden ASC, tci.orden ASC
            """,
            tuple(params),
        ).fetchall()
    return rows


@router.post("/catalogos/checklist-items", status_code=status.HTTP_201_CREATED)
def create_checklist_item(payload: ChecklistItemPayload):
    _ensure_taller_schema()
    with get_connection() as conn:
        _validate_reference(conn, "taller_etapas", payload.etapa_id, "Etapa no encontrada")
        conn.row_factory = dict_row
        row = conn.execute(
            """
            INSERT INTO taller_checklist_items (etapa_id, descripcion, orden, obligatorio, activo)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, etapa_id, descripcion, orden, obligatorio, activo, created_at
            """,
            (
                payload.etapa_id,
                payload.descripcion.strip(),
                payload.orden,
                payload.obligatorio,
                payload.activo,
            ),
        ).fetchone()
    return row


@router.put("/catalogos/checklist-items/{item_id}")
def update_checklist_item(item_id: int, payload: ChecklistItemPayload):
    _ensure_taller_schema()
    with get_connection() as conn:
        _validate_reference(conn, "taller_etapas", payload.etapa_id, "Etapa no encontrada")
        conn.row_factory = dict_row
        row = conn.execute(
            """
            UPDATE taller_checklist_items
            SET etapa_id = %s, descripcion = %s, orden = %s, obligatorio = %s, activo = %s
            WHERE id = %s
            RETURNING id, etapa_id, descripcion, orden, obligatorio, activo, created_at
            """,
            (
                payload.etapa_id,
                payload.descripcion.strip(),
                payload.orden,
                payload.obligatorio,
                payload.activo,
                item_id,
            ),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Item de checklist no encontrado")
    return row


@router.delete("/catalogos/checklist-items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_checklist_item(item_id: int):
    _ensure_taller_schema()
    with get_connection() as conn:
        result = conn.execute("DELETE FROM taller_checklist_items WHERE id = %s", (item_id,))
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Item de checklist no encontrado")
    return None


@router.get("/catalogos/areas")
def list_areas(etapa_id: int | None = None, activo: bool | None = None):
    _ensure_taller_schema()
    filters: list[str] = []
    params: list[Any] = []
    if etapa_id is not None:
        filters.append("ta.etapa_id = %s")
        params.append(etapa_id)
    if activo is not None:
        filters.append("ta.activo = %s")
        params.append(activo)
    where_clause = f"WHERE {' AND '.join(filters)}" if filters else ""
    with get_connection() as conn:
        conn.row_factory = dict_row
        rows = conn.execute(
            f"""
            SELECT ta.id, ta.nb_area, ta.etapa_id, te.nb_etapa, te.clave, ta.capacidad_maxima, ta.activo, ta.created_at
            FROM taller_areas ta
            JOIN taller_etapas te ON te.id = ta.etapa_id
            {where_clause}
            ORDER BY te.orden ASC, ta.nb_area ASC
            """,
            tuple(params),
        ).fetchall()
    return rows


@router.post("/catalogos/areas", status_code=status.HTTP_201_CREATED)
def create_area(payload: AreaPayload):
    _ensure_taller_schema()
    with get_connection() as conn:
        _validate_reference(conn, "taller_etapas", payload.etapa_id, "Etapa no encontrada")
        conn.row_factory = dict_row
        row = conn.execute(
            """
            INSERT INTO taller_areas (nb_area, etapa_id, capacidad_maxima, activo)
            VALUES (%s, %s, %s, %s)
            RETURNING id, nb_area, etapa_id, capacidad_maxima, activo, created_at
            """,
            (payload.nb_area.strip(), payload.etapa_id, payload.capacidad_maxima, payload.activo),
        ).fetchone()
    return row


@router.put("/catalogos/areas/{area_id}")
def update_area(area_id: int, payload: AreaPayload):
    _ensure_taller_schema()
    with get_connection() as conn:
        _validate_reference(conn, "taller_etapas", payload.etapa_id, "Etapa no encontrada")
        conn.row_factory = dict_row
        row = conn.execute(
            """
            UPDATE taller_areas
            SET nb_area = %s, etapa_id = %s, capacidad_maxima = %s, activo = %s
            WHERE id = %s
            RETURNING id, nb_area, etapa_id, capacidad_maxima, activo, created_at
            """,
            (payload.nb_area.strip(), payload.etapa_id, payload.capacidad_maxima, payload.activo, area_id),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Area no encontrada")
    return row


@router.delete("/catalogos/areas/{area_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_area(area_id: int):
    _ensure_taller_schema()
    with get_connection() as conn:
        result = conn.execute("DELETE FROM taller_areas WHERE id = %s", (area_id,))
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Area no encontrada")
    return None


@router.get("/catalogos/estaciones")
def list_estaciones(area_id: int | None = None, activo: bool | None = None):
    _ensure_taller_schema()
    filters: list[str] = []
    params: list[Any] = []
    if area_id is not None:
        filters.append("ts.area_id = %s")
        params.append(area_id)
    if activo is not None:
        filters.append("ts.activo = %s")
        params.append(activo)
    where_clause = f"WHERE {' AND '.join(filters)}" if filters else ""

    with get_connection() as conn:
        conn.row_factory = dict_row
        rows = conn.execute(
            f"""
            SELECT ts.id, ts.area_id, ta.nb_area, ts.nb_estacion, ts.tipo_estacion, ts.estatus, ts.activo, ts.created_at,
                   CASE
                     WHEN EXISTS (
                       SELECT 1
                       FROM taller_estacion_asignaciones tea
                       WHERE tea.estacion_id = ts.id AND tea.activa = TRUE
                     ) THEN 'OCUPADA'
                     ELSE 'LIBRE'
                   END AS ocupacion_actual
            FROM taller_estaciones ts
            JOIN taller_areas ta ON ta.id = ts.area_id
            {where_clause}
            ORDER BY ta.nb_area ASC, ts.nb_estacion ASC
            """,
            tuple(params),
        ).fetchall()
    return rows


@router.post("/catalogos/estaciones", status_code=status.HTTP_201_CREATED)
def create_estacion(payload: EstacionPayload):
    _ensure_taller_schema()
    with get_connection() as conn:
        _validate_reference(conn, "taller_areas", payload.area_id, "Area no encontrada")
        conn.row_factory = dict_row
        row = conn.execute(
            """
            INSERT INTO taller_estaciones (area_id, nb_estacion, tipo_estacion, estatus, activo)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, area_id, nb_estacion, tipo_estacion, estatus, activo, created_at
            """,
            (
                payload.area_id,
                payload.nb_estacion.strip(),
                (payload.tipo_estacion or "").strip() or None,
                payload.estatus.strip().upper(),
                payload.activo,
            ),
        ).fetchone()
    return row


@router.put("/catalogos/estaciones/{estacion_id}")
def update_estacion(estacion_id: int, payload: EstacionPayload):
    _ensure_taller_schema()
    with get_connection() as conn:
        _validate_reference(conn, "taller_areas", payload.area_id, "Area no encontrada")
        conn.row_factory = dict_row
        row = conn.execute(
            """
            UPDATE taller_estaciones
            SET area_id = %s, nb_estacion = %s, tipo_estacion = %s, estatus = %s, activo = %s
            WHERE id = %s
            RETURNING id, area_id, nb_estacion, tipo_estacion, estatus, activo, created_at
            """,
            (
                payload.area_id,
                payload.nb_estacion.strip(),
                (payload.tipo_estacion or "").strip() or None,
                payload.estatus.strip().upper(),
                payload.activo,
                estacion_id,
            ),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Estacion no encontrada")
    return row


@router.delete("/catalogos/estaciones/{estacion_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_estacion(estacion_id: int):
    _ensure_taller_schema()
    with get_connection() as conn:
        result = conn.execute("DELETE FROM taller_estaciones WHERE id = %s", (estacion_id,))
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Estacion no encontrada")
    return None


@router.get("/catalogos/puestos")
def list_puestos(etapa_id: int | None = None, activo: bool | None = None):
    _ensure_taller_schema()
    filters: list[str] = []
    params: list[Any] = []
    if etapa_id is not None:
        filters.append("tp.etapa_id = %s")
        params.append(etapa_id)
    if activo is not None:
        filters.append("tp.activo = %s")
        params.append(activo)
    where_clause = f"WHERE {' AND '.join(filters)}" if filters else ""

    with get_connection() as conn:
        conn.row_factory = dict_row
        rows = conn.execute(
            f"""
            SELECT tp.id, tp.nb_puesto, tp.etapa_id, te.nb_etapa, te.clave, tp.activo, tp.created_at
            FROM taller_puestos tp
            JOIN taller_etapas te ON te.id = tp.etapa_id
            {where_clause}
            ORDER BY te.orden ASC, tp.nb_puesto ASC
            """,
            tuple(params),
        ).fetchall()
    return rows


@router.post("/catalogos/puestos", status_code=status.HTTP_201_CREATED)
def create_puesto(payload: PuestoPayload):
    _ensure_taller_schema()
    with get_connection() as conn:
        _validate_reference(conn, "taller_etapas", payload.etapa_id, "Etapa no encontrada")
        conn.row_factory = dict_row
        row = conn.execute(
            """
            INSERT INTO taller_puestos (nb_puesto, etapa_id, activo)
            VALUES (%s, %s, %s)
            RETURNING id, nb_puesto, etapa_id, activo, created_at
            """,
            (payload.nb_puesto.strip(), payload.etapa_id, payload.activo),
        ).fetchone()
    return row


@router.put("/catalogos/puestos/{puesto_id}")
def update_puesto(puesto_id: int, payload: PuestoPayload):
    _ensure_taller_schema()
    with get_connection() as conn:
        _validate_reference(conn, "taller_etapas", payload.etapa_id, "Etapa no encontrada")
        conn.row_factory = dict_row
        row = conn.execute(
            """
            UPDATE taller_puestos
            SET nb_puesto = %s, etapa_id = %s, activo = %s
            WHERE id = %s
            RETURNING id, nb_puesto, etapa_id, activo, created_at
            """,
            (payload.nb_puesto.strip(), payload.etapa_id, payload.activo, puesto_id),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Puesto no encontrado")
    return row


@router.delete("/catalogos/puestos/{puesto_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_puesto(puesto_id: int):
    _ensure_taller_schema()
    with get_connection() as conn:
        result = conn.execute("DELETE FROM taller_puestos WHERE id = %s", (puesto_id,))
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Puesto no encontrado")
    return None


@router.get("/catalogos/personal")
def list_personal(puesto_id: int | None = None, activo: bool | None = None):
    _ensure_taller_schema()
    filters: list[str] = []
    params: list[Any] = []
    if puesto_id is not None:
        filters.append("tpers.puesto_id = %s")
        params.append(puesto_id)
    if activo is not None:
        filters.append("tpers.activo = %s")
        params.append(activo)
    where_clause = f"WHERE {' AND '.join(filters)}" if filters else ""

    with get_connection() as conn:
        conn.row_factory = dict_row
        rows = conn.execute(
            f"""
            SELECT tpers.id, tpers.nb_personal, tpers.puesto_id, tp.nb_puesto, tp.etapa_id,
                   te.nb_etapa, te.clave, tpers.activo, tpers.created_at
            FROM taller_personal tpers
            JOIN taller_puestos tp ON tp.id = tpers.puesto_id
            JOIN taller_etapas te ON te.id = tp.etapa_id
            {where_clause}
            ORDER BY tpers.nb_personal ASC
            """,
            tuple(params),
        ).fetchall()
    return rows


@router.post("/catalogos/personal", status_code=status.HTTP_201_CREATED)
def create_personal(payload: PersonalPayload):
    _ensure_taller_schema()
    with get_connection() as conn:
        _validate_reference(conn, "taller_puestos", payload.puesto_id, "Puesto no encontrado")
        conn.row_factory = dict_row
        row = conn.execute(
            """
            INSERT INTO taller_personal (nb_personal, puesto_id, activo)
            VALUES (%s, %s, %s)
            RETURNING id, nb_personal, puesto_id, activo, created_at
            """,
            (payload.nb_personal.strip(), payload.puesto_id, payload.activo),
        ).fetchone()
    return row


@router.put("/catalogos/personal/{personal_id}")
def update_personal(personal_id: int, payload: PersonalPayload):
    _ensure_taller_schema()
    with get_connection() as conn:
        _validate_reference(conn, "taller_puestos", payload.puesto_id, "Puesto no encontrado")
        conn.row_factory = dict_row
        row = conn.execute(
            """
            UPDATE taller_personal
            SET nb_personal = %s, puesto_id = %s, activo = %s
            WHERE id = %s
            RETURNING id, nb_personal, puesto_id, activo, created_at
            """,
            (payload.nb_personal.strip(), payload.puesto_id, payload.activo, personal_id),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Personal no encontrado")
    return row


@router.delete("/catalogos/personal/{personal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_personal(personal_id: int):
    _ensure_taller_schema()
    with get_connection() as conn:
        result = conn.execute("DELETE FROM taller_personal WHERE id = %s", (personal_id,))
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Personal no encontrado")
    return None


@router.get("/estaciones/asignaciones")
def list_estacion_asignaciones(
    activa: bool | None = True,
    estacion_id: int | None = None,
    personal_id: int | None = None,
):
    _ensure_taller_schema()
    filters: list[str] = []
    params: list[Any] = []
    if activa is not None:
        filters.append("tea.activa = %s")
        params.append(activa)
    if estacion_id is not None:
        filters.append("tea.estacion_id = %s")
        params.append(estacion_id)
    if personal_id is not None:
        filters.append("tea.personal_id = %s")
        params.append(personal_id)
    where_clause = f"WHERE {' AND '.join(filters)}" if filters else ""

    with get_connection() as conn:
        conn.row_factory = dict_row
        rows = conn.execute(
            f"""
            SELECT tea.id, tea.estacion_id, es.nb_estacion, ta.nb_area, tea.personal_id, tp.nb_personal,
                   tea.recepcion_id, tea.folio_ot, tea.etapa_id, te.nb_etapa,
                   tea.fecha_inicio, tea.fecha_fin, tea.activa, tea.created_at
            FROM taller_estacion_asignaciones tea
            JOIN taller_estaciones es ON es.id = tea.estacion_id
            JOIN taller_areas ta ON ta.id = es.area_id
            JOIN taller_personal tp ON tp.id = tea.personal_id
            LEFT JOIN taller_etapas te ON te.id = tea.etapa_id
            {where_clause}
            ORDER BY COALESCE(tea.fecha_inicio, tea.created_at) DESC
            """,
            tuple(params),
        ).fetchall()
    return rows


@router.post("/estaciones/asignaciones", status_code=status.HTTP_201_CREATED)
def create_estacion_asignacion(payload: EstacionAsignacionPayload):
    _ensure_taller_schema()
    with get_connection() as conn:
        station_context = _get_station_context(conn, payload.estacion_id)
        _validate_reference(conn, "taller_personal", payload.personal_id, "Personal no encontrado")
        if payload.recepcion_id is not None:
            _get_recepcion_reference(conn, payload.recepcion_id)
        resolved_etapa_id = payload.etapa_id or station_context["etapa_id"]
        if resolved_etapa_id is not None:
            if resolved_etapa_id != station_context["etapa_id"]:
                raise HTTPException(status_code=400, detail="La etapa no corresponde al area de la estacion")
            _validate_reference(conn, "taller_etapas", resolved_etapa_id, "Etapa no encontrada")

        if payload.activa:
            previous_assignments = conn.execute(
                """
                SELECT recepcion_id, etapa_id, estacion_id
                FROM taller_estacion_asignaciones
                WHERE estacion_id = %s AND activa = TRUE
                """,
                (payload.estacion_id,),
            ).fetchall()
            conn.execute(
                "UPDATE taller_estacion_asignaciones SET activa = FALSE, fecha_fin = COALESCE(fecha_fin, NOW()) WHERE estacion_id = %s AND activa = TRUE",
                (payload.estacion_id,),
            )
            for previous in previous_assignments:
                _clear_assignment_from_ot_stage(conn, previous[0], previous[1], previous[2])

        conn.row_factory = dict_row
        row = conn.execute(
            """
            INSERT INTO taller_estacion_asignaciones (
                estacion_id, personal_id, recepcion_id, folio_ot, etapa_id, fecha_inicio, fecha_fin, activa
            )
            VALUES (%s, %s, %s, %s, %s, COALESCE(%s::timestamp, NOW()), %s::timestamp, %s)
            RETURNING *
            """,
            (
                payload.estacion_id,
                payload.personal_id,
                payload.recepcion_id,
                (payload.folio_ot or "").strip() or None,
                resolved_etapa_id,
                payload.fecha_inicio,
                payload.fecha_fin,
                payload.activa,
            ),
        ).fetchone()
        if payload.activa:
            _sync_assignment_to_ot_stage(
                conn,
                payload.recepcion_id,
                resolved_etapa_id,
                station_context["area_id"],
                payload.estacion_id,
                payload.personal_id,
            )
    return row


@router.put("/estaciones/asignaciones/{asignacion_id}")
def update_estacion_asignacion(asignacion_id: int, payload: EstacionAsignacionPayload):
    _ensure_taller_schema()
    with get_connection() as conn:
        station_context = _get_station_context(conn, payload.estacion_id)
        _validate_reference(conn, "taller_personal", payload.personal_id, "Personal no encontrado")
        if payload.recepcion_id is not None:
            _get_recepcion_reference(conn, payload.recepcion_id)
        resolved_etapa_id = payload.etapa_id or station_context["etapa_id"]
        if resolved_etapa_id is not None:
            if resolved_etapa_id != station_context["etapa_id"]:
                raise HTTPException(status_code=400, detail="La etapa no corresponde al area de la estacion")
            _validate_reference(conn, "taller_etapas", resolved_etapa_id, "Etapa no encontrada")

        current_assignment = conn.execute(
            """
            SELECT id, estacion_id, recepcion_id, etapa_id
            FROM taller_estacion_asignaciones
            WHERE id = %s
            LIMIT 1
            """,
            (asignacion_id,),
        ).fetchone()
        if not current_assignment:
            raise HTTPException(status_code=404, detail="Asignacion no encontrada")

        if payload.activa:
            conn.execute(
                "UPDATE taller_estacion_asignaciones SET activa = FALSE, fecha_fin = COALESCE(fecha_fin, NOW()) WHERE estacion_id = %s AND activa = TRUE AND id <> %s",
                (payload.estacion_id, asignacion_id),
            )
            if current_assignment[1] != payload.estacion_id:
                conn.execute(
                    "UPDATE taller_estacion_asignaciones SET activa = FALSE, fecha_fin = COALESCE(fecha_fin, NOW()) WHERE estacion_id = %s AND activa = TRUE AND id <> %s",
                    (current_assignment[1], asignacion_id),
                )

        conn.row_factory = dict_row
        row = conn.execute(
            """
            UPDATE taller_estacion_asignaciones
            SET estacion_id = %s,
                personal_id = %s,
                recepcion_id = %s,
                folio_ot = %s,
                etapa_id = %s,
                fecha_inicio = COALESCE(%s::timestamp, fecha_inicio, NOW()),
                fecha_fin = %s::timestamp,
                activa = %s
            WHERE id = %s
            RETURNING *
            """,
            (
                payload.estacion_id,
                payload.personal_id,
                payload.recepcion_id,
                (payload.folio_ot or "").strip() or None,
                resolved_etapa_id,
                payload.fecha_inicio,
                payload.fecha_fin,
                payload.activa,
                asignacion_id,
            ),
        ).fetchone()
        _clear_assignment_from_ot_stage(conn, current_assignment[2], current_assignment[3], current_assignment[1])
        if payload.activa:
            _sync_assignment_to_ot_stage(
                conn,
                payload.recepcion_id,
                resolved_etapa_id,
                station_context["area_id"],
                payload.estacion_id,
                payload.personal_id,
            )
    if not row:
        raise HTTPException(status_code=404, detail="Asignacion no encontrada")
    return row


@router.delete("/estaciones/asignaciones/{asignacion_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_estacion_asignacion(asignacion_id: int):
    _ensure_taller_schema()
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT recepcion_id, etapa_id, estacion_id
            FROM taller_estacion_asignaciones
            WHERE id = %s
            LIMIT 1
            """,
            (asignacion_id,),
        ).fetchone()
        result = conn.execute("DELETE FROM taller_estacion_asignaciones WHERE id = %s", (asignacion_id,))
        if row and result.rowcount:
            _clear_assignment_from_ot_stage(conn, row[0], row[1], row[2])
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Asignacion no encontrada")
    return None


@router.get("/areas/{area_id}/ots-disponibles")
def list_ots_disponibles_por_area(area_id: int):
    _ensure_taller_schema()
    with get_connection() as conn:
        conn.row_factory = dict_row
        area = conn.execute(
            """
            SELECT ta.id, ta.nb_area, ta.etapa_id, te.clave, te.nb_etapa, te.orden
            FROM taller_areas ta
            JOIN taller_etapas te ON te.id = ta.etapa_id
            WHERE ta.id = %s
            LIMIT 1
            """,
            (area_id,),
        ).fetchone()
        if not area:
            raise HTTPException(status_code=404, detail="Area no encontrada")

        recepciones = conn.execute(
            """
            SELECT r.id, r.folio_recep, r.fecha_recep, r.nb_cliente, r.placas,
                   r.vehiculo, r.vehiculo_marca, r.vehiculo_modelo, r.vehiculo_anio, r.estatus,
                   he.folio_seguro,
                   COALESCE(NULLIF(he.folio_ot, ''), r.folio_recep) AS folio_ot
            FROM recepciones r
            LEFT JOIN LATERAL (
                SELECT folio_seguro, folio_ot
                FROM historical_entries
                WHERE folio_recep = r.folio_recep
                ORDER BY id DESC
                LIMIT 1
            ) he ON TRUE
            ORDER BY r.fecha_recep ASC, r.id ASC
            """
        ).fetchall()

        candidates: list[dict[str, Any]] = []
        for recepcion in recepciones:
            if not _is_workshop_status(recepcion.get("estatus")):
                continue

            stages = _sync_ot_stages(conn, recepcion["id"])
            current_stage = next((stage for stage in stages if stage["etapa_id"] == area["etapa_id"]), None)
            if not current_stage:
                continue

            current_status = str(current_stage.get("estatus") or "").upper()
            if current_status == "COMPLETADO":
                continue

            if current_stage.get("estacion_id"):
                continue

            active_assignment = conn.execute(
                """
                SELECT 1
                FROM taller_estacion_asignaciones
                WHERE recepcion_id = %s AND etapa_id = %s AND activa = TRUE
                LIMIT 1
                """,
                (recepcion["id"], area["etapa_id"]),
            ).fetchone()
            if active_assignment:
                continue

            if area["orden"] > 1:
                previous_stage = next((stage for stage in stages if stage["orden"] == area["orden"] - 1), None)
                if not previous_stage or str(previous_stage.get("estatus") or "").upper() != "COMPLETADO":
                    continue

            candidates.append(
                {
                    "recepcion_id": recepcion["id"],
                    "folio_ot": recepcion["folio_ot"],
                    "folio_recep": recepcion["folio_recep"],
                    "folio_seguro": recepcion.get("folio_seguro"),
                    "placas": recepcion.get("placas"),
                    "cliente": recepcion.get("nb_cliente"),
                    "vehiculo": (
                        " ".join(
                            part
                            for part in [recepcion.get("vehiculo_marca"), recepcion.get("vehiculo_modelo"), recepcion.get("vehiculo_anio")]
                            if part
                        ).strip()
                        or recepcion.get("vehiculo")
                    ),
                    "etapa_objetivo_id": area["etapa_id"],
                    "etapa_objetivo": area["nb_etapa"],
                    "estatus_etapa": current_status,
                    "progreso": current_stage.get("progreso") or 0,
                    "fecha_recep": recepcion.get("fecha_recep"),
                }
            )

    return {
        "area": area,
        "items": candidates,
    }


@router.get("/ordenes/{recepcion_id}/etapas")
def list_ot_etapas(recepcion_id: int, sync: bool = Query(default=True)):
    _ensure_taller_schema()
    with get_connection() as conn:
        rows = _sync_ot_stages(conn, recepcion_id) if sync else None
        if rows is None:
            rows = _sync_ot_stages(conn, recepcion_id)
    return rows


@router.post("/ordenes/{recepcion_id}/etapas/sync")
def sync_ot_etapas(recepcion_id: int):
    _ensure_taller_schema()
    with get_connection() as conn:
        rows = _sync_ot_stages(conn, recepcion_id)
    return {"recepcion_id": recepcion_id, "items": rows}


@router.get("/ordenes/{recepcion_id}/etapas/{etapa_id}")
def get_ot_etapa(recepcion_id: int, etapa_id: int):
    _ensure_taller_schema()
    with get_connection() as conn:
        _sync_ot_stages(conn, recepcion_id)
        return _get_ot_stage(conn, recepcion_id, etapa_id)


@router.put("/ordenes/{recepcion_id}/etapas/{etapa_id}")
def update_ot_etapa(recepcion_id: int, etapa_id: int, payload: OtEtapaPayload):
    _ensure_taller_schema()
    with get_connection() as conn:
        _sync_ot_stages(conn, recepcion_id)
        _get_ot_stage(conn, recepcion_id, etapa_id)

        if payload.area_id is not None:
            _validate_reference(conn, "taller_areas", payload.area_id, "Area no encontrada")
        if payload.estacion_id is not None:
            _validate_reference(conn, "taller_estaciones", payload.estacion_id, "Estacion no encontrada")
        if payload.personal_id_responsable is not None:
            _validate_reference(conn, "taller_personal", payload.personal_id_responsable, "Personal no encontrado")

        conn.row_factory = dict_row
        row = conn.execute(
            """
            UPDATE taller_ot_etapas
            SET estatus = COALESCE(%s, estatus),
                progreso = COALESCE(%s, progreso),
                area_id = %s,
                estacion_id = %s,
                personal_id_responsable = %s,
                fecha_inicio = COALESCE(%s::timestamp, fecha_inicio),
                fecha_fin = %s::timestamp,
                updated_at = NOW()
            WHERE recepcion_id = %s AND etapa_id = %s
            RETURNING *
            """,
            (
                (payload.estatus or "").strip().upper() or None,
                payload.progreso,
                payload.area_id,
                payload.estacion_id,
                payload.personal_id_responsable,
                payload.fecha_inicio,
                payload.fecha_fin,
                recepcion_id,
                etapa_id,
            ),
        ).fetchone()
    return row


@router.get("/ordenes/{recepcion_id}/etapas/{etapa_id}/checklist")
def list_ot_checklist(recepcion_id: int, etapa_id: int):
    _ensure_taller_schema()
    with get_connection() as conn:
        _sync_ot_stages(conn, recepcion_id)
        ot_stage = _get_ot_stage(conn, recepcion_id, etapa_id)
        rows = _sync_ot_checklist(conn, ot_stage["id"], etapa_id)
    return rows


@router.put("/ordenes/{recepcion_id}/etapas/{etapa_id}/checklist/{checklist_item_id}")
def update_ot_checklist(
    recepcion_id: int,
    etapa_id: int,
    checklist_item_id: int,
    payload: OtChecklistPayload,
):
    _ensure_taller_schema()
    with get_connection() as conn:
        _sync_ot_stages(conn, recepcion_id)
        ot_stage = _get_ot_stage(conn, recepcion_id, etapa_id)
        _sync_ot_checklist(conn, ot_stage["id"], etapa_id)

        conn.row_factory = dict_row
        row = conn.execute(
            """
            UPDATE taller_ot_checklist
            SET completado = %s,
                completado_por = %s,
                completado_en = CASE WHEN %s THEN NOW() ELSE NULL END
            WHERE ot_etapa_id = %s AND checklist_item_id = %s
            RETURNING *
            """,
            (
                payload.completado,
                (payload.completado_por or "").strip() or None,
                payload.completado,
                ot_stage["id"],
                checklist_item_id,
            ),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Checklist operativo no encontrado")
    return row


@router.get("/ordenes/{recepcion_id}/etapas/{etapa_id}/notas")
def list_ot_notas(recepcion_id: int, etapa_id: int):
    _ensure_taller_schema()
    with get_connection() as conn:
        _sync_ot_stages(conn, recepcion_id)
        ot_stage = _get_ot_stage(conn, recepcion_id, etapa_id)
        conn.row_factory = dict_row
        rows = conn.execute(
            """
            SELECT id, ot_etapa_id, nota, creado_por, created_at
            FROM taller_ot_notas
            WHERE ot_etapa_id = %s
            ORDER BY created_at DESC, id DESC
            """,
            (ot_stage["id"],),
        ).fetchall()
    return rows


@router.post("/ordenes/{recepcion_id}/etapas/{etapa_id}/notas", status_code=status.HTTP_201_CREATED)
def create_ot_nota(recepcion_id: int, etapa_id: int, payload: OtNotaPayload):
    _ensure_taller_schema()
    with get_connection() as conn:
        _sync_ot_stages(conn, recepcion_id)
        ot_stage = _get_ot_stage(conn, recepcion_id, etapa_id)
        conn.row_factory = dict_row
        row = conn.execute(
            """
            INSERT INTO taller_ot_notas (ot_etapa_id, nota, creado_por)
            VALUES (%s, %s, %s)
            RETURNING id, ot_etapa_id, nota, creado_por, created_at
            """,
            (ot_stage["id"], payload.nota.strip(), (payload.creado_por or "").strip() or None),
        ).fetchone()
    return row


@router.get("/dashboard/autos-en-sitio")
def get_autos_en_sitio_dashboard():
    _ensure_taller_schema()
    items: list[dict[str, Any]] = []
    with get_connection() as conn:
        conn.row_factory = dict_row
        recepciones = conn.execute(
            """
            SELECT r.id, r.folio_recep, r.fecha_recep, r.nb_cliente, r.tel_cliente, r.seguro, r.placas,
                   r.vehiculo, r.vehiculo_marca, r.vehiculo_modelo, r.vehiculo_anio, r.vehiculo_tipo,
                   r.vehiculo_color, r.estatus,
                   he.folio_seguro,
                   COALESCE(NULLIF(he.folio_ot, ''), r.folio_recep) AS folio_ot
            FROM recepciones r
            LEFT JOIN LATERAL (
                SELECT folio_seguro, folio_ot
                FROM historical_entries
                WHERE folio_recep = r.folio_recep
                ORDER BY id DESC
                LIMIT 1
            ) he ON TRUE
            ORDER BY r.fecha_recep DESC, r.id DESC
            """
        ).fetchall()

        for recepcion in recepciones:
            if not _is_workshop_status(recepcion.get("estatus")):
                continue
            stages = _sync_ot_stages(conn, recepcion["id"])
            current_stage = next((row for row in stages if str(row.get("estatus") or "").upper() == "EN_PROCESO"), None)
            if current_stage is None:
                current_stage = next((row for row in stages if str(row.get("estatus") or "").upper() == "PENDIENTE"), None)
            if current_stage is None and stages:
                current_stage = stages[-1]

            active_assignment = conn.execute(
                """
                SELECT tea.id, tea.estacion_id, es.nb_estacion, tea.personal_id, tp.nb_personal
                FROM taller_estacion_asignaciones tea
                JOIN taller_estaciones es ON es.id = tea.estacion_id
                JOIN taller_personal tp ON tp.id = tea.personal_id
                WHERE tea.recepcion_id = %s AND tea.activa = TRUE
                ORDER BY tea.created_at DESC, tea.id DESC
                LIMIT 1
                """,
                (recepcion["id"],),
            ).fetchone()

            summary = dict(recepcion)
            summary["etapa_actual"] = current_stage["clave"] if current_stage else None
            summary["etapa_actual_nombre"] = current_stage["nb_etapa"] if current_stage else None
            summary["progreso_actual"] = current_stage["progreso"] if current_stage else 0
            summary["taller_estatus"] = current_stage["estatus"] if current_stage else "PENDIENTE"
            summary["personal_responsable"] = (
                current_stage.get("personal_responsable")
                or (active_assignment["nb_personal"] if active_assignment else None)
            )
            summary["estacion_actual"] = (
                current_stage.get("nb_estacion")
                or (active_assignment["nb_estacion"] if active_assignment else None)
            )
            summary["dias_taller"] = None
            items.append(summary)

    return items


@router.get("/dashboard/areas-trabajo")
def get_areas_trabajo_dashboard():
    _ensure_taller_schema()
    with get_connection() as conn:
        conn.row_factory = dict_row
        areas = conn.execute(
            """
            SELECT ta.id, ta.nb_area, ta.capacidad_maxima, ta.activo, ta.etapa_id, te.clave, te.nb_etapa, te.orden
            FROM taller_areas ta
            JOIN taller_etapas te ON te.id = ta.etapa_id
            WHERE ta.activo = TRUE
            ORDER BY te.orden ASC, ta.nb_area ASC
            """
        ).fetchall()

        result_areas: list[dict[str, Any]] = []
        total_stations = 0
        total_occupied = 0
        total_free = 0
        delayed_count = 0

        for area in areas:
            estaciones = conn.execute(
                """
                SELECT es.id, es.nb_estacion, es.tipo_estacion, es.estatus, es.activo,
                       tea.id AS asignacion_id,
                       tea.recepcion_id, tea.folio_ot, tea.fecha_inicio,
                       tp.nb_personal,
                       r.vehiculo, r.vehiculo_marca, r.vehiculo_modelo, r.vehiculo_anio,
                       ote.progreso, ote.estatus AS ot_estatus
                FROM taller_estaciones es
                LEFT JOIN LATERAL (
                    SELECT tea.*
                    FROM taller_estacion_asignaciones tea
                    WHERE tea.estacion_id = es.id AND tea.activa = TRUE
                    ORDER BY tea.created_at DESC, tea.id DESC
                    LIMIT 1
                ) tea ON TRUE
                LEFT JOIN taller_personal tp ON tp.id = tea.personal_id
                LEFT JOIN recepciones r ON r.id = tea.recepcion_id
                LEFT JOIN LATERAL (
                    SELECT ote.progreso, ote.estatus
                    FROM taller_ot_etapas ote
                    WHERE ote.recepcion_id = tea.recepcion_id
                      AND ote.estacion_id = es.id
                      AND ote.etapa_id = %s
                    ORDER BY ote.updated_at DESC, ote.id DESC
                    LIMIT 1
                ) ote ON TRUE
                WHERE es.area_id = %s AND es.activo = TRUE
                ORDER BY es.nb_estacion ASC
                """,
                (area["etapa_id"], area["id"]),
            ).fetchall()

            mapped_stations: list[dict[str, Any]] = []
            occupied_count = 0
            for station in estaciones:
                is_occupied = bool(station.get("recepcion_id"))
                total_stations += 1
                if is_occupied:
                    occupied_count += 1
                    total_occupied += 1
                else:
                    total_free += 1

                progress = int(station.get("progreso") or 0)
                station_status = "free"
                if is_occupied:
                    station_status = "occupied"
                    if progress >= 90 and str(station.get("ot_estatus") or "").upper() != "COMPLETADO":
                        station_status = "delayed"
                        delayed_count += 1

                mapped_stations.append(
                    {
                        "id": station["id"],
                        "assignment_id": station.get("asignacion_id"),
                        "recepcion_id": station.get("recepcion_id"),
                        "area_id": area["id"],
                        "etapa_id": area["etapa_id"],
                        "etapa_clave": area["clave"],
                        "name": station["nb_estacion"],
                        "subtitle": station.get("tipo_estacion") or ("Disponible para asignacion" if not is_occupied else area["nb_etapa"]),
                        "status": station_status,
                        "order": f"OT #{station['folio_ot']}" if station.get("folio_ot") else None,
                        "vehicle": (
                            " ".join(
                                part for part in [station.get("vehiculo_marca"), station.get("vehiculo_modelo"), station.get("vehiculo_anio")] if part
                            ).strip()
                            or station.get("vehiculo")
                        ),
                        "task": area["nb_etapa"],
                        "progress": progress,
                        "tech": station.get("nb_personal"),
                    }
                )

            result_areas.append(
                {
                    "id": area["id"],
                    "etapa_id": area["etapa_id"],
                    "etapa_clave": area["clave"],
                    "etapa_nombre": area["nb_etapa"],
                    "icon": (
                        "format_paint"
                        if area["clave"] == "pintura"
                        else "construction"
                        if area["clave"] == "carroceria"
                        else "auto_fix_high"
                    ),
                    "iconClass": (
                        "text-violet-400"
                        if area["clave"] == "pintura"
                        else "text-blue-400"
                        if area["clave"] == "carroceria"
                        else "text-amber-400"
                    ),
                    "title": area["nb_area"],
                    "capacity": f"{occupied_count}/{len(estaciones) or area['capacidad_maxima']}",
                    "stations": mapped_stations,
                }
            )

        return {
            "areas": result_areas,
            "totals": {
                "occupied": total_occupied,
                "free": total_free,
                "stations": total_stations,
                "delayed": delayed_count,
            },
        }
