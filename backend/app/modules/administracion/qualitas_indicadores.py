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
from zoneinfo import ZoneInfo
from fastapi import APIRouter, HTTPException, status, BackgroundTasks
from pydantic import BaseModel
from psycopg.rows import dict_row
from app.core.db import get_connection

# Zona horaria de Mazatlán (Pacific/Mountain)
MAZATLAN_TZ = ZoneInfo("America/Mazatlan")

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
    import logging
    logger = logging.getLogger(__name__)
    
    logger.info(f"[save_indicadores] Iniciando guardado de datos: {data.get('taller_nombre', 'N/A')}")
    
    ensure_table_exists()
    
    # Extraer valores de los estatus
    estatus_list = data.get('estatus', [])
    logger.info(f"[save_indicadores] Estatus encontrados: {len(estatus_list)}")
    
    estatus_map = {e['nombre']: e['cantidad'] for e in estatus_list}
    
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
    
    try:
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
                data.get('fecha_extraccion', datetime.now(MAZATLAN_TZ).isoformat()),
                asignados, revisar_valuacion,
                complemento_autorizado, complemento_solicitado, complemento_rechazado,
                pago_danos, perdida_total, dano_menor_deducible, pendiente_terminar,
                total_ordenes, json.dumps(data)
            )).fetchone()
            conn.commit()
            logger.info(f"[save_indicadores] ✓ Guardado con ID: {row[0]}")
            return row[0]
    except Exception as e:
        logger.error(f"[save_indicadores] ✗ Error en INSERT: {e}")
        import traceback
        logger.error(f"[save_indicadores] Traceback: {traceback.format_exc()}")
        raise


def serialize_datetime(obj):
    """Serializa objetos datetime a string ISO format."""
    if isinstance(obj, datetime):
        return obj.isoformat()
    return obj


def serialize_row(row: Dict[str, Any]) -> Dict[str, Any]:
    """Serializa todas las fechas datetime en un diccionario."""
    result = {}
    for key, value in row.items():
        if isinstance(value, datetime):
            result[key] = value.isoformat()
        else:
            result[key] = value
    return result


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
            row = dict(row)
            # Calcular total de complementos
            row['total_complementos'] = (
                row['complemento_autorizado'] + 
                row['complemento_solicitado'] + 
                row['complemento_rechazado']
            )
            # Serializar fechas
            return serialize_row(row)
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
        
        return [serialize_row(dict(row)) for row in rows]


# ============================================================================
# EJECUCIÓN DEL RPA
# ============================================================================

def run_qualitas_rpa_sync(use_existing_session: bool = True) -> Dict[str, Any]:
    """
    Ejecuta el RPA de Qualitas y devuelve los indicadores.
    Esta función es síncrona y bloqueante - usar en background tasks.
    """
    import logging
    logger = logging.getLogger(__name__)
    
    backend_dir = Path(__file__).resolve().parents[3]
    script_path = backend_dir / "app" / "rpa" / "qualitas_full_workflow.py"
    session_path = backend_dir / "app" / "rpa" / "sessions" / "qualitas_session.json"
    
    logger.info(f"[RPA] Iniciando ejecución desde: {script_path}")
    
    if not script_path.exists():
        raise FileNotFoundError(f"Script no encontrado: {script_path}")
    
    # Determinar si usar sesión existente
    has_session = session_path.exists() and use_existing_session
    if has_session:
        logger.info(f"[RPA] Sesión encontrada en: {session_path}")
    
    cmd = [
        "python3", "-m", "app.rpa.qualitas_full_workflow",
        "--headless",
        "--use-db"  # Usar credenciales de la base de datos
    ]
    
    # Si hay sesión, usarla para evitar CAPTCHA
    if has_session:
        cmd.append("--skip-login")
        logger.info("[RPA] Usando sesión existente (sin CAPTCHA)")
    else:
        logger.info("[RPA] No hay sesión, se requerirá resolver CAPTCHA (puede tardar 30-120s)")
    
    logger.info(f"[RPA] Comando: {' '.join(cmd)}")
    
    try:
        result = subprocess.run(
            cmd,
            cwd=str(backend_dir),
            capture_output=True,
            text=True,
            timeout=400,  # ~6.5 minutos (el RPA puede tardar hasta 5 min + overhead)
            encoding='utf-8',
            errors='replace'
        )
        
        # Log completo del output
        logger.info(f"[RPA] Return code: {result.returncode}")
        logger.info(f"[RPA] STDOUT:\n{result.stdout}")
        if result.stderr:
            logger.warning(f"[RPA] STDERR:\n{result.stderr}")
        
        if result.returncode != 0:
            raise RuntimeError(f"RPA falló (code {result.returncode}): {result.stderr or result.stdout}")
        
        # El RPA ya guarda en la base de datos, solo recuperamos los datos más recientes
        indicadores = get_latest_indicadores()
        
        if not indicadores:
            logger.error("[RPA] No se encontraron datos en la base de datos después de ejecutar el RPA")
            logger.error(f"[RPA] Output completo:\n{result.stdout}")
            raise RuntimeError("El RPA se ejecutó pero no se encontraron datos en la base de datos")
        
        logger.info(f"[RPA] Éxito - Indicadores recuperados: {indicadores.get('total_ordenes', 0)} órdenes")
        
        return {
            "success": True,
            "message": "RPA ejecutado exitosamente",
            "data": indicadores,
            "logs": result.stdout[-2000:]  # Últimos 2000 caracteres de logs
        }
        
    except subprocess.TimeoutExpired:
        raise TimeoutError("El RPA tardó más de 5 minutos")
    except subprocess.TimeoutExpired as e:
        logger.error(f"[RPA] Timeout después de 400 segundos")
        raise RuntimeError(f"RPA timeout: El proceso tardó más de 6.5 minutos. Esto suele indicar que 2captcha está tardando demasiado o hay un problema de conectividad.")
    except Exception as e:
        logger.exception("[RPA] Error ejecutando RPA")
        # Incluir stdout en el error si está disponible
        error_msg = str(e)
        if 'result' in locals() and result.stdout:
            error_msg += f"\n\nLogs del RPA:\n{result.stdout[-3000:]}"
        raise RuntimeError(f"Error ejecutando RPA: {error_msg}")


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


@router.post("/indicadores/actualizar")
async def actualizar_indicadores():
    """
    Ejecuta el RPA para actualizar indicadores y órdenes asignadas.
    Esto puede tardar 30-120 segundos (hasta 5 min si hay CAPTCHA).
    """
    import logging
    import subprocess
    logger = logging.getLogger(__name__)
    
    job_id = f"qualitas_update_{datetime.now(MAZATLAN_TZ).strftime('%Y%m%d_%H%M%S')}"
    
    try:
        # Ejecutar RPA completo (indicadores + órdenes)
        backend_dir = Path(__file__).resolve().parents[3]
        
        # Ejecutar workflow
        cmd = [
            "python3", "-m", "app.rpa.qualitas_full_workflow",
            "--headless",
            "--use-db"
        ]
        
        # Verificar si hay sesión
        session_path = backend_dir / "app" / "rpa" / "sessions" / "qualitas_session.json"
        if session_path.exists():
            cmd.append("--skip-login")
        
        result = subprocess.run(
            cmd,
            cwd=str(backend_dir),
            capture_output=True,
            text=True,
            timeout=400,
            encoding='utf-8',
            errors='replace'
        )
        
        logs = result.stdout + "\n" + result.stderr
        
        # Buscar archivo JSON de órdenes generado
        import glob
        json_files = sorted(
            glob.glob(str(backend_dir / "app" / "rpa" / "data" / "qualitas_ordenes_*.json")),
            reverse=True
        )
        
        ordenes_importadas = 0
        if json_files:
            # Importar a BD usando psycopg directamente
            try:
                import psycopg
                import json
                
                with open(json_files[0], 'r') as f:
                    data = json.load(f)
                
                ordenes = data.get('ordenes', [])
                fecha_ext = data.get('fecha_extraccion', datetime.now().isoformat())
                
                conn = psycopg.connect(
                    'postgresql://LaMarinaCC:A355Fu584%24@lamarinacc-db.c7o8imsw0zss.us-east-1.rds.amazonaws.com:5432/postgres?sslmode=require',
                    autocommit=True
                )
                
                for orden in ordenes:
                    try:
                        conn.execute("""
                            INSERT INTO qualitas_ordenes_asignadas 
                            (num_expediente, fecha_asignacion, poliza, siniestro, reporte, 
                             riesgo, vehiculo, anio, placas, estatus, fecha_extraccion)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                            ON CONFLICT (num_expediente, fecha_extraccion) DO NOTHING
                        """, (
                            orden.get('num_expediente'), orden.get('fecha_asignacion'),
                            orden.get('poliza'), orden.get('siniestro'), orden.get('reporte'),
                            orden.get('riesgo'), orden.get('vehiculo'), orden.get('anio'),
                            orden.get('placas'), orden.get('estatus'), fecha_ext
                        ))
                        ordenes_importadas += 1
                    except:
                        pass
                
                conn.close()
                logs += f"\n[Import] {ordenes_importadas} órdenes importadas a BD"
                
            except Exception as e:
                logs += f"\n[Import Error] {e}"
        
        return {
            "success": result.returncode == 0,
            "message": "Actualización completada" if result.returncode == 0 else "El RPA terminó con errores",
            "job_id": job_id,
            "indicadores": get_latest_indicadores(),
            "ordenes_importadas": ordenes_importadas,
            "logs": logs[-3000:]  # Últimos 3000 chars
        }
        
    except Exception as e:
        import traceback
        return {
            "success": False,
            "message": str(e),
            "job_id": job_id,
            "error_detail": traceback.format_exc(),
            "logs": ""
        }


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
    
    # Verificar si hay sesión guardada
    session_path = Path(__file__).resolve().parents[3] / "app" / "rpa" / "sessions" / "qualitas_session.json"
    tiene_sesion = session_path.exists()
    
    if not indicadores:
        return {
            "hay_datos": False,
            "tiene_sesion": tiene_sesion,
            "mensaje": "No hay datos disponibles",
            "recomendacion": "Ejecute POST /admin/qualitas/indicadores/actualizar" + (" (usará sesión guardada)" if tiene_sesion else " (requiere login con CAPTCHA)")
        }
    
    # Calcular antigüedad usando zona horaria de Mazatlán
    fecha_str = indicadores['fecha_extraccion'].replace('Z', '+00:00')
    fecha_extraccion = datetime.fromisoformat(fecha_str)
    # Asegurar que la fecha tenga zona horaria
    if fecha_extraccion.tzinfo is None:
        fecha_extraccion = fecha_extraccion.replace(tzinfo=MAZATLAN_TZ)
    ahora = datetime.now(MAZATLAN_TZ)
    antiguedad = ahora - fecha_extraccion
    
    return {
        "hay_datos": True,
        "tiene_sesion": tiene_sesion,
        "fecha_ultima_actualizacion": indicadores['fecha_extraccion'],
        "antiguedad_horas": round(antiguedad.total_seconds() / 3600, 1),
        "datos_frescos": antiguedad < timedelta(hours=2),
        "total_ordenes": indicadores['total_ordenes'],
        "taller": indicadores['taller_nombre']
    }


# ============================================================================
# ÓRDENES ASIGNADAS
# ============================================================================

def get_latest_ordenes(limit: int = 500) -> list:
    """Obtiene las últimas órdenes asignadas extraídas."""
    ensure_table_exists()  # Asegura que existe la tabla de indicadores
    
    # Verificar si existe la tabla de órdenes
    with get_connection() as conn:
        exists = conn.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'qualitas_ordenes_asignadas'
            )
        """).fetchone()[0]
        
        if not exists:
            return []
        
        conn.row_factory = dict_row
        rows = conn.execute("""
            SELECT * FROM v_qualitas_ordenes_recientes
            ORDER BY fecha_asignacion DESC NULLS LAST
            LIMIT %s
        """, (limit,)).fetchall()
        
        return [serialize_row(dict(row)) for row in rows]


@router.get("/ordenes-asignadas")
async def get_ordenes_asignadas():
    """
    Obtiene las órdenes asignadas más recientes de Qualitas.
    """
    ordenes = get_latest_ordenes()
    
    if not ordenes:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No hay órdenes disponibles"
        )
    
    return {
        "ordenes": ordenes,
        "total": len(ordenes),
        "fecha_extraccion": ordenes[0].get('fecha_extraccion') if ordenes else None
    }
