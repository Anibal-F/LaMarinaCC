"""
Helper para obtener credenciales de aseguradoras desde la base de datos.

Este módulo permite a los scripts de RPA obtener las credenciales
directamente desde la tabla aseguradora_credenciales en lugar de
usar archivos .env
"""

import os
import socket
from pathlib import Path

# Agregar el backend al path para importar el módulo de DB
import sys
backend_dir = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(backend_dir))

# Verificar si estamos dentro de Docker (si 'db' resuelve)
def _is_db_host_available():
    """Verifica si el hostname 'db' está disponible (estamos en Docker)."""
    try:
        socket.gethostbyname('db')
        return True
    except socket.gaierror:
        return False

# Verificar si DATABASE_URL está configurado
def _has_database_url():
    """Verifica si DATABASE_URL está configurado en las variables de entorno."""
    return bool(os.getenv('DATABASE_URL'))

# Importar DB si estamos en Docker, si DATABASE_URL apunta a localhost, 
# o si DATABASE_URL está configurado (para conexiones a RDS, etc.)
try:
    if _is_db_host_available() or 'localhost' in os.getenv('DATABASE_URL', '') or _has_database_url():
        from app.core.db import get_connection
        from psycopg.rows import dict_row
        DB_AVAILABLE = True
    else:
        DB_AVAILABLE = False
except Exception as e:
    print(f"[CredentialsHelper] Error al importar DB: {e}")
    DB_AVAILABLE = False


def get_credentials_by_seguro(seguro_name: str) -> dict | None:
    """
    Obtiene las credenciales de una aseguradora por su nombre.
    
    Args:
        seguro_name: Nombre del seguro (ej: 'QUALITAS', 'CHUBB', 'CHUBB/AUDATEX')
    
    Returns:
        dict con las credenciales o None si no existe/inactiva
        {
            'id': int,
            'seguro': str,
            'plataforma_url': str,
            'usuario': str,
            'password': str,
            'taller_id': str | None,
            'activo': bool,
            'autosync': bool,
            'synctime': int
        }
    """
    if not DB_AVAILABLE:
        return None
    
    try:
        with get_connection() as conn:
            conn.row_factory = dict_row
            row = conn.execute(
                """
                SELECT id, seguro, plataforma_url, usuario, password, taller_id, activo,
                       COALESCE(autosync, false) as autosync,
                       COALESCE(synctime, 2) as synctime
                FROM aseguradora_credenciales
                WHERE seguro ILIKE %s AND activo = TRUE
                LIMIT 1
                """,
                (f"%{seguro_name}%",)
            ).fetchone()
            
            if row:
                return dict(row)
            return None
            
    except Exception as e:
        print(f"[CredentialsHelper] Error obteniendo credenciales: {e}")
        return None


def get_all_active_credentials() -> list[dict]:
    """
    Obtiene todas las credenciales activas.
    
    Returns:
        Lista de dicts con las credenciales
    """
    if not DB_AVAILABLE:
        return []
    try:
        with get_connection() as conn:
            conn.row_factory = dict_row
            rows = conn.execute(
                """
                SELECT id, seguro, plataforma_url, usuario, password, taller_id, activo,
                       COALESCE(autosync, false) as autosync,
                       COALESCE(synctime, 2) as synctime
                FROM aseguradora_credenciales
                WHERE activo = TRUE
                ORDER BY id ASC
                """
            ).fetchall()
            
            return [dict(row) for row in rows]
            
    except Exception as e:
        print(f"[CredentialsHelper] Error obteniendo credenciales: {e}")
        return []


def update_env_from_db(seguro_name: str, env_prefix: str) -> bool:
    """
    Actualiza las variables de entorno desde la base de datos.
    Útil para mantener compatibilidad con código que usa os.getenv()
    
    Args:
        seguro_name: Nombre del seguro a buscar
        env_prefix: Prefijo para las variables de entorno (ej: 'QUALITAS', 'CHUBB')
    
    Returns:
        True si se encontraron y configuraron las credenciales
    """
    creds = get_credentials_by_seguro(seguro_name)
    
    if not creds:
        print(f"[CredentialsHelper] No se encontraron credenciales activas para: {seguro_name}")
        return False
    
    # Configurar variables de entorno
    os.environ[f"{env_prefix}_LOGIN_URL"] = creds.get('plataforma_url', '')
    os.environ[f"{env_prefix}_USER"] = creds.get('usuario', '')
    os.environ[f"{env_prefix}_PASSWORD"] = creds.get('password', '')
    
    if creds.get('taller_id'):
        os.environ[f"{env_prefix}_TALLER_ID"] = creds.get('taller_id', '')
    
    print(f"[CredentialsHelper] ✓ Credenciales cargadas desde DB para: {seguro_name}")
    return True


# Funciones específicas para cada aseguradora

def get_qualitas_credentials() -> dict | None:
    """Obtiene credenciales de QUALITAS."""
    return get_credentials_by_seguro('QUALITAS')


def get_chubb_credentials() -> dict | None:
    """Obtiene credenciales de CHUBB/AUDATEX."""
    # Intentar con CHUBB primero, luego con AUDATEX
    creds = get_credentials_by_seguro('CHUBB')
    if not creds:
        creds = get_credentials_by_seguro('AUDATEX')
    return creds


def setup_qualitas_env() -> bool:
    """
    Configura las variables de entorno de QUALITAS desde la DB.
    """
    return update_env_from_db('QUALITAS', 'QUALITAS')


def setup_chubb_env() -> bool:
    """
    Configura las variables de entorno de CHUBB desde la DB.
    """
    return update_env_from_db('CHUBB', 'CHUBB')


# ============================================================================
# FUNCIONES PARA CONFIGURACIÓN DE AUTOSYNC
# ============================================================================

def get_autosync_config(seguro_name: str) -> dict | None:
    """
    Obtiene la configuración de autosync para una aseguradora.
    
    Returns:
        dict con { autosync: bool, synctime: int } o None
    """
    creds = get_credentials_by_seguro(seguro_name)
    if creds:
        return {
            'autosync': creds.get('autosync', False),
            'synctime': creds.get('synctime', 2)
        }
    return None


def get_all_autosync_configs() -> list[dict]:
    """
    Obtiene la configuración de autosync para todas las aseguradoras activas.
    
    Returns:
        Lista de dicts con { seguro, autosync, synctime }
    """
    creds = get_all_active_credentials()
    return [
        {
            'seguro': c['seguro'],
            'autosync': c.get('autosync', False),
            'synctime': c.get('synctime', 2)
        }
        for c in creds
    ]


def update_autosync_config(seguro_name: str, autosync: bool, synctime: int) -> bool:
    """
    Actualiza la configuración de autosync para una aseguradora.
    
    Args:
        seguro_name: Nombre del seguro
        autosync: Habilitar/deshabilitar autosync
        synctime: Tiempo en horas entre sincronizaciones
    
    Returns:
        True si se actualizó correctamente
    """
    if not DB_AVAILABLE:
        return False
    
    try:
        with get_connection() as conn:
            conn.execute(
                """
                UPDATE aseguradora_credenciales
                SET autosync = %s, synctime = %s
                WHERE seguro ILIKE %s
                """,
                (autosync, synctime, f"%{seguro_name}%")
            )
            conn.commit()
            print(f"[CredentialsHelper] ✓ Configuración de autosync actualizada para: {seguro_name}")
            return True
    except Exception as e:
        print(f"[CredentialsHelper] Error actualizando autosync: {e}")
        return False


if __name__ == "__main__":
    # Test
    print("Probando obtención de credenciales...")
    
    print("\n--- QUALITAS ---")
    qualitas = get_qualitas_credentials()
    if qualitas:
        print(f"Seguro: {qualitas['seguro']}")
        print(f"URL: {qualitas['plataforma_url']}")
        print(f"Usuario: {qualitas['usuario']}")
        print(f"Taller ID: {qualitas.get('taller_id', 'N/A')}")
    else:
        print("No se encontraron credenciales")
    
    print("\n--- CHUBB ---")
    chubb = get_chubb_credentials()
    if chubb:
        print(f"Seguro: {chubb['seguro']}")
        print(f"URL: {chubb['plataforma_url']}")
        print(f"Usuario: {chubb['usuario']}")
    else:
        print("No se encontraron credenciales")
    
    print("\n--- Todas las credenciales activas ---")
    all_creds = get_all_active_credentials()
    for cred in all_creds:
        print(f"- {cred['seguro']}: {cred['usuario']}")
