import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "LaMarinaCC"
    env: str = "local"
    database_url: str
    cors_origins: str = ""
    aws_region: str = "us-east-1"
    aws_transcribe_bucket: str = ""
    aws_transcribe_language_code: str = "es-MX"
    aws_transcribe_timeout_seconds: int = 120
    aws_transcribe_poll_seconds: int = 2

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Priorizar DATABASE_URL de variable de entorno sobre archivo .env
        env_db_url = os.environ.get("DATABASE_URL")
        if env_db_url:
            self.database_url = env_db_url


settings = Settings()
