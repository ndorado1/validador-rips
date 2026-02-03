# NC Processor Backend

Backend FastAPI para procesamiento de Notas Crédito del sector salud.

## Estructura

```
app/
├── api/           # Routers y endpoints
├── models/        # Modelos Pydantic
├── processors/    # Procesadores XML y RIPS
├── services/      # Servicios (LLMMatcher)
└── config.py      # Configuración
```

## Tests

```bash
pytest -v
```

## Variables de Entorno

- `LLM_API_KEY` - API key de Kimi
- `LLM_BASE_URL` - URL base del API (default: https://api.moonshot.cn/v1)
- `LLM_MODEL` - Modelo a usar (default: moonshot-v1-128k)
- `HOST` - Host del servidor (default: 0.0.0.0)
- `PORT` - Puerto del servidor (default: 8000)
