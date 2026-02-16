import psycopg

from app.core.config import settings


def _normalize_dsn(dsn: str) -> str:
    if dsn.startswith("postgresql+psycopg://"):
        return dsn.replace("postgresql+psycopg://", "postgresql://", 1)
    return dsn


def get_connection():
    return psycopg.connect(_normalize_dsn(settings.database_url), autocommit=True)
