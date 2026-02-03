from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    llm_api_key: str
    llm_base_url: str = "https://api.moonshot.cn/v1"
    llm_model: str = "moonshot-v1-128k"

    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = True
    cors_origins: List[str] = ["http://localhost:5173"]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
