"""
Rutas para gestionar la configuración de sincronización automática (autosync)
de las aseguradoras desde el panel de administración.
"""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from typing import List, Optional
from psycopg.rows import dict_row

from app.core.db import get_connection

router = APIRouter(prefix="/autosync", tags=["autosync"])


# ============================================================================
# MODELOS
# ============================================================================

class AutosyncConfig(BaseModel):
    """Modelo para configuración de autosync."""
    id: int
    seguro: str
    plataforma_url: Optional[str] = None
    usuario: Optional[str] = None
    taller_id: Optional[str] = None
    activo: bool = True
    autosync: bool = False
    synctime: int = Field(default=2, ge=1, le=24, description="Horas entre sincronizaciones (1-24)")


class AutosyncUpdateRequest(BaseModel):
    """Modelo para actualizar configuración de autosync."""
    autosync: bool = Field(..., description="Habilitar/deshabilitar sincronización automática")
    synctime: int = Field(default=2, ge=1, le=24, description="Horas entre sincronizaciones (1-24)")


class AutosyncStatusResponse(BaseModel):
    """Modelo para respuesta de estado del scheduler."""
    seguro: str
    scheduler_name: str
    autosync: bool
    synctime: int
    scheduler_running: bool
    last_run: Optional[str] = None
    next_run: Optional[str] = None


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.get("/config", response_model=List[AutosyncConfig])
def get_all_autosync_configs():
    """
    Obtiene la configuración de autosync para todas las aseguradoras.
    """
    with get_connection() as conn:
        conn.row_factory = dict_row
        rows = conn.execute(
            """
            SELECT 
                id, 
                seguro, 
                plataforma_url, 
                usuario, 
                taller_id, 
                activo,
                COALESCE(autosync, false) as autosync,
                COALESCE(synctime, 2) as synctime
            FROM aseguradora_credenciales
            ORDER BY id ASC
            """
        ).fetchall()
    
    return [dict(row) for row in rows]


@router.get("/config/{seguro}", response_model=AutosyncConfig)
def get_autosync_config(seguro: str):
    """
    Obtiene la configuración de autosync para una aseguradora específica.
    """
    with get_connection() as conn:
        conn.row_factory = dict_row
        row = conn.execute(
            """
            SELECT 
                id, 
                seguro, 
                plataforma_url, 
                usuario, 
                taller_id, 
                activo,
                COALESCE(autosync, false) as autosync,
                COALESCE(synctime, 2) as synctime
            FROM aseguradora_credenciales
            WHERE seguro ILIKE %s
            LIMIT 1
            """,
            (f"%{seguro}%",)
        ).fetchone()
    
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Aseguradora '{seguro}' no encontrada"
        )
    
    return dict(row)


@router.patch("/config/{seguro}", response_model=AutosyncConfig)
def update_autosync_config(seguro: str, config: AutosyncUpdateRequest):
    """
    Actualiza la configuración de autosync para una aseguradora.
    """
    with get_connection() as conn:
        conn.row_factory = dict_row
        
        # Verificar que existe
        exists = conn.execute(
            "SELECT id FROM aseguradora_credenciales WHERE seguro ILIKE %s",
            (f"%{seguro}%",)
        ).fetchone()
        
        if not exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Aseguradora '{seguro}' no encontrada"
            )
        
        # Actualizar
        conn.execute(
            """
            UPDATE aseguradora_credenciales
            SET autosync = %s, synctime = %s
            WHERE seguro ILIKE %s
            """,
            (config.autosync, config.synctime, f"%{seguro}%")
        )
        
        # Retornar configuración actualizada
        row = conn.execute(
            """
            SELECT 
                id, 
                seguro, 
                plataforma_url, 
                usuario, 
                taller_id, 
                activo,
                COALESCE(autosync, false) as autosync,
                COALESCE(synctime, 2) as synctime
            FROM aseguradora_credenciales
            WHERE seguro ILIKE %s
            LIMIT 1
            """,
            (f"%{seguro}%",)
        ).fetchone()
    
    return dict(row)


@router.post("/config/{seguro}/enable", response_model=AutosyncConfig)
def enable_autosync(seguro: str, synctime: Optional[int] = 2):
    """
    Habilita la sincronización automática para una aseguradora.
    """
    with get_connection() as conn:
        conn.row_factory = dict_row
        
        # Verificar que existe
        exists = conn.execute(
            "SELECT id FROM aseguradora_credenciales WHERE seguro ILIKE %s",
            (f"%{seguro}%",)
        ).fetchone()
        
        if not exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Aseguradora '{seguro}' no encontrada"
            )
        
        # Habilitar
        conn.execute(
            """
            UPDATE aseguradora_credenciales
            SET autosync = true, synctime = %s
            WHERE seguro ILIKE %s
            """,
            (synctime, f"%{seguro}%")
        )
        
        row = conn.execute(
            """
            SELECT 
                id, 
                seguro, 
                plataforma_url, 
                usuario, 
                taller_id, 
                activo,
                COALESCE(autosync, false) as autosync,
                COALESCE(synctime, 2) as synctime
            FROM aseguradora_credenciales
            WHERE seguro ILIKE %s
            LIMIT 1
            """,
            (f"%{seguro}%",)
        ).fetchone()
    
    return dict(row)


@router.post("/config/{seguro}/disable", response_model=AutosyncConfig)
def disable_autosync(seguro: str):
    """
    Deshabilita la sincronización automática para una aseguradora.
    """
    with get_connection() as conn:
        conn.row_factory = dict_row
        
        # Verificar que existe
        exists = conn.execute(
            "SELECT id FROM aseguradora_credenciales WHERE seguro ILIKE %s",
            (f"%{seguro}%",)
        ).fetchone()
        
        if not exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Aseguradora '{seguro}' no encontrada"
            )
        
        # Deshabilitar
        conn.execute(
            """
            UPDATE aseguradora_credenciales
            SET autosync = false
            WHERE seguro ILIKE %s
            """,
            (f"%{seguro}%",)
        )
        
        row = conn.execute(
            """
            SELECT 
                id, 
                seguro, 
                plataforma_url, 
                usuario, 
                taller_id, 
                activo,
                COALESCE(autosync, false) as autosync,
                COALESCE(synctime, 2) as synctime
            FROM aseguradora_credenciales
            WHERE seguro ILIKE %s
            LIMIT 1
            """,
            (f"%{seguro}%",)
        ).fetchone()
    
    return dict(row)


@router.get("/status", response_model=List[AutosyncStatusResponse])
def get_autosync_status():
    """
    Obtiene el estado de sincronización automática de todos los schedulers.
    Incluye información de la BD y del scheduler en ejecución.
    """
    # Mapeo de seguro a scheduler
    SEGURO_TO_SCHEDULER = {
        "QUALITAS": "qualitas",
        "CHUBB": "chubb"
    }
    
    # Obtener configuraciones de BD
    with get_connection() as conn:
        conn.row_factory = dict_row
        rows = conn.execute(
            """
            SELECT 
                seguro,
                COALESCE(autosync, false) as autosync,
                COALESCE(synctime, 2) as synctime
            FROM aseguradora_credenciales
            ORDER BY id ASC
            """
        ).fetchall()
    
    configs = [dict(row) for row in rows]
    
    # Intentar obtener estado de los schedulers
    scheduler_status = {}
    try:
        from app.modules.administracion.rpa_scheduler import get_scheduler_status
        scheduler_status = get_scheduler_status()
    except Exception:
        pass
    
    # Combinar información
    result = []
    for config in configs:
        seguro = config['seguro']
        scheduler_name = SEGURO_TO_SCHEDULER.get(seguro, seguro.lower())
        sched_status = scheduler_status.get(scheduler_name, {})
        
        result.append({
            "seguro": seguro,
            "scheduler_name": scheduler_name,
            "autosync": config['autosync'],
            "synctime": config['synctime'],
            "scheduler_running": sched_status.get('running', False),
            "last_run": sched_status.get('last_run'),
            "next_run": sched_status.get('next_run')
        })
    
    return result
