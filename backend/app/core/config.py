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
    aws_transcribe_identify_language: bool = False
    aws_transcribe_language_options: str = "es-US,es-ES"
    aws_transcribe_timeout_seconds: int = 30  # Timeout más agresivo para audio corto
    aws_transcribe_poll_seconds: int = 1  # Polling más frecuente
    whatsapp_graph_api_base_url: str = "https://graph.facebook.com"
    whatsapp_api_version: str = "v22.0"
    whatsapp_phone_number_id: str = ""
    whatsapp_access_token: str = ""
    whatsapp_template_recepcion: str = "recepcion_automovil"
    whatsapp_template_language: str = "es"
    whatsapp_pdf_public_base_url: str = ""
    whatsapp_webhook_verify_token: str = ""
    whatsapp_auto_reply_enabled: bool = True
    whatsapp_auto_reply_cooldown_minutes: int = 120
    whatsapp_auto_reply_ubicacion: str = (
        "Estamos en Circunvalación Playas #31, El Toreo, 82120, Mazatlán, Sinaloa."
    )
    whatsapp_auto_reply_horario: str = (
        "Nuestro horario es de lunes a viernes de 8:00 a 18:00 y sábados de 9:00 a 14:00."
    )
    whatsapp_auto_reply_duda: str = (
        "Con gusto te apoyamos. Cuéntanos tu duda y un asesor te responderá a la brevedad."
    )
    whatsapp_auto_reply_default: str = (
        "Gracias por tu mensaje. En breve un asesor de La Marina Collision Center te atenderá."
    )

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Priorizar DATABASE_URL de variable de entorno sobre archivo .env
        env_db_url = os.environ.get("DATABASE_URL")
        if env_db_url:
            self.database_url = env_db_url


settings = Settings()
