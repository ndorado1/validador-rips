from fastapi import APIRouter, HTTPException, Header
from typing import Optional
import requests
import urllib3

from app.models import (
    CapitaPeriodoPayload,
    CapitaPeriodoResponse
)
from app.services.ministerio_service import MinisterioService

router = APIRouter()

# Deshabilitar warnings de SSL verification (para certificados self-signed)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


@router.post("/validate", response_model=CapitaPeriodoResponse)
async def validate_capita_periodo(payload: CapitaPeriodoPayload, authorization: Optional[str] = Header(None)):
    """Envía Capita Periodo al ministerio con payload JSON."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token de autorización requerido")

    token = authorization.replace("Bearer ", "")

    try:
        service = MinisterioService()
        result = await service.cargar_capita_periodo(payload, token)
        return result
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 401:
            raise HTTPException(status_code=401, detail="Token expirado o inválido")
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=504, detail="Timeout al enviar Capita Periodo al ministerio")
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=503, detail=f"Error de conexión: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")
