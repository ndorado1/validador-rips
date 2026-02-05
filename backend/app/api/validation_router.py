from fastapi import APIRouter, HTTPException, Header
from typing import Optional
import requests
import urllib3

from app.models import (
    LoginCredentials,
    LoginResponse,
    NCPayload,
    NCValidationResponse
)
from app.config import settings
from app.services.ministerio_service import MinisterioService

router = APIRouter()

# Deshabilitar warnings de SSL verification (para certificados self-signed)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


@router.post("/login", response_model=LoginResponse)
async def login_sispro(credentials: LoginCredentials):
    """Login con SISPRO, retorna token JWT."""
    try:
        service = MinisterioService()
        token = await service.login(credentials)
        return LoginResponse(
            success=True,
            token=token,
            message="Login exitoso"
        )
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 401:
            raise HTTPException(status_code=401, detail="Credenciales inválidas")
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=504, detail="Timeout al conectar con SISPRO")
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=503, detail=f"Error de conexión: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")


@router.post("/enviar-nc", response_model=NCValidationResponse)
async def enviar_nc(payload: NCPayload, authorization: Optional[str] = Header(None)):
    """Envía NC al ministerio con payload JSON."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token de autorización requerido")

    token = authorization.replace("Bearer ", "")

    try:
        service = MinisterioService()
        result = await service.enviar_nc(payload, token)
        return result
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 401:
            raise HTTPException(status_code=401, detail="Token expirado o inválido")
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=504, detail="Timeout al enviar NC al ministerio")
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=503, detail=f"Error de conexión: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")


@router.get("/status")
async def check_status():
    """Verificar conectividad con el API del Ministerio."""
    try:
        service = MinisterioService()
        is_connected = await service.check_connectivity()
        return {
            "connected": is_connected,
            "message": "Conectado" if is_connected else "No se puede conectar al Ministerio"
        }
    except Exception as e:
        return {
            "connected": False,
            "message": f"Error: {str(e)}"
        }
