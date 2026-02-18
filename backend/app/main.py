import logging
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.config import settings
from app.api import nc_router, validation_router, correccion_router, batch_router, capita_router, nc_total_router, fev_rips_router

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Log CORS configuration
logger.info(f"CORS Origins configurados: {settings.cors_origins}")

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
app.include_router(capita_router.router, prefix="/api/capita", tags=["Capita Periodo"])
logger.info("✓ Capita router registrado")
app.include_router(nc_total_router.router, prefix="/api/nc-total", tags=["NC Total"])
logger.info("✓ NC Total router registrado")
app.include_router(fev_rips_router.router, prefix="/api/fev-rips", tags=["FEV RIPS"])
logger.info("✓ FEV RIPS router registrado")
logger.info("Todos los routers registrados exitosamente")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


# Servir frontend estático en producción (Docker)
# Ruta al frontend build: desde app/main.py -> backend/ -> frontend/dist
_frontend_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if _frontend_dist.exists():
    _assets_dir = _frontend_dist / "assets"
    if _assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(_assets_dir)), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Not found")
        file_path = _frontend_dist / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(_frontend_dist / "index.html")
