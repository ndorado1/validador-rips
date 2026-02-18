from fastapi import APIRouter, HTTPException, Header
from typing import Optional
import requests
import urllib3

from app.models import FevRipsPayload, FevRipsResponse
from app.services.ministerio_service import MinisterioService

router = APIRouter()

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


@router.post("/validate", response_model=FevRipsResponse)
async def validate_fev_rips(payload: FevRipsPayload, authorization: Optional[str] = Header(None)):
    """Envía FEV RIPS al ministerio (CargarFevRips)."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token de autorización requerido")

    token = authorization.replace("Bearer ", "")

    try:
        service = MinisterioService()
        result = await service.cargar_fev_rips(payload, token)
        return result
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 401:
            raise HTTPException(status_code=401, detail="Token expirado o inválido")
        detail = str(e)
        if e.response is not None and e.response.content:
            try:
                err_body = e.response.json()
                detail = f"{detail}. Ministerio: {err_body}"
            except Exception:
                detail = f"{detail}. Body: {e.response.text[:500]}"
        raise HTTPException(status_code=e.response.status_code, detail=detail)
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=504, detail="Timeout al enviar FEV RIPS al ministerio")
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=503, detail=f"Error de conexión: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")
