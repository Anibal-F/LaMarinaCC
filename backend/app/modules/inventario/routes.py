import asyncio
import os
from datetime import datetime
from pathlib import Path
from typing import Any, List, Optional
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field
from psycopg.rows import dict_row

from app.core.db import get_connection

router = APIRouter(prefix="/inventario", tags=["inventario"])


# =====================================================
# MODELOS Pydantic
# =====================================================

class ProveedorBase(BaseModel):
    id_externo: int
    fuente: str
    nombre: str
    email: Optional[str] = None
    celular: Optional[str] = None


class Proveedor(ProveedorBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PiezaBase(BaseModel):
    nombre: str
    origen: Optional[str] = None
    numero_parte: Optional[str] = None
    observaciones: Optional[str] = None
    proveedor_id: Optional[int] = None
    numero_orden: Optional[str] = None
    numero_reporte: Optional[str] = None
    paqueteria: Optional[str] = None
    guia_paqueteria: Optional[str] = None
    fecha_promesa: Optional[datetime] = None
    fecha_estatus: Optional[datetime] = None
    estatus: Optional[str] = None
    demeritos: float = 0
    ubicacion: str = "ND"
    devolucion_proveedor: bool = False
    recibido: bool = False
    entregado: bool = False
    portal: bool = False
    fuente: str
    tipo_registro: str
    num_expediente: Optional[str] = None
    id_externo: Optional[str] = None


class PiezaCreate(PiezaBase):
    pass


class PiezaUpdate(BaseModel):
    nombre: Optional[str] = None
    origen: Optional[str] = None
    numero_parte: Optional[str] = None
    observaciones: Optional[str] = None
    proveedor_id: Optional[int] = None
    numero_orden: Optional[str] = None
    numero_reporte: Optional[str] = None
    fecha_promesa: Optional[datetime] = None
    fecha_estatus: Optional[datetime] = None
    estatus: Optional[str] = None
    demeritos: Optional[float] = None
    ubicacion: Optional[str] = None
    devolucion_proveedor: Optional[bool] = None
    recibido: Optional[bool] = None
    entregado: Optional[bool] = None
    portal: Optional[bool] = None
    tipo_registro: Optional[str] = None


class Pieza(PiezaBase):
    id: int
    fecha_extraccion: datetime
    created_at: datetime
    updated_at: datetime
    # Datos del proveedor
    proveedor_id_externo: Optional[int] = None
    proveedor_nombre: Optional[str] = None
    proveedor_email: Optional[str] = None
    proveedor_celular: Optional[str] = None

    class Config:
        from_attributes = True


class PaquetePiezaRelacionBase(BaseModel):
    bitacora_pieza_id: Optional[int] = None
    nombre_pieza: str
    numero_parte: Optional[str] = None
    cantidad: int = 1
    estatus: str = "Pendiente"
    observaciones: Optional[str] = None


class PaquetePiezaRelacionCreate(PaquetePiezaRelacionBase):
    pass


class PaquetePiezaRelacionUpdate(BaseModel):
    bitacora_pieza_id: Optional[int] = None
    nombre_pieza: Optional[str] = None
    numero_parte: Optional[str] = None
    cantidad: Optional[int] = None
    estatus: Optional[str] = None
    observaciones: Optional[str] = None


class PaquetePiezaRelacion(PaquetePiezaRelacionBase):
    id: int
    paquete_id: int
    created_at: datetime
    updated_at: datetime


class PaquetePiezaMedia(BaseModel):
    id: int
    paquete_id: int
    media_type: str
    file_path: str
    original_name: Optional[str] = None
    mime_type: Optional[str] = None
    file_size: Optional[int] = None
    created_at: datetime


class PaquetePiezasBase(BaseModel):
    orden_admision_id: Optional[int] = None
    folio_ot: Optional[str] = None
    numero_reporte_siniestro: Optional[str] = None
    proveedor_nombre: str
    fecha_arribo: Optional[datetime] = None
    estatus: str = "Pendiente"
    comentarios: Optional[str] = None


class PaquetePiezasCreate(PaquetePiezasBase):
    relaciones: List[PaquetePiezaRelacionCreate] = Field(default_factory=list)


class PaquetePiezasUpdate(BaseModel):
    orden_admision_id: Optional[int] = None
    folio_ot: Optional[str] = None
    numero_reporte_siniestro: Optional[str] = None
    proveedor_nombre: Optional[str] = None
    fecha_arribo: Optional[datetime] = None
    estatus: Optional[str] = None
    comentarios: Optional[str] = None
    relaciones: Optional[List[PaquetePiezaRelacionCreate]] = None


class PaquetePiezasSummary(PaquetePiezasBase):
    id: int
    folio: str
    piezas_count: int = 0
    media_count: int = 0
    portada_path: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class PaquetePiezasDetail(PaquetePiezasBase):
    id: int
    folio: str
    piezas_count: int = 0
    media_count: int = 0
    portada_path: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    relaciones: List[PaquetePiezaRelacion] = Field(default_factory=list)
    media: List[PaquetePiezaMedia] = Field(default_factory=list)


def ensure_paquetes_piezas_tables(conn):
    conn.execute(
        """
        CREATE SEQUENCE IF NOT EXISTS paquetes_piezas_folio_seq
            START WITH 1
            INCREMENT BY 1
            MINVALUE 1
        """
    )
    conn.execute(
        """
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = CURRENT_TIMESTAMP;
            RETURN NEW;
        END;
        $$ language 'plpgsql'
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS paquetes_piezas (
            id BIGSERIAL PRIMARY KEY,
            folio VARCHAR(30) NOT NULL UNIQUE
                DEFAULT ('PKG-' || LPAD(nextval('paquetes_piezas_folio_seq')::text, 3, '0')),
            orden_admision_id BIGINT REFERENCES orden_admision(id) ON DELETE SET NULL,
            folio_ot VARCHAR(50),
            numero_reporte_siniestro VARCHAR(100),
            proveedor_nombre VARCHAR(255) NOT NULL,
            fecha_arribo TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            estatus VARCHAR(30) NOT NULL DEFAULT 'Pendiente',
            comentarios TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_paquetes_piezas_orden
        ON paquetes_piezas(orden_admision_id)
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_paquetes_piezas_ot
        ON paquetes_piezas(folio_ot)
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_paquetes_piezas_reporte
        ON paquetes_piezas(numero_reporte_siniestro)
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_paquetes_piezas_estatus
        ON paquetes_piezas(estatus)
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_paquetes_piezas_arribo
        ON paquetes_piezas(fecha_arribo DESC)
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS paquetes_piezas_relaciones (
            id BIGSERIAL PRIMARY KEY,
            paquete_id BIGINT NOT NULL REFERENCES paquetes_piezas(id) ON DELETE CASCADE,
            bitacora_pieza_id INTEGER REFERENCES bitacora_piezas(id) ON DELETE SET NULL,
            nombre_pieza VARCHAR(255) NOT NULL,
            numero_parte VARCHAR(100),
            cantidad INTEGER NOT NULL DEFAULT 1 CHECK (cantidad > 0),
            estatus VARCHAR(30) NOT NULL DEFAULT 'Pendiente',
            observaciones TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_paquetes_piezas_relaciones_paquete
        ON paquetes_piezas_relaciones(paquete_id)
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_paquetes_piezas_relaciones_bitacora
        ON paquetes_piezas_relaciones(bitacora_pieza_id)
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_paquetes_piezas_relaciones_estatus
        ON paquetes_piezas_relaciones(estatus)
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS paquetes_piezas_media (
            id BIGSERIAL PRIMARY KEY,
            paquete_id BIGINT NOT NULL REFERENCES paquetes_piezas(id) ON DELETE CASCADE,
            media_type VARCHAR(40) NOT NULL DEFAULT 'photo',
            file_path TEXT NOT NULL,
            original_name TEXT,
            mime_type VARCHAR(120),
            file_size BIGINT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_paquetes_piezas_media_paquete
        ON paquetes_piezas_media(paquete_id)
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_paquetes_piezas_media_tipo
        ON paquetes_piezas_media(paquete_id, media_type)
        """
    )
    conn.execute(
        """
        DROP TRIGGER IF EXISTS update_paquetes_piezas_updated_at ON paquetes_piezas
        """
    )
    conn.execute(
        """
        CREATE TRIGGER update_paquetes_piezas_updated_at
        BEFORE UPDATE ON paquetes_piezas
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column()
        """
    )
    conn.execute(
        """
        DROP TRIGGER IF EXISTS update_paquetes_piezas_relaciones_updated_at ON paquetes_piezas_relaciones
        """
    )
    conn.execute(
        """
        CREATE TRIGGER update_paquetes_piezas_relaciones_updated_at
        BEFORE UPDATE ON paquetes_piezas_relaciones
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column()
        """
    )


def _sync_paquetes_piezas_folio_sequence(conn):
    conn.execute(
        """
        WITH max_paquetes AS (
            SELECT COALESCE(
                MAX(
                    CASE
                        WHEN folio ~ '[0-9]+$'
                        THEN regexp_replace(folio, '[^0-9]', '', 'g')::bigint
                        ELSE NULL
                    END
                ),
                0
            ) AS max_value
            FROM paquetes_piezas
        )
        SELECT setval(
            'paquetes_piezas_folio_seq',
            GREATEST((SELECT max_value FROM max_paquetes), 1),
            (SELECT max_value > 0 FROM max_paquetes)
        )
        """
    )


def _paquetes_media_root() -> Path:
    return Path(__file__).resolve().parent.parent.parent / "media" / "paquetes_piezas"


def _get_orden_admision_snapshot(conn, orden_admision_id: Optional[int]) -> Optional[dict[str, Any]]:
    if not orden_admision_id:
        return None
    conn.row_factory = dict_row
    orden = conn.execute(
        """
        SELECT id, reporte_siniestro
        FROM orden_admision
        WHERE id = %s
        LIMIT 1
        """,
        (orden_admision_id,),
    ).fetchone()
    if not orden:
        raise HTTPException(status_code=404, detail="Orden de admisión no encontrada")
    return orden


def _ensure_paquete_exists(conn, paquete_id: int) -> dict[str, Any]:
    conn.row_factory = dict_row
    paquete = conn.execute(
        """
        SELECT id, folio
        FROM paquetes_piezas
        WHERE id = %s
        LIMIT 1
        """,
        (paquete_id,),
    ).fetchone()
    if not paquete:
        raise HTTPException(status_code=404, detail="Paquete no encontrado")
    return paquete


def _list_paquete_relaciones(conn, paquete_id: int) -> List[dict[str, Any]]:
    conn.row_factory = dict_row
    rows = conn.execute(
        """
        SELECT
            id,
            paquete_id,
            bitacora_pieza_id,
            nombre_pieza,
            numero_parte,
            cantidad,
            estatus,
            observaciones,
            created_at,
            updated_at
        FROM paquetes_piezas_relaciones
        WHERE paquete_id = %s
        ORDER BY id ASC
        """,
        (paquete_id,),
    ).fetchall()
    return list(rows)


def _list_paquete_media(conn, paquete_id: int) -> List[dict[str, Any]]:
    conn.row_factory = dict_row
    rows = conn.execute(
        """
        SELECT
            id,
            paquete_id,
            media_type,
            file_path,
            original_name,
            mime_type,
            file_size,
            created_at
        FROM paquetes_piezas_media
        WHERE paquete_id = %s
        ORDER BY id ASC
        """,
        (paquete_id,),
    ).fetchall()
    return list(rows)


def _build_paquete_detail(conn, paquete_id: int) -> dict[str, Any]:
    conn.row_factory = dict_row
    paquete = conn.execute(
        """
        SELECT
            id,
            folio,
            orden_admision_id,
            folio_ot,
            numero_reporte_siniestro,
            proveedor_nombre,
            fecha_arribo,
            estatus,
            comentarios,
            created_at,
            updated_at
        FROM paquetes_piezas
        WHERE id = %s
        LIMIT 1
        """,
        (paquete_id,),
    ).fetchone()
    if not paquete:
        raise HTTPException(status_code=404, detail="Paquete no encontrado")

    relaciones = _list_paquete_relaciones(conn, paquete_id)
    media = _list_paquete_media(conn, paquete_id)
    paquete["relaciones"] = relaciones
    paquete["media"] = media
    paquete["piezas_count"] = len(relaciones)
    paquete["media_count"] = len(media)
    paquete["portada_path"] = media[0]["file_path"] if media else None
    return paquete


def _insert_paquete_relaciones(conn, paquete_id: int, relaciones: List[PaquetePiezaRelacionCreate]):
    for relacion in relaciones:
        conn.execute(
            """
            INSERT INTO paquetes_piezas_relaciones (
                paquete_id,
                bitacora_pieza_id,
                nombre_pieza,
                numero_parte,
                cantidad,
                estatus,
                observaciones
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                paquete_id,
                relacion.bitacora_pieza_id,
                relacion.nombre_pieza.strip(),
                (relacion.numero_parte or "").strip() or None,
                relacion.cantidad,
                (relacion.estatus or "Pendiente").strip() or "Pendiente",
                (relacion.observaciones or "").strip() or None,
            ),
        )


# =====================================================
# ENDPOINTS DE PROVEEDORES
# =====================================================

@router.get("/proveedores", response_model=List[Proveedor])
def get_proveedores(
    fuente: Optional[str] = Query(None, description="Filtrar por fuente: Qualitas o CHUBB"),
    search: Optional[str] = Query(None, description="Buscar por nombre")
):
    """Obtiene el listado de proveedores"""
    try:
        with get_connection() as conn:
            query = "SELECT * FROM proveedores WHERE 1=1"
            params = []
            
            if fuente:
                query += " AND fuente = %s"
                params.append(fuente)
            
            if search:
                query += " AND nombre ILIKE %s"
                params.append(f"%{search}%")
            
            query += " ORDER BY nombre"
            
            with conn.cursor() as cur:
                cur.execute(query, params)
                rows = cur.fetchall()
                columns = [desc[0] for desc in cur.description]
                return [dict(zip(columns, row)) for row in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/proveedores/{proveedor_id}", response_model=Proveedor)
def get_proveedor(proveedor_id: int):
    """Obtiene un proveedor por su ID"""
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM proveedores WHERE id = %s", (proveedor_id,))
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Proveedor no encontrado")
                columns = [desc[0] for desc in cur.description]
                return dict(zip(columns, row))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/proveedores", response_model=Proveedor)
def create_proveedor(proveedor: ProveedorBase):
    """Crea un nuevo proveedor"""
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO proveedores (id_externo, fuente, nombre, email, celular)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (id_externo, fuente) DO UPDATE SET
                        nombre = EXCLUDED.nombre,
                        email = EXCLUDED.email,
                        celular = EXCLUDED.celular,
                        updated_at = CURRENT_TIMESTAMP
                    RETURNING *
                """, (proveedor.id_externo, proveedor.fuente, proveedor.nombre, 
                      proveedor.email, proveedor.celular))
                row = cur.fetchone()
                columns = [desc[0] for desc in cur.description]
                return dict(zip(columns, row))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =====================================================
# ENDPOINTS DE PIEZAS
# =====================================================

@router.get("/piezas", response_model=List[Pieza])
def get_piezas(
    fuente: Optional[str] = Query(None, description="Filtrar por fuente: Qualitas, CHUBB o Todas"),
    tipo_registro: Optional[str] = Query(None, description="Filtrar por tipo: 'Proceso de Surtido' o 'Reasignada/Cancelada'"),
    estatus: Optional[str] = Query(None, description="Filtrar por estatus"),
    proveedor_id: Optional[int] = Query(None, description="Filtrar por proveedor"),
    search: Optional[str] = Query(None, description="Buscar por nombre o número de parte"),
    numero_reporte: Optional[str] = Query(None, description="Filtrar por número de reporte"),
    fecha_inicio: Optional[str] = Query(None, description="Fecha inicio para filtro de fecha promesa (YYYY-MM-DD)"),
    fecha_fin: Optional[str] = Query(None, description="Fecha fin para filtro de fecha promesa (YYYY-MM-DD)"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0)
):
    """Obtiene el listado de piezas de la bitácora"""
    try:
        with get_connection() as conn:
            query = """
                SELECT 
                    bp.*,
                    p.id_externo as proveedor_id_externo,
                    p.nombre as proveedor_nombre,
                    p.email as proveedor_email,
                    p.celular as proveedor_celular
                FROM bitacora_piezas bp
                LEFT JOIN proveedores p ON bp.proveedor_id = p.id
                WHERE 1=1
            """
            params = []
            
            if fuente and fuente != "Todas":
                query += " AND bp.fuente = %s"
                params.append(fuente)
            
            if tipo_registro:
                query += " AND bp.tipo_registro = %s"
                params.append(tipo_registro)
            
            if estatus:
                query += " AND bp.estatus = %s"
                params.append(estatus)
            
            if proveedor_id:
                query += " AND bp.proveedor_id = %s"
                params.append(proveedor_id)
            
            if search:
                query += " AND (bp.nombre ILIKE %s OR bp.numero_parte ILIKE %s)"
                params.extend([f"%{search}%", f"%{search}%"])
            
            if numero_reporte:
                query += " AND bp.numero_reporte ILIKE %s"
                params.append(f"%{numero_reporte}%")
            
            if fecha_inicio:
                query += " AND bp.fecha_promesa >= %s"
                params.append(f"{fecha_inicio} 00:00:00")
            
            if fecha_fin:
                query += " AND bp.fecha_promesa <= %s"
                params.append(f"{fecha_fin} 23:59:59")
            
            query += " ORDER BY bp.created_at DESC LIMIT %s OFFSET %s"
            params.extend([limit, offset])
            
            with conn.cursor() as cur:
                cur.execute(query, params)
                rows = cur.fetchall()
                columns = [desc[0] for desc in cur.description]
                return [dict(zip(columns, row)) for row in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/piezas/{pieza_id}", response_model=Pieza)
def get_pieza(pieza_id: int):
    """Obtiene una pieza por su ID"""
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT 
                        bp.*,
                        p.id_externo as proveedor_id_externo,
                        p.nombre as proveedor_nombre,
                        p.email as proveedor_email,
                        p.celular as proveedor_celular
                    FROM bitacora_piezas bp
                    LEFT JOIN proveedores p ON bp.proveedor_id = p.id
                    WHERE bp.id = %s
                """, (pieza_id,))
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Pieza no encontrada")
                columns = [desc[0] for desc in cur.description]
                return dict(zip(columns, row))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/piezas", response_model=Pieza)
def create_pieza(pieza: PiezaCreate):
    """Crea una nueva pieza en la bitácora"""
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO bitacora_piezas (
                        nombre, origen, numero_parte, observaciones, proveedor_id,
                        numero_orden, numero_reporte,
                        fecha_promesa, fecha_estatus, estatus, demeritos, ubicacion,
                        devolucion_proveedor, recibido, entregado, portal,
                        fuente, tipo_registro, num_expediente, id_externo
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id_externo, fuente) DO UPDATE SET
                        nombre = EXCLUDED.nombre,
                        origen = EXCLUDED.origen,
                        numero_parte = EXCLUDED.numero_parte,
                        observaciones = EXCLUDED.observaciones,
                        proveedor_id = EXCLUDED.proveedor_id,
                        numero_orden = EXCLUDED.numero_orden,
                        numero_reporte = EXCLUDED.numero_reporte,
                        fecha_promesa = EXCLUDED.fecha_promesa,
                        fecha_estatus = EXCLUDED.fecha_estatus,
                        estatus = EXCLUDED.estatus,
                        demeritos = EXCLUDED.demeritos,
                        ubicacion = EXCLUDED.ubicacion,
                        devolucion_proveedor = EXCLUDED.devolucion_proveedor,
                        recibido = EXCLUDED.recibido,
                        entregado = EXCLUDED.entregado,
                        portal = EXCLUDED.portal,
                        tipo_registro = EXCLUDED.tipo_registro,
                        num_expediente = EXCLUDED.num_expediente,
                        updated_at = CURRENT_TIMESTAMP
                    RETURNING *
                """, (
                    pieza.nombre, pieza.origen, pieza.numero_parte, pieza.observaciones, 
                    pieza.proveedor_id, pieza.numero_orden, pieza.numero_reporte,
                    pieza.fecha_promesa, pieza.fecha_estatus, 
                    pieza.estatus, pieza.demeritos, pieza.ubicacion,
                    pieza.devolucion_proveedor, pieza.recibido, pieza.entregado, pieza.portal,
                    pieza.fuente, pieza.tipo_registro, pieza.num_expediente, pieza.id_externo
                ))
                row = cur.fetchone()
                columns = [desc[0] for desc in cur.description]
                return dict(zip(columns, row))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/piezas/{pieza_id}", response_model=Pieza)
def update_pieza(pieza_id: int, pieza: PiezaUpdate):
    """Actualiza una pieza existente"""
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                # Construir query dinámica solo con campos proporcionados
                updates = []
                params = []
                
                if pieza.nombre is not None:
                    updates.append("nombre = %s")
                    params.append(pieza.nombre)
                if pieza.origen is not None:
                    updates.append("origen = %s")
                    params.append(pieza.origen)
                if pieza.numero_parte is not None:
                    updates.append("numero_parte = %s")
                    params.append(pieza.numero_parte)
                if pieza.observaciones is not None:
                    updates.append("observaciones = %s")
                    params.append(pieza.observaciones)
                if pieza.proveedor_id is not None:
                    updates.append("proveedor_id = %s")
                    params.append(pieza.proveedor_id)
                if pieza.numero_orden is not None:
                    updates.append("numero_orden = %s")
                    params.append(pieza.numero_orden)
                if pieza.numero_reporte is not None:
                    updates.append("numero_reporte = %s")
                    params.append(pieza.numero_reporte)
                if pieza.fecha_promesa is not None:
                    updates.append("fecha_promesa = %s")
                    params.append(pieza.fecha_promesa)
                if pieza.fecha_estatus is not None:
                    updates.append("fecha_estatus = %s")
                    params.append(pieza.fecha_estatus)
                if pieza.estatus is not None:
                    updates.append("estatus = %s")
                    params.append(pieza.estatus)
                if pieza.demeritos is not None:
                    updates.append("demeritos = %s")
                    params.append(pieza.demeritos)
                if pieza.ubicacion is not None:
                    updates.append("ubicacion = %s")
                    params.append(pieza.ubicacion)
                if pieza.devolucion_proveedor is not None:
                    updates.append("devolucion_proveedor = %s")
                    params.append(pieza.devolucion_proveedor)
                if pieza.recibido is not None:
                    updates.append("recibido = %s")
                    params.append(pieza.recibido)
                if pieza.entregado is not None:
                    updates.append("entregado = %s")
                    params.append(pieza.entregado)
                if pieza.portal is not None:
                    updates.append("portal = %s")
                    params.append(pieza.portal)
                if pieza.tipo_registro is not None:
                    updates.append("tipo_registro = %s")
                    params.append(pieza.tipo_registro)
                
                if not updates:
                    raise HTTPException(status_code=400, detail="No se proporcionaron campos para actualizar")
                
                params.append(pieza_id)
                query = f"UPDATE bitacora_piezas SET {', '.join(updates)}, updated_at = CURRENT_TIMESTAMP WHERE id = %s RETURNING *"
                
                cur.execute(query, params)
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Pieza no encontrada")
                columns = [desc[0] for desc in cur.description]
                return dict(zip(columns, row))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/piezas/{pieza_id}")
def delete_pieza(pieza_id: int):
    """Elimina una pieza de la bitácora"""
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM bitacora_piezas WHERE id = %s RETURNING id", (pieza_id,))
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Pieza no encontrada")
                return {"message": "Pieza eliminada correctamente", "id": pieza_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =====================================================
# ENDPOINTS DE PAQUETES DE PIEZAS
# =====================================================

@router.get("/paquetes", response_model=List[PaquetePiezasSummary])
def get_paquetes(
    search: Optional[str] = Query(None, description="Buscar por folio, OT, reporte, proveedor o pieza"),
    estatus: Optional[str] = Query(None, description="Filtrar por estatus del paquete"),
    orden_admision_id: Optional[int] = Query(None, description="Filtrar por orden de admisión"),
    numero_reporte_siniestro: Optional[str] = Query(None, description="Filtrar por reporte/siniestro"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    with get_connection() as conn:
        conn.row_factory = dict_row
        ensure_paquetes_piezas_tables(conn)
        query = """
            SELECT
                p.id,
                p.folio,
                p.orden_admision_id,
                p.folio_ot,
                p.numero_reporte_siniestro,
                p.proveedor_nombre,
                p.fecha_arribo,
                p.estatus,
                p.comentarios,
                p.created_at,
                p.updated_at,
                COUNT(DISTINCT pr.id)::int AS piezas_count,
                COUNT(DISTINCT pm.id)::int AS media_count,
                MIN(pm.file_path) FILTER (WHERE pm.media_type = 'photo') AS portada_path
            FROM paquetes_piezas p
            LEFT JOIN paquetes_piezas_relaciones pr ON pr.paquete_id = p.id
            LEFT JOIN paquetes_piezas_media pm ON pm.paquete_id = p.id
            WHERE 1=1
        """
        params: list[Any] = []

        if estatus:
            query += " AND p.estatus = %s"
            params.append(estatus)

        if orden_admision_id:
            query += " AND p.orden_admision_id = %s"
            params.append(orden_admision_id)

        if numero_reporte_siniestro:
            query += " AND p.numero_reporte_siniestro ILIKE %s"
            params.append(f"%{numero_reporte_siniestro.strip()}%")

        if search:
            term = f"%{search.strip()}%"
            query += """
                AND (
                    p.folio ILIKE %s
                    OR COALESCE(p.folio_ot, '') ILIKE %s
                    OR COALESCE(p.numero_reporte_siniestro, '') ILIKE %s
                    OR p.proveedor_nombre ILIKE %s
                    OR COALESCE(p.comentarios, '') ILIKE %s
                    OR EXISTS (
                        SELECT 1
                        FROM paquetes_piezas_relaciones prx
                        WHERE prx.paquete_id = p.id
                          AND (
                              prx.nombre_pieza ILIKE %s
                              OR COALESCE(prx.numero_parte, '') ILIKE %s
                          )
                    )
                )
            """
            params.extend([term, term, term, term, term, term, term])

        query += """
            GROUP BY p.id
            ORDER BY p.fecha_arribo DESC, p.id DESC
            LIMIT %s OFFSET %s
        """
        params.extend([limit, offset])
        return list(conn.execute(query, params).fetchall())


@router.get("/paquetes/{paquete_id}", response_model=PaquetePiezasDetail)
def get_paquete(paquete_id: int):
    with get_connection() as conn:
        ensure_paquetes_piezas_tables(conn)
        return _build_paquete_detail(conn, paquete_id)


@router.post("/paquetes", response_model=PaquetePiezasDetail, status_code=status.HTTP_201_CREATED)
def create_paquete(payload: PaquetePiezasCreate):
    if not payload.proveedor_nombre.strip():
        raise HTTPException(status_code=400, detail="proveedor_nombre requerido")

    with get_connection() as conn:
        conn.row_factory = dict_row
        ensure_paquetes_piezas_tables(conn)
        _sync_paquetes_piezas_folio_sequence(conn)

        orden = _get_orden_admision_snapshot(conn, payload.orden_admision_id)
        numero_reporte = (payload.numero_reporte_siniestro or "").strip() or (
            str(orden.get("reporte_siniestro") or "").strip() if orden else None
        )

        paquete = conn.execute(
            """
            INSERT INTO paquetes_piezas (
                orden_admision_id,
                folio_ot,
                numero_reporte_siniestro,
                proveedor_nombre,
                fecha_arribo,
                estatus,
                comentarios
            )
            VALUES (%s, %s, %s, %s, COALESCE(%s, NOW()), %s, %s)
            RETURNING id
            """,
            (
                payload.orden_admision_id,
                (payload.folio_ot or "").strip() or None,
                numero_reporte,
                payload.proveedor_nombre.strip(),
                payload.fecha_arribo,
                (payload.estatus or "Pendiente").strip() or "Pendiente",
                (payload.comentarios or "").strip() or None,
            ),
        ).fetchone()

        _insert_paquete_relaciones(conn, paquete["id"], payload.relaciones)
        return _build_paquete_detail(conn, paquete["id"])


@router.put("/paquetes/{paquete_id}", response_model=PaquetePiezasDetail)
def update_paquete(paquete_id: int, payload: PaquetePiezasUpdate):
    with get_connection() as conn:
        conn.row_factory = dict_row
        ensure_paquetes_piezas_tables(conn)
        _ensure_paquete_exists(conn, paquete_id)

        updates = payload.model_dump(exclude_unset=True)
        relaciones = updates.pop("relaciones", None) if "relaciones" in updates else None

        if "orden_admision_id" in updates and updates["orden_admision_id"] is not None:
            orden = _get_orden_admision_snapshot(conn, updates["orden_admision_id"])
            if "numero_reporte_siniestro" not in updates or not str(updates["numero_reporte_siniestro"] or "").strip():
                updates["numero_reporte_siniestro"] = str(orden.get("reporte_siniestro") or "").strip() or None

        query_updates: list[str] = []
        params: list[Any] = []
        for field in (
            "orden_admision_id",
            "folio_ot",
            "numero_reporte_siniestro",
            "proveedor_nombre",
            "fecha_arribo",
            "estatus",
            "comentarios",
        ):
            if field not in updates:
                continue
            value = updates[field]
            if isinstance(value, str):
                value = value.strip() or None
            query_updates.append(f"{field} = %s")
            params.append(value)

        if not query_updates and relaciones is None:
            raise HTTPException(status_code=400, detail="No se proporcionaron cambios para actualizar")

        if query_updates:
            params.append(paquete_id)
            updated = conn.execute(
                f"""
                UPDATE paquetes_piezas
                SET {', '.join(query_updates)}, updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
                RETURNING id
                """,
                params,
            ).fetchone()
            if not updated:
                raise HTTPException(status_code=404, detail="Paquete no encontrado")

        if relaciones is not None:
            conn.execute(
                """
                DELETE FROM paquetes_piezas_relaciones
                WHERE paquete_id = %s
                """,
                (paquete_id,),
            )
            _insert_paquete_relaciones(
                conn,
                paquete_id,
                [PaquetePiezaRelacionCreate(**relacion) if isinstance(relacion, dict) else relacion for relacion in relaciones],
            )

        return _build_paquete_detail(conn, paquete_id)


@router.delete("/paquetes/{paquete_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_paquete(paquete_id: int):
    with get_connection() as conn:
        conn.row_factory = dict_row
        ensure_paquetes_piezas_tables(conn)
        _ensure_paquete_exists(conn, paquete_id)
        media_rows = conn.execute(
            """
            SELECT file_path
            FROM paquetes_piezas_media
            WHERE paquete_id = %s
            """,
            (paquete_id,),
        ).fetchall()
        conn.execute("DELETE FROM paquetes_piezas WHERE id = %s", (paquete_id,))

    app_root = Path(__file__).resolve().parent.parent.parent
    for row in media_rows:
        disk_path = app_root / str(row.get("file_path") or "").lstrip("/")
        if disk_path.exists() and disk_path.is_file():
            try:
                disk_path.unlink()
            except Exception:
                pass

    package_dir = _paquetes_media_root() / str(paquete_id)
    if package_dir.exists() and package_dir.is_dir():
        for file_path in package_dir.iterdir():
            if file_path.is_file():
                try:
                    file_path.unlink()
                except Exception:
                    pass
        try:
            package_dir.rmdir()
        except Exception:
            pass

    return None


@router.get("/paquetes/{paquete_id}/relaciones", response_model=List[PaquetePiezaRelacion])
def list_paquete_relaciones(paquete_id: int):
    with get_connection() as conn:
        ensure_paquetes_piezas_tables(conn)
        _ensure_paquete_exists(conn, paquete_id)
        return _list_paquete_relaciones(conn, paquete_id)


@router.post(
    "/paquetes/{paquete_id}/relaciones",
    response_model=PaquetePiezaRelacion,
    status_code=status.HTTP_201_CREATED,
)
def create_paquete_relacion(paquete_id: int, payload: PaquetePiezaRelacionCreate):
    if not payload.nombre_pieza.strip():
        raise HTTPException(status_code=400, detail="nombre_pieza requerido")

    with get_connection() as conn:
        conn.row_factory = dict_row
        ensure_paquetes_piezas_tables(conn)
        _ensure_paquete_exists(conn, paquete_id)
        relacion = conn.execute(
            """
            INSERT INTO paquetes_piezas_relaciones (
                paquete_id,
                bitacora_pieza_id,
                nombre_pieza,
                numero_parte,
                cantidad,
                estatus,
                observaciones
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING
                id,
                paquete_id,
                bitacora_pieza_id,
                nombre_pieza,
                numero_parte,
                cantidad,
                estatus,
                observaciones,
                created_at,
                updated_at
            """,
            (
                paquete_id,
                payload.bitacora_pieza_id,
                payload.nombre_pieza.strip(),
                (payload.numero_parte or "").strip() or None,
                payload.cantidad,
                (payload.estatus or "Pendiente").strip() or "Pendiente",
                (payload.observaciones or "").strip() or None,
            ),
        ).fetchone()
        return relacion


@router.put("/paquetes/relaciones/{relacion_id}", response_model=PaquetePiezaRelacion)
def update_paquete_relacion(relacion_id: int, payload: PaquetePiezaRelacionUpdate):
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No se proporcionaron cambios para actualizar")

    query_updates: list[str] = []
    params: list[Any] = []
    for field in ("bitacora_pieza_id", "nombre_pieza", "numero_parte", "cantidad", "estatus", "observaciones"):
        if field not in updates:
            continue
        value = updates[field]
        if isinstance(value, str):
            value = value.strip() or None
        query_updates.append(f"{field} = %s")
        params.append(value)

    with get_connection() as conn:
        conn.row_factory = dict_row
        ensure_paquetes_piezas_tables(conn)
        params.append(relacion_id)
        relacion = conn.execute(
            f"""
            UPDATE paquetes_piezas_relaciones
            SET {', '.join(query_updates)}, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            RETURNING
                id,
                paquete_id,
                bitacora_pieza_id,
                nombre_pieza,
                numero_parte,
                cantidad,
                estatus,
                observaciones,
                created_at,
                updated_at
            """,
            params,
        ).fetchone()
        if not relacion:
            raise HTTPException(status_code=404, detail="Relación no encontrada")
        return relacion


@router.delete("/paquetes/relaciones/{relacion_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_paquete_relacion(relacion_id: int):
    with get_connection() as conn:
        ensure_paquetes_piezas_tables(conn)
        deleted = conn.execute(
            """
            DELETE FROM paquetes_piezas_relaciones
            WHERE id = %s
            RETURNING id
            """,
            (relacion_id,),
        ).fetchone()
        if not deleted:
            raise HTTPException(status_code=404, detail="Relación no encontrada")
    return None


@router.post("/paquetes/{paquete_id}/media", response_model=PaquetePiezaMedia, status_code=status.HTTP_201_CREATED)
def upload_paquete_media(
    paquete_id: int,
    media_type: str = Query("photo", description="Tipo de archivo: photo o document"),
    file: UploadFile = File(...),
):
    if media_type not in {"photo", "document"}:
        raise HTTPException(status_code=400, detail="media_type inválido")

    with get_connection() as conn:
        conn.row_factory = dict_row
        ensure_paquetes_piezas_tables(conn)
        _ensure_paquete_exists(conn, paquete_id)

        media_root = _paquetes_media_root() / str(paquete_id)
        media_root.mkdir(parents=True, exist_ok=True)

        extension = Path(file.filename or "").suffix.lower()
        filename = f"{media_type}_{uuid4().hex}{extension}"
        file_path = media_root / filename
        file_bytes = file.file.read()
        with file_path.open("wb") as buffer:
            buffer.write(file_bytes)

        relative_path = f"/media/paquetes_piezas/{paquete_id}/{filename}"
        media = conn.execute(
            """
            INSERT INTO paquetes_piezas_media (
                paquete_id,
                media_type,
                file_path,
                original_name,
                mime_type,
                file_size
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING
                id,
                paquete_id,
                media_type,
                file_path,
                original_name,
                mime_type,
                file_size,
                created_at
            """,
            (
                paquete_id,
                media_type,
                relative_path,
                file.filename,
                file.content_type,
                len(file_bytes),
            ),
        ).fetchone()
        return media


@router.get("/paquetes/{paquete_id}/media", response_model=List[PaquetePiezaMedia])
def list_paquete_media(paquete_id: int):
    with get_connection() as conn:
        ensure_paquetes_piezas_tables(conn)
        _ensure_paquete_exists(conn, paquete_id)
        return _list_paquete_media(conn, paquete_id)


@router.delete("/paquetes/media/{media_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_paquete_media(media_id: int):
    with get_connection() as conn:
        conn.row_factory = dict_row
        ensure_paquetes_piezas_tables(conn)
        media = conn.execute(
            """
            DELETE FROM paquetes_piezas_media
            WHERE id = %s
            RETURNING id, file_path
            """,
            (media_id,),
        ).fetchone()
        if not media:
            raise HTTPException(status_code=404, detail="Archivo no encontrado")

    app_root = Path(__file__).resolve().parent.parent.parent
    disk_path = app_root / str(media.get("file_path") or "").lstrip("/")
    if disk_path.exists() and disk_path.is_file():
        try:
            disk_path.unlink()
        except Exception:
            pass
    return None


# =====================================================
# ENDPOINTS DE ESTADÍSTICAS
# =====================================================

@router.get("/estadisticas")
def get_estadisticas(
    fuente: Optional[str] = Query(None, description="Filtrar por fuente")
):
    """Obtiene estadísticas de la bitácora de piezas"""
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                # Base query
                base_where = "WHERE 1=1"
                params = []
                
                if fuente and fuente != "Todas":
                    base_where += " AND fuente = %s"
                    params.append(fuente)
                
                # Contar por estatus
                cur.execute(f"""
                    SELECT estatus, COUNT(*) as total 
                    FROM bitacora_piezas 
                    {base_where}
                    GROUP BY estatus
                """, params)
                por_estatus = {row[0]: row[1] for row in cur.fetchall()}
                
                # Contar por tipo de registro
                cur.execute(f"""
                    SELECT tipo_registro, COUNT(*) as total 
                    FROM bitacora_piezas 
                    {base_where}
                    GROUP BY tipo_registro
                """, params)
                por_tipo = {row[0]: row[1] for row in cur.fetchall()}
                
                # Totales
                cur.execute(f"""
                    SELECT 
                        COUNT(*) as total,
                        COUNT(CASE WHEN recibido = true THEN 1 END) as recibidas,
                        COUNT(CASE WHEN entregado = true THEN 1 END) as entregadas,
                        COUNT(CASE WHEN devolucion_proveedor = true THEN 1 END) as devoluciones,
                        SUM(demeritos) as total_demeritos
                    FROM bitacora_piezas 
                    {base_where}
                """, params)
                row = cur.fetchone()
                
                return {
                    "totales": {
                        "piezas": row[0] or 0,
                        "recibidas": row[1] or 0,
                        "entregadas": row[2] or 0,
                        "devoluciones": row[3] or 0,
                        "demeritos": float(row[4]) if row[4] else 0
                    },
                    "por_estatus": por_estatus,
                    "por_tipo": por_tipo
                }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =====================================================
# HEALTH CHECK
# =====================================================

@router.get("/health")
def health_check():
    """Verifica que el módulo de inventario esté funcionando"""
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM bitacora_piezas")
                count = cur.fetchone()[0]
                return {
                    "module": "inventario",
                    "status": "ok",
                    "total_piezas": count
                }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =====================================================
# EXTRACCIÓN AUTOMÁTICA DE PIEZAS (CRONJOB)
# =====================================================

@router.post("/extract/qualitas")
async def extract_qualitas_piezas(
    background_tasks: BackgroundTasks,
    max_ordenes: int = Query(10, ge=1, le=50, description="Máximo de órdenes a procesar"),
    api_key: str = Query(..., description="API Key para autenticación"),
    reset_checkpoint: bool = Query(False, description="Reiniciar checkpoint y empezar desde cero"),
    max_retries: int = Query(3, ge=1, le=5, description="Máximo de reintentos automáticos")
):
    """
    Endpoint para ejecutar la extracción automática de piezas de Qualitas.
    Diseñado para ser llamado por un cronjob cada 4 horas.
    
    - Usa sistema de checkpoints para reanudar si se interrumpe
    - Reintentos automáticos con backoff exponencial
    - Máximo 30 minutos por intento
    
    Requiere api_key en query params para autenticación.
    """
    # Verificar API Key (simple, puedes mejorarlo)
    expected_key = os.environ.get("CRON_API_KEY", "lamarina-cron-2024")
    if api_key != expected_key:
        raise HTTPException(status_code=401, detail="API Key inválida")
    
    try:
        from app.rpa.qualitas_piezas_workflow import QualitasPiezasWorkflow
        
        print(f"[{datetime.now()}] Iniciando extracción automática de piezas Qualitas")
        print(f"  Max órdenes: {max_ordenes}")
        print(f"  Max retries: {max_retries}")
        print(f"  Reset checkpoint: {reset_checkpoint}")
        
        workflow = QualitasPiezasWorkflow(headless=True, max_retries=max_retries)
        
        # Usar run_with_retries para reintentos automáticos
        result = await workflow.run_with_retries(
            max_ordenes=max_ordenes,
            use_existing_session=True,
            use_db=True,
            max_total_time=1800,  # 30 minutos por intento
            reset_checkpoint=reset_checkpoint
        )
        
        return {
            "success": result.get('success', False),
            "partial_results": result.get('partial_results', False),
            "timestamp": datetime.now().isoformat(),
            "retries_used": result.get('retries_used', 0),
            "checkpoint_stats": result.get('checkpoint_stats'),
            "ordenes_procesadas": len(result.get('detalle_ordenes', [])),
            "total_piezas": result.get('total_piezas', 0),
            "detalle": result.get('detalle_ordenes', []),
            "logs": result.get('logs', '')
        }
        
    except Exception as e:
        print(f"[{datetime.now()}] Error en extracción: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error en extracción: {str(e)}")


@router.get("/extract/qualitas/status")
def get_last_extraction_status():
    """Obtiene información sobre la última extracción"""
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                # Contar piezas extraídas en las últimas 24 horas
                cur.execute("""
                    SELECT 
                        COUNT(*) as total,
                        COUNT(DISTINCT num_expediente) as ordenes,
                        MAX(fecha_extraccion) as ultima_extraccion
                    FROM bitacora_piezas
                    WHERE fecha_extraccion >= NOW() - INTERVAL '24 hours'
                    AND fuente = 'Qualitas'
                """)
                row = cur.fetchone()
                
                return {
                    "ultimas_24h": {
                        "total_piezas": row[0],
                        "ordenes_procesadas": row[1],
                        "ultima_extraccion": row[2]
                    }
                }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

import os
