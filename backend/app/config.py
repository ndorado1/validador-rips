from pydantic_settings import BaseSettings
from typing import List


def _parse_cors_origins(v: str) -> List[str]:
    """Convierte string (comas o JSON) a lista. Evita JSONDecodeError con CORS_ORIGINS vacío en Easypanel."""
    if not v or not v.strip():
        return ["*"]
    v = v.strip()
    if v.startswith("["):
        import json
        try:
            return json.loads(v)
        except json.JSONDecodeError:
            pass
    return [x.strip() for x in v.split(",") if x.strip()]


class Settings(BaseSettings):
    llm_api_key: str
    llm_base_url: str = "https://api.moonshot.ai/v1"
    llm_model: str = "moonshot-v1-128k"

    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = True
    # str para evitar json.loads. Env: CORS_ORIGINS_RAW (no CORS_ORIGINS)
    cors_origins_raw: str = "*,https://validador.mamadominga.org,http://localhost:5173,http://localhost:3000,http://localhost:3002"

    @property
    def cors_origins(self) -> List[str]:
        return _parse_cors_origins(self.cors_origins_raw)

    # Configuración API Ministerio de Salud (base para todos los endpoints del ministerio)
    ministerio_api_url: str = "https://rips.stage.mamadominga.org/api"
    ministerio_api_timeout: int = 60  # Timeout para login y llamadas al ministerio

    # Kimi API (reutiliza LLM_API_KEY si está disponible)
    kimi_api_key: str = ""  # Puede usar LLM_API_KEY como fallback
    kimi_model: str = "kimi-k2.5"
    kimi_base_url: str = "https://api.moonshot.ai/v1"

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
        "env_ignore_empty": True,  # Ignorar CORS_ORIGINS="" que Easypanel inyecta
    }


settings = Settings()
