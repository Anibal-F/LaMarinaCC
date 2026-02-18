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


settings = Settings()
