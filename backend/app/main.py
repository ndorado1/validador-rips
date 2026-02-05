import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.api import nc_router, validation_router, correccion_router, batch_router

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="NC Processor API",
    description="API para procesar Notas Crédito del sector salud",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registrar routers
logger.info("Registrando routers...")
app.include_router(nc_router.router, prefix="/api/nc", tags=["Notas Crédito"])
logger.info("✓ NC router registrado")
app.include_router(validation_router.router, prefix="/api/validation", tags=["Validación CUV"])
logger.info("✓ Validation router registrado")
app.include_router(correccion_router.router, prefix="/api/correccion", tags=["Corrección"])
logger.info("✓ Correccion router registrado")
app.include_router(batch_router.router, prefix="/api/batch", tags=["Batch Processing"])
logger.info("✓ Batch router registrado")
logger.info("Todos los routers registrados exitosamente")


@app.get("/health")
async def health_check():
    return {"status": "ok"}
