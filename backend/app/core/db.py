import os
import psycopg

from app.core.config import settings


def _normalize_dsn(dsn: str) -> str:
    if dsn.startswith("postgresql+psycopg://"):
        return dsn.replace("postgresql+psycopg://", "postgresql://", 1)
    return dsn


def get_connection():
    # Priorizar variable de entorno sobre settings (para contenedores en producción)
    database_url = os.environ.get("DATABASE_URL", settings.database_url)
    return psycopg.connect(_normalize_dsn(database_url), autocommit=True)
