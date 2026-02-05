from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    llm_api_key: str
    llm_base_url: str = "https://api.moonshot.ai/v1"
    llm_model: str = "moonshot-v1-128k"

    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = True
    cors_origins: List[str] = ["http://localhost:5173"]

    # Configuración API Ministerio de Salud
    ministerio_api_url: str = "https://localhost:9443/api"
    ministerio_api_timeout: int = 30

    # Kimi API (reutiliza LLM_API_KEY si está disponible)
    kimi_api_key: str = ""  # Puede usar LLM_API_KEY como fallback
    kimi_model: str = "kimi-k2.5"
    kimi_base_url: str = "https://api.moonshot.ai/v1"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
