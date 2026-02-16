from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "LaMarinaCC"
    env: str = "local"
    database_url: str
    cors_origins: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
