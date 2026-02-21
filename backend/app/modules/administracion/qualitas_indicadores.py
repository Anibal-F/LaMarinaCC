"""
Módulo para gestionar indicadores de Qualitas extraídos por RPA.

Este módulo proporciona:
- Almacenamiento de indicadores en la base de datos
- Endpoint para consultar los indicadores más recientes
- Endpoint para ejecutar el RPA y actualizar indicadores
"""

import json
import subprocess
import os
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, status, BackgroundTasks
from pydantic import BaseModel
from psycopg.rows import dict_row
from app.core.db import get_connection

router = APIRouter(prefix="/qualitas", tags=["qualitas"])


# ============================================================================
# MODELOS Pydantic
# ============================================================================

class IndicadorItem(BaseModel):
    nombre: str
    cantidad: int


class IndicadoresResponse(BaseModel):
    id: int
    taller_id: str
    taller_nombre: str
    fecha_extraccion: str
    asignados: int
    revisar_valuacion: int
    complemento_autorizado: int
    complemento_solicitado: int
    complemento_rechazado: int
    total_complementos: int
    pago_danos: int
    perdida_total: int
    dano_menor_deducible: int
    pendiente_terminar: int
    total_ordenes: int
    raw_data: Optional[Dict[str, Any]] = None


class RPAUpdateResponse(BaseModel):
    success: bool
    message: str
    job_id: Optional[str] = None
    indicadores: Optional[IndicadoresResponse] = None


# ============================================================================
# FUNCIONES DE BASE DE DATOS
# ============================================================================

def ensure_table_exists():
    """Crea la tabla de indicadores si no existe."""
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS qualitas_indicadores (
                id SERIAL PRIMARY KEY,
                taller_id VARCHAR(50) NOT NULL,
                taller_nombre VARCHAR(255),
                fecha_extraccion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                asignados INTEGER DEFAULT 0,
                revisar_valuacion INTEGER DEFAULT 0,
                complemento_autorizado INTEGER DEFAULT 0,
                complemento_solicitado INTEGER DEFAULT 0,
                complemento_rechazado INTEGER DEFAULT 0,
                pago_danos INTEGER DEFAULT 0,
                perdida_total INTEGER DEFAULT 0,
                dano_menor_deducible INTEGER DEFAULT 0,
                pendiente_terminar INTEGER DEFAULT 0,
                total_ordenes INTEGER DEFAULT 0,
                raw_data JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()


def save_indicadores(data: Dict[str, Any]) -> int:
    """Guarda los indicadores extraídos en la base de datos."""
    ensure_table_exists()
    
    # Extraer valores de los estatus
    estatus_map = {e['nombre']: e['cantidad'] for e in data.get('estatus', [])}
    
    asignados = estatus_map.get('Asignados', 0)
    revisar_valuacion = estatus_map.get('Revisar Valuación', 0)
    complemento_autorizado = estatus_map.get('Complemento Autorizado', 0)
    complemento_solicitado = estatus_map.get('Complemento Solicitado', 0)
    complemento_rechazado = estatus_map.get('Complemento Rechazado', 0)
    pago_danos = estatus_map.get('Pago de Daños', 0)
    perdida_total = estatus_map.get('Pérdida Total', 0)
    dano_menor_deducible = estatus_map.get('Daño Menor a Deducible', 0)
    pendiente_terminar = estatus_map.get('Pendiente de terminar', 0)
    
    total_complementos = complemento_autorizado + complemento_solicitado + complemento_rechazado
    total_ordenes = data.get('total_ordenes', 0)
    
    with get_connection() as conn:
        row = conn.execute("""
            INSERT INTO qualitas_indicadores (
                taller_id, taller_nombre, fecha_extraccion,
                asignados, revisar_valuacion,
                complemento_autorizado, complemento_solicitado, complemento_rechazado,
                pago_danos, perdida_total, dano_menor_deducible, pendiente_terminar,
                total_ordenes, raw_data
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (
            data.get('taller_id', ''),
            data.get('taller_nombre', ''),
            data.get('fecha_extraccion', datetime.now().isoformat()),
            asignados, revisar_valuacion,
            complemento_autorizado, complemento_solicitado, complemento_rechazado,
            pago_danos, perdida_total, dano_menor_deducible, pendiente_terminar,
            total_ordenes, json.dumps(data)
        )).fetchone()
        conn.commit()
        return row[0]


def get_latest_indicadores() -> Optional[Dict[str, Any]]:
    """Obtiene los indicadores más recientes."""
    ensure_table_exists()
    
    with get_connection() as conn:
        conn.row_factory = dict_row
        row = conn.execute("""
            SELECT * FROM qualitas_indicadores
            ORDER BY fecha_extraccion DESC
            LIMIT 1
        """).fetchone()
        
        if row:
            # Calcular total de complementos
            row['total_complementos'] = (
                row['complemento_autorizado'] + 
                row['complemento_solicitado'] + 
                row['complemento_rechazado']
            )
            return dict(row)
        return None


def get_indicadores_history(limit: int = 30) -> List[Dict[str, Any]]:
    """Obtiene el historial de indicadores."""
    ensure_table_exists()
    
    with get_connection() as conn:
        conn.row_factory = dict_row
        rows = conn.execute("""
            SELECT 
                id, taller_id, taller_nombre, fecha_extraccion,
                asignados, revisar_valuacion,
                complemento_autorizado + complemento_solicitado + complemento_rechazado as total_complementos,
                total_ordenes
            FROM qualitas_indicadores
            ORDER BY fecha_extraccion DESC
            LIMIT %s
        """, (limit,)).fetchall()
        
        return [dict(row) for row in rows]


# ============================================================================
# EJECUCIÓN DEL RPA
# ============================================================================

def run_qualitas_rpa_sync() -> Dict[str, Any]:
    """
    Ejecuta el RPA de Qualitas y devuelve los indicadores.
    Esta función es síncrona y bloqueante - usar en background tasks.
    """
    backend_dir = Path(__file__).resolve().parents[3]
    script_path = backend_dir / "app" / "rpa" / "qualitas_full_workflow.py"
    
    if not script_path.exists():
        raise FileNotFoundError(f"Script no encontrado: {script_path}")
    
    # Archivo temporal para output JSON
    output_file = backend_dir / "app" / "rpa" / "data" / "latest_indicadores.json"
    output_file.parent.mkdir(parents=True, exist_ok=True)
    
    cmd = [
        "python3", "-m", "app.rpa.qualitas_full_workflow",
        "--headless",
        "--save-json"
    ]
    
    try:
        result = subprocess.run(
            cmd,
            cwd=str(backend_dir),
            capture_output=True,
            text=True,
            timeout=300,  # 5 minutos
            encoding='utf-8',
            errors='replace'
        )
        
        if result.returncode != 0:
            raise RuntimeError(f"RPA falló: {result.stderr}")
        
        # Buscar el archivo JSON más reciente
        data_dir = backend_dir / "app" / "rpa" / "data"
        json_files = sorted(data_dir.glob("qualitas_dashboard_*.json"), reverse=True)
        
        if not json_files:
            raise FileNotFoundError("No se encontró archivo de datos del RPA")
        
        # Leer el archivo más reciente
        with open(json_files[0], 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Guardar en base de datos
        save_indicadores(data)
        
        return {
            "success": True,
            "message": "RPA ejecutado exitosamente",
            "data": data
        }
        
    except subprocess.TimeoutExpired:
        raise TimeoutError("El RPA tardó más de 5 minutos")
    except Exception as e:
        raise RuntimeError(f"Error ejecutando RPA: {str(e)}")


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.get("/indicadores", response_model=IndicadoresResponse)
async def get_indicadores():
    """
    Obtiene los indicadores más recientes de Qualitas.
    Si no hay datos, devuelve 404.
    """
    indicadores = get_latest_indicadores()
    
    if not indicadores:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No hay indicadores disponibles. Ejecute el RPA primero."
        )
    
    return indicadores


@router.post("/indicadores/actualizar", response_model=RPAUpdateResponse)
async def actualizar_indicadores(background_tasks: BackgroundTasks):
    """
    Ejecuta el RPA para actualizar los indicadores.
    Esto puede tardar 30-120 segundos.
    """
    job_id = f"qualitas_update_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    
    try:
        # Ejecutar síncronamente (puede tardar)
        result = run_qualitas_rpa_sync()
        
        return RPAUpdateResponse(
            success=True,
            message="Indicadores actualizados exitosamente",
            job_id=job_id,
            indicadores=get_latest_indicadores()
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error actualizando indicadores: {str(e)}"
        )


@router.get("/indicadores/historial")
async def get_historial(limit: int = 30):
    """Obtiene el historial de indicadores."""
    return get_indicadores_history(limit)


@router.get("/indicadores/estatus")
async def get_estatus():
    """
    Devuelve información sobre la última actualización.
    """
    indicadores = get_latest_indicadores()
    
    if not indicadores:
        return {
            "hay_datos": False,
            "mensaje": "No hay datos disponibles",
            "recomendacion": "Ejecute POST /admin/qualitas/indicadores/actualizar"
        }
    
    # Calcular antigüedad
    fecha_extraccion = datetime.fromisoformat(indicadores['fecha_extraccion'].replace('Z', '+00:00'))
    ahora = datetime.now(fecha_extraccion.tzinfo)
    antiguedad = ahora - fecha_extraccion
    
    return {
        "hay_datos": True,
        "fecha_ultima_actualizacion": indicadores['fecha_extraccion'],
        "antiguedad_horas": antiguedad.total_seconds() / 3600,
        "datos_frescos": antiguedad < timedelta(hours=2),
        "total_ordenes": indicadores['total_ordenes'],
        "taller": indicadores['taller_nombre']
    }
