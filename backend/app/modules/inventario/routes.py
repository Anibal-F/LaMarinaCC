from fastapi import APIRouter, HTTPException, Query, BackgroundTasks
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime
import asyncio
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
    api_key: str = Query(..., description="API Key para autenticación")
):
    """
    Endpoint para ejecutar la extracción automática de piezas de Qualitas.
    Diseñado para ser llamado por un cronjob cada 4 horas.
    
    Requiere api_key en query params para autenticación.
    """
    # Verificar API Key (simple, puedes mejorarlo)
    expected_key = os.environ.get("CRON_API_KEY", "lamarina-cron-2024")
    if api_key != expected_key:
        raise HTTPException(status_code=401, detail="API Key inválida")
    
    try:
        # Importar aquí para evitar circular imports
        from playwright.async_api import async_playwright
        from app.rpa.qualitas_piezas_workflow import QualitasPiezasWorkflow
        
        print(f"[{datetime.now()}] Iniciando extracción automática de piezas Qualitas")
        print(f"  Max órdenes: {max_ordenes}")
        
        workflow = QualitasPiezasWorkflow(headless=True, max_ordenes=max_ordenes)
        resultados = await workflow.run()
        
        total_piezas = sum(len(r.piezas) for r in resultados)
        
        return {
            "success": True,
            "timestamp": datetime.now().isoformat(),
            "ordenes_procesadas": len(resultados),
            "total_piezas": total_piezas,
            "detalle": [
                {
                    "num_expediente": r.num_expediente,
                    "num_orden": r.num_orden,
                    "numero_reporte": r.numero_reporte,
                    "piezas_count": len(r.piezas)
                }
                for r in resultados
            ]
        }
        
    except Exception as e:
        print(f"[{datetime.now()}] Error en extracción: {e}")
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
