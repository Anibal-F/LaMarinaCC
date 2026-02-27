import os
import psycopg


def _normalize_dsn(dsn: str) -> str:
    if dsn.startswith("postgresql+psycopg://"):
        return dsn.replace("postgresql+psycopg://", "postgresql://", 1)
    return dsn


def get_connection():
    # Usar directamente la variable de entorno, ignorar settings
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        # Fallback a settings solo si no hay variable de entorno
        from app.core.config import settings
        database_url = settings.database_url
    
    return psycopg.connect(_normalize_dsn(database_url), autocommit=True)
