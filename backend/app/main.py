from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.api import nc_router, validation_router, correccion_router

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

app.include_router(nc_router.router, prefix="/api/nc", tags=["Notas Crédito"])
app.include_router(validation_router.router, prefix="/api/validation", tags=["Validación CUV"])
app.include_router(correccion_router.router, prefix="/api/correccion", tags=["Corrección"])


@app.get("/health")
async def health_check():
    return {"status": "ok"}
