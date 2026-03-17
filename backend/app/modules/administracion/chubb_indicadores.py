"""
Módulo para gestionar indicadores de CHUBB extraídos por RPA.

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

router = APIRouter(prefix="/chubb", tags=["chubb"])


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
    por_autorizar: int
    autorizadas: int
    rechazadas: int
    complementos: int
    perdida_total: int
    total_expedientes: int
    raw_data: Optional[Dict[str, Any]] = None


class RPAUpdateResponse(BaseModel):
    success: bool
    message: str
    job_id: Optional[str] = None
    indicadores: Optional[IndicadoresResponse] = None


class ExpedienteItem(BaseModel):
    id: int
    num_expediente: str
    tipo_vehiculo: str
    estado: str
    fecha_creacion: str
    fecha_inspeccion: Optional[str] = None
    fecha_actualizacion: Optional[str] = None
    placas: Optional[str] = None
    estatus_audatrace: Optional[str] = None
    fecha_extraccion: str


# ============================================================================
# FUNCIONES DE BASE DE DATOS
# ============================================================================

def ensure_tables_exists():
    """Crea las tablas de indicadores y expedientes si no existen."""
    with get_connection() as conn:
        # Tabla de indicadores
        conn.execute("""
            CREATE TABLE IF NOT EXISTS chubb_indicadores (
                id SERIAL PRIMARY KEY,
                taller_id VARCHAR(50) NOT NULL,
                taller_nombre VARCHAR(255),
                fecha_extraccion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                por_autorizar INTEGER DEFAULT 0,
                autorizadas INTEGER DEFAULT 0,
                rechazadas INTEGER DEFAULT 0,
                complementos INTEGER DEFAULT 0,
                perdida_total INTEGER DEFAULT 0,
                total_expedientes INTEGER DEFAULT 0,
                raw_data JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Tabla de expedientes
        conn.execute("""
            CREATE TABLE IF NOT EXISTS chubb_expedientes (
                id SERIAL PRIMARY KEY,
                num_expediente VARCHAR(100) NOT NULL,
                tipo_vehiculo VARCHAR(255),
                estado VARCHAR(100) NOT NULL,
                fecha_creacion TIMESTAMP,
                fecha_inspeccion TIMESTAMP,
                fecha_actualizacion TIMESTAMP,
                placas VARCHAR(50),
                asignado_a VARCHAR(255),
                compania VARCHAR(100),
                estatus_audatrace VARCHAR(100),
                fecha_accidente TIMESTAMP,
                fecha_extraccion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(num_expediente, fecha_extraccion)
            )
        """)
        
        # Agregar columna estatus_audatrace si no existe (migración)
        try:
            conn.execute("""
                ALTER TABLE chubb_expedientes 
                ADD COLUMN IF NOT EXISTS estatus_audatrace VARCHAR(100)
            """)
        except Exception as e:
            # Columna ya existe o error de migración
            pass
        
        # Crear índices
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_chubb_expedientes_estado 
            ON chubb_expedientes(estado)
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_chubb_expedientes_fecha_ext 
            ON chubb_expedientes(fecha_extraccion DESC)
        """)
        
        conn.commit()


def save_indicadores(data: Dict[str, Any]) -> int:
    """Guarda los indicadores extraídos en la base de datos."""
    import logging
    logger = logging.getLogger(__name__)
    
    logger.info(f"[save_indicadores] Iniciando guardado de datos: {data.get('taller_nombre', 'N/A')}")
    
    ensure_tables_exists()
    
    # Extraer valores de los estados (del RPA) o calcular desde expedientes
    estados = data.get('estados', {})
    expedientes = data.get('expedientes', [])
    
    # USAR INDICADORES DEL RPA DIRECTAMENTE (más confiable que recalcular)
    # El RPA obtiene los totales reales del portal de CHUBB/Audatex
    indicadores_rpa = data.get('indicadores', {})
    
    if indicadores_rpa:
        # Usar los indicadores que reportó el RPA del portal
        logger.info(f"[save_indicadores] Usando indicadores del RPA: {indicadores_rpa}")
        por_autorizar = indicadores_rpa.get('por_autorizar', 0)
        autorizadas = indicadores_rpa.get('autorizadas', 0)
        rechazadas = indicadores_rpa.get('rechazadas', 0)
        complementos = indicadores_rpa.get('complementos', 0)
        perdida_total = indicadores_rpa.get('perdida_total', 0)
        total_expedientes = indicadores_rpa.get('total', len(expedientes) if expedientes else 0)
    elif estados:
        # Fallback: usar estados del RPA si no hay indicadores
        logger.info(f"[save_indicadores] Usando estados del RPA: {estados}")
        por_autorizar = estados.get('por_autorizar', 0)
        autorizadas = estados.get('autorizadas', 0)
        rechazadas = estados.get('rechazadas', 0)
        complementos = estados.get('complementos', 0)
        perdida_total = estados.get('perdida_total', 0)
        total_expedientes = estados.get('total', 0)
    elif expedientes:
        # Último fallback: calcular desde expedientes
        logger.info(f"[save_indicadores] Calculando indicadores desde {len(expedientes)} expedientes")
        por_autorizar = sum(1 for e in expedientes if e.get('estado', '').lower() in ['por aprobar', 'por_autorizar'])
        autorizadas = sum(1 for e in expedientes if e.get('estado', '').lower() in ['autorizado', 'aprobado', 'autorizadas'])
        rechazadas = sum(1 for e in expedientes if e.get('estado', '').lower() in ['rechazado', 'rechazadas'])
        complementos = sum(1 for e in expedientes if e.get('estado', '').lower() in ['complemento', 'complementos'])
        perdida_total = sum(1 for e in expedientes if e.get('estado', '').lower() in ['pérdida total', 'perdida_total'])
        total_expedientes = len(expedientes)
    else:
        logger.warning("[save_indicadores] No hay datos para calcular indicadores")
        por_autorizar = autorizadas = rechazadas = complementos = perdida_total = total_expedientes = 0
    
    # Actualizar el diccionario de estados
    estados = {
        'por_autorizar': por_autorizar,
        'autorizadas': autorizadas,
        'rechazadas': rechazadas,
        'complementos': complementos,
        'perdida_total': perdida_total,
        'total': total_expedientes
    }
    data['estados'] = estados
    
    logger.info(f"[save_indicadores] Indicadores calculados: por_autorizar={por_autorizar}, autorizadas={autorizadas}, rechazadas={rechazadas}, complementos={complementos}, perdida_total={perdida_total}, total={total_expedientes}")
    
    try:
        with get_connection() as conn:
            row = conn.execute("""
                INSERT INTO chubb_indicadores (
                    taller_id, taller_nombre, fecha_extraccion,
                    por_autorizar, autorizadas, rechazadas, complementos,
                    perdida_total, total_expedientes, raw_data
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (
                data.get('taller_id', ''),
                data.get('taller_nombre', ''),
                data.get('fecha_extraccion', datetime.now(MAZATLAN_TZ).isoformat()),
                por_autorizar, autorizadas, rechazadas, complementos, perdida_total,
                total_expedientes, json.dumps(data)
            )).fetchone()
            conn.commit()
            logger.info(f"[save_indicadores] ✓ Guardado con ID: {row[0]}")
            return row[0]
    except Exception as e:
        logger.error(f"[save_indicadores] ✗ Error en INSERT: {e}")
        import traceback
        logger.error(f"[save_indicadores] Traceback: {traceback.format_exc()}")
        raise


def save_expedientes(expedientes: List[Dict[str, Any]], fecha_extraccion: str):
    """Guarda los expedientes extraídos en la base de datos."""
    import logging
    logger = logging.getLogger(__name__)
    
    if not expedientes:
        logger.info("[save_expedientes] No hay expedientes para guardar")
        return 0
    
    # Log de los primeros 3 expedientes recibidos
    logger.info(f"[save_expedientes] Total recibidos: {len(expedientes)}")
    if expedientes:
        logger.info(f"[save_expedientes] Primer expediente: {expedientes[0].get('num_expediente')}")
    
    ensure_tables_exists()
    
    def parse_date(value):
        """Convierte valor a fecha o NULL si está vacío.
        Soporta formato español: '27/02/2026 11:07:33 a. m.' -> '2026-02-27 11:07:33'
        """
        if not value or value == '' or value == '-':
            return None
        
        try:
            import re
            from datetime import datetime
            
            # Limpiar el valor
            value = value.strip()
            
            # Patrón para fechas en español: DD/MM/YYYY HH:MM:SS a. m./p. m.
            # Ejemplo: '27/02/2026 11:07:33 a. m.'
            pattern = r'(\d{2})/(\d{2})/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s+(a\.?\s*m\.?|p\.?\s*m\.?)'
            match = re.match(pattern, value, re.IGNORECASE)
            
            if match:
                day, month, year, hour, minute, second, ampm = match.groups()
                hour = int(hour)
                minute = int(minute)
                second = int(second)
                
                # Convertir a formato 24 horas
                ampm_clean = ampm.lower().replace('.', '').replace(' ', '')
                if ampm_clean == 'pm' and hour != 12:
                    hour += 12
                elif ampm_clean == 'am' and hour == 12:
                    hour = 0
                
                # Crear fecha en formato ISO
                dt = datetime(int(year), int(month), int(day), hour, minute, second)
                return dt.isoformat()
            
            # Si no coincide con el patrón español, intentar otros formatos comunes
            # Formato ISO directo
            if 'T' in value:
                return value
            
            # Formato YYYY-MM-DD HH:MM:SS
            if re.match(r'\d{4}-\d{2}-\d{2}', value):
                return value
                
            # Si no se puede parsear, devolver None
            logger.warning(f"[save_expedientes] No se pudo parsear fecha: {value}")
            return None
            
        except Exception as e:
            logger.warning(f"[save_expedientes] Error parseando fecha '{value}': {e}")
            return None
    
    count = 0
    with get_connection() as conn:
        for idx, exp in enumerate(expedientes):
            try:
                # Validar que tenga número de expediente
                num_exp = exp.get('num_expediente', '').strip()
                if not num_exp:
                    logger.warning(f"[save_expedientes] Saltando expediente {idx} sin número")
                    continue
                
                conn.execute("""
                    INSERT INTO chubb_expedientes (
                        num_expediente, tipo_vehiculo, estado, 
                        fecha_creacion, fecha_inspeccion, fecha_actualizacion,
                        placas, asignado_a, compania, estatus_audatrace, fecha_accidente,
                        fecha_extraccion
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (num_expediente, fecha_extraccion) DO NOTHING
                """, (
                    num_exp,
                    exp.get('tipo_vehiculo') or None,
                    exp.get('estado') or 'Pendiente',
                    parse_date(exp.get('fecha_creacion')),
                    parse_date(exp.get('fecha_inspeccion')),
                    parse_date(exp.get('fecha_actualizacion')),
                    exp.get('placas') or None,
                    exp.get('asignado_a') or None,
                    exp.get('compania') or None,
                    exp.get('estatus_audatrace') or None,
                    parse_date(exp.get('fecha_accidente')),
                    fecha_extraccion
                ))
                count += 1
            except Exception as e:
                logger.warning(f"[save_expedientes] Error guardando expediente {exp.get('num_expediente')}: {e}")
                continue
        
        conn.commit()
    
    logger.info(f"[save_expedientes] ✓ {count} expedientes guardados")
    return count


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
    ensure_tables_exists()
    
    with get_connection() as conn:
        conn.row_factory = dict_row
        row = conn.execute("""
            SELECT * FROM chubb_indicadores
            ORDER BY fecha_extraccion DESC
            LIMIT 1
        """).fetchone()
        
        if row:
            row = dict(row)
            return serialize_row(row)
        return None


def get_indicadores_history(limit: int = 30) -> List[Dict[str, Any]]:
    """Obtiene el historial de indicadores."""
    ensure_tables_exists()
    
    with get_connection() as conn:
        conn.row_factory = dict_row
        rows = conn.execute("""
            SELECT 
                id, taller_id, taller_nombre, fecha_extraccion,
                por_autorizar, autorizadas, rechazadas, complementos,
                perdida_total, total_expedientes
            FROM chubb_indicadores
            ORDER BY fecha_extraccion DESC
            LIMIT %s
        """, (limit,)).fetchall()
        
        return [serialize_row(dict(row)) for row in rows]


def get_latest_expedientes(limit: int = 500, estado: Optional[str] = None) -> list:
    """Obtiene los últimos expedientes extraídos (solo última extracción)."""
    ensure_tables_exists()
    
    with get_connection() as conn:
        conn.row_factory = dict_row
        
        # Obtener la última fecha de extracción
        latest = conn.execute("""
            SELECT DISTINCT fecha_extraccion 
            FROM chubb_expedientes 
            ORDER BY fecha_extraccion DESC 
            LIMIT 1
        """).fetchone()
        
        if not latest:
            return []
        
        # Siempre filtrar por última extracción, opcionalmente por estado
        if estado:
            rows = conn.execute("""
                SELECT * FROM chubb_expedientes
                WHERE fecha_extraccion = %s AND estado = %s
                ORDER BY fecha_creacion DESC NULLS LAST
                LIMIT %s
            """, (latest['fecha_extraccion'], estado, limit)).fetchall()
        else:
            rows = conn.execute("""
                SELECT * FROM chubb_expedientes
                WHERE fecha_extraccion = %s
                ORDER BY fecha_creacion DESC NULLS LAST
                LIMIT %s
            """, (latest['fecha_extraccion'], limit)).fetchall()
        
        return [serialize_row(dict(row)) for row in rows]


# ============================================================================
# EJECUCIÓN DEL RPA
# ============================================================================

def run_chubb_rpa_sync(use_existing_session: bool = True) -> Dict[str, Any]:
    """
    Ejecuta el RPA de CHUBB y devuelve los indicadores.
    Esta función es síncrona y bloqueante - usar en background tasks.
    """
    import logging
    logger = logging.getLogger(__name__)
    
    backend_dir = Path(__file__).resolve().parents[3]
    script_path = backend_dir / "app" / "rpa" / "chubb_full_workflow.py"
    session_path = backend_dir / "app" / "rpa" / "sessions" / "chubb_session.json"
    
    logger.info(f"[RPA] Iniciando ejecución desde: {script_path}")
    
    if not script_path.exists():
        raise FileNotFoundError(f"Script no encontrado: {script_path}")
    
    # Determinar si usar sesión existente
    has_session = session_path.exists() and use_existing_session
    if has_session:
        logger.info(f"[RPA] Sesión encontrada en: {session_path}")
    
    cmd = [
        "python3", "-m", "app.rpa.chubb_full_workflow",
        "--headless",
        "--use-db",
        "--extract-data"  # Flag para extraer datos de expedientes
    ]
    
    # Si hay sesión, usarla para evitar login completo
    if has_session:
        cmd.append("--skip-login")
        logger.info("[RPA] Usando sesión existente")
    else:
        logger.info("[RPA] No hay sesión, se realizará login completo")
    
    logger.info(f"[RPA] Comando: {' '.join(cmd)}")
    
    try:
        result = subprocess.run(
            cmd,
            cwd=str(backend_dir),
            capture_output=True,
            text=True,
            timeout=400,  # ~6.5 minutos
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
        
        # Buscar archivo JSON de datos generado
        data_dir = backend_dir / "app" / "rpa" / "data"
        json_files = sorted(data_dir.glob("chubb_data_*.json"), reverse=True)
        
        if json_files:
            with open(json_files[0], 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Guardar indicadores
            indicadores = data.get('indicadores', {})
            if indicadores:
                save_indicadores(indicadores)
            
            # Guardar expedientes
            expedientes = data.get('expedientes', [])
            fecha_ext = data.get('fecha_extraccion', datetime.now(MAZATLAN_TZ).isoformat())
            if expedientes:
                save_expedientes(expedientes, fecha_ext)
            
            logger.info(f"[RPA] Éxito - {len(expedientes)} expedientes procesados")
            
            return {
                "success": True,
                "message": "RPA ejecutado exitosamente",
                "indicadores": get_latest_indicadores(),
                "logs": result.stdout[-2000:]
            }
        else:
            # Si no hay archivo JSON, usar datos de la base
            indicadores = get_latest_indicadores()
            if not indicadores:
                raise RuntimeError("El RPA se ejecutó pero no se encontraron datos")
            
            return {
                "success": True,
                "message": "RPA ejecutado exitosamente",
                "indicadores": indicadores,
                "logs": result.stdout[-2000:]
            }
        
    except subprocess.TimeoutExpired:
        raise TimeoutError("El RPA tardó más de 6.5 minutos")
    except Exception as e:
        logger.exception("[RPA] Error ejecutando RPA")
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
    Obtiene los indicadores más recientes de CHUBB.
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
    Ejecuta el RPA para actualizar indicadores y expedientes.
    Esto puede tardar 1-3 minutos.
    """
    import logging
    logger = logging.getLogger(__name__)
    
    job_id = f"chubb_update_{datetime.now(MAZATLAN_TZ).strftime('%Y%m%d_%H%M%S')}"
    
    try:
        backend_dir = Path(__file__).resolve().parents[3]
        
        # Ejecutar workflow
        cmd = [
            "python3", "-m", "app.rpa.chubb_full_workflow",
            "--headless",
            "--use-db",
            "--extract-data"
        ]
        
        # Verificar si hay sesión
        session_path = backend_dir / "app" / "rpa" / "sessions" / "chubb_session.json"
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
        
        # Buscar archivo JSON de datos
        data_dir = backend_dir / "app" / "rpa" / "data"
        json_files = sorted(data_dir.glob("chubb_data_*.json"), reverse=True)
        
        expedientes_importados = 0
        if json_files:
            try:
                with open(json_files[0], 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                # Guardar indicadores
                indicadores = data.get('indicadores', {})
                if indicadores:
                    save_indicadores(indicadores)
                
                # Guardar expedientes
                expedientes = data.get('expedientes', [])
                fecha_ext = data.get('fecha_extraccion', datetime.now(MAZATLAN_TZ).isoformat())
                if expedientes:
                    expedientes_importados = save_expedientes(expedientes, fecha_ext)
                
                logs += f"\n[Import] {expedientes_importados} expedientes importados"
                
            except Exception as e:
                logs += f"\n[Import Error] {e}"
        
        return {
            "success": result.returncode == 0,
            "message": "Actualización completada" if result.returncode == 0 else "El RPA terminó con errores",
            "job_id": job_id,
            "indicadores": get_latest_indicadores(),
            "expedientes_importados": expedientes_importados,
            "logs": logs[-3000:]
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
    session_path = Path(__file__).resolve().parents[3] / "app" / "rpa" / "sessions" / "chubb_session.json"
    tiene_sesion = session_path.exists()
    
    if not indicadores:
        return {
            "hay_datos": False,
            "tiene_sesion": tiene_sesion,
            "mensaje": "No hay datos disponibles",
            "recomendacion": "Ejecute POST /admin/chubb/indicadores/actualizar" + (" (usará sesión guardada)" if tiene_sesion else " (requiere login)")
        }
    
    # Calcular antigüedad usando zona horaria de Mazatlán
    fecha_str = indicadores['fecha_extraccion'].replace('Z', '+00:00')
    fecha_extraccion = datetime.fromisoformat(fecha_str)
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
        "total_expedientes": indicadores['total_expedientes'],
        "taller": indicadores['taller_nombre']
    }


# ============================================================================
# EXPEDIENTES
# ============================================================================

@router.get("/expedientes")
async def get_expedientes(estado: Optional[str] = None, limit: int = 500):
    """
    Obtiene los expedientes más recientes de CHUBB.
    
    Args:
        estado: Filtrar por estado (Por Aprobar, Autorizado, Rechazado, Complemento)
        limit: Límite de resultados
    """
    expedientes = get_latest_expedientes(limit=limit, estado=estado)
    
    return {
        "expedientes": expedientes,
        "total": len(expedientes),
        "fecha_extraccion": expedientes[0].get('fecha_extraccion') if expedientes else None,
        "filtro_estado": estado
    }


@router.get("/expedientes/estados")
async def get_estados_disponibles():
    """Obtiene la lista de estados disponibles con conteos."""
    ensure_tables_exists()
    
    with get_connection() as conn:
        conn.row_factory = dict_row
        
        # Obtener la última fecha de extracción
        latest = conn.execute("""
            SELECT DISTINCT fecha_extraccion 
            FROM chubb_expedientes 
            ORDER BY fecha_extraccion DESC 
            LIMIT 1
        """).fetchone()
        
        if not latest:
            return {
                "estados": [],
                "total": 0
            }
        
        # Contar por estado
        rows = conn.execute("""
            SELECT estado, COUNT(*) as cantidad
            FROM chubb_expedientes
            WHERE fecha_extraccion = %s
            GROUP BY estado
            ORDER BY cantidad DESC
        """, (latest['fecha_extraccion'],)).fetchall()
        
        return {
            "estados": [dict(row) for row in rows],
            "fecha_extraccion": latest['fecha_extraccion'],
            "total": sum(row['cantidad'] for row in rows)
        }


# ============================================================================
# PIEZAS CHUBB (INPART) - Se almacenan en bitacora_piezas
# ============================================================================


@router.get("/expedientes/pendientes")
async def get_expedientes_pendientes(limit: int = 50):
    """
    Obtiene expedientes CHUBB autorizados sin información de AudaTrace (Inpart).
    Estos son los expedientes que necesitan extraerse sus piezas.
    """
    ensure_tables_exists()
    
    with get_connection() as conn:
        conn.row_factory = dict_row
        rows = conn.execute("""
            SELECT DISTINCT ON (num_expediente) 
                id,
                num_expediente,
                tipo_vehiculo,
                estado,
                placas,
                estatus_audatrace,
                fecha_extraccion
            FROM chubb_expedientes
            WHERE estado = 'Autorizado'
              AND (estatus_audatrace IS NULL OR estatus_audatrace = '')
            ORDER BY num_expediente, fecha_extraccion DESC
            LIMIT %s
        """, (limit,)).fetchall()
        
        return {
            "expedientes": [serialize_row(dict(row)) for row in rows],
            "total": len(rows),
            "mensaje": f"{len(rows)} expedientes pendientes de extraer piezas" if rows else "No hay expedientes pendientes"
        }


@router.get("/piezas")
async def get_piezas(
    num_expediente: Optional[str] = None,
    estatus: Optional[str] = None,
    limit: int = 500
):
    """
    Obtiene las piezas extraídas de CHUBB (Inpart) desde la bitacora_piezas.
    
    Args:
        num_expediente: Filtrar por número de expediente específico
        estatus: Filtrar por estatus (Recibido, En Proceso, etc.)
        limit: Límite de resultados
    """
    with get_connection() as conn:
        conn.row_factory = dict_row
        
        query = """
            SELECT 
                bp.*,
                p.id_externo as proveedor_id_externo,
                p.nombre as proveedor_nombre,
                p.email as proveedor_email,
                p.celular as proveedor_celular
            FROM bitacora_piezas bp
            LEFT JOIN proveedores p ON bp.proveedor_id = p.id
            WHERE bp.fuente = 'CHUBB'
        """
        params = []
        
        if num_expediente:
            query += " AND bp.num_expediente = %s"
            params.append(num_expediente)
        
        if estatus:
            query += " AND bp.estatus = %s"
            params.append(estatus)
        
        query += " ORDER BY bp.fecha_extraccion DESC, bp.num_expediente LIMIT %s"
        params.append(limit)
        
        rows = conn.execute(query, params).fetchall()
        
        return {
            "piezas": [serialize_row(dict(row)) for row in rows],
            "total": len(rows),
            "filtros": {
                "num_expediente": num_expediente,
                "estatus": estatus
            }
        }


@router.get("/piezas/resumen")
async def get_piezas_resumen():
    """
    Obtiene un resumen de las piezas extraídas de CHUBB por estatus.
    """
    with get_connection() as conn:
        conn.row_factory = dict_row
        
        # Contar por estatus
        rows = conn.execute("""
            SELECT 
                estatus,
                COUNT(*) as cantidad,
                COUNT(DISTINCT num_expediente) as expedientes
            FROM bitacora_piezas
            WHERE fuente = 'CHUBB'
            GROUP BY estatus
            ORDER BY cantidad DESC
        """).fetchall()
        
        # Total de piezas
        total = conn.execute("""
            SELECT COUNT(*) as total FROM bitacora_piezas WHERE fuente = 'CHUBB'
        """).fetchone()
        
        # Total de expedientes con piezas
        expedientes = conn.execute("""
            SELECT COUNT(DISTINCT num_expediente) as total 
            FROM bitacora_piezas 
            WHERE fuente = 'CHUBB'
        """).fetchone()
        
        return {
            "por_estatus": [dict(row) for row in rows],
            "total_piezas": total['total'] if total else 0,
            "total_expedientes": expedientes['total'] if expedientes else 0
        }
