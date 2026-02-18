from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    llm_api_key: str
    llm_base_url: str = "https://api.moonshot.ai/v1"
    llm_model: str = "moonshot-v1-128k"

    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = True
    cors_origins: List[str] = ["http://localhost:5173", "http://localhost:3000", "http://localhost:3001", "http://localhost:3002", "http://127.0.0.1:3002"]

    # Configuración API Ministerio de Salud (base para todos los endpoints del ministerio)
    ministerio_api_url: str = "https://rips-validador-fevrips-api.zbs9ut.easypanel.host/api"
    ministerio_api_timeout: int = 60  # Timeout para login y llamadas al ministerio

    # Kimi API (reutiliza LLM_API_KEY si está disponible)
    kimi_api_key: str = ""  # Puede usar LLM_API_KEY como fallback
    kimi_model: str = "kimi-k2.5"
    kimi_base_url: str = "https://api.moonshot.ai/v1"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
