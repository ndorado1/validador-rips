from fastapi import APIRouter, HTTPException, Header
from app.models.schemas import NCValidationResponse, NCTotalPayload
from app.services.ministerio_service import MinisterioService
import requests

router = APIRouter()


@router.post("/enviar", response_model=NCValidationResponse)
async def enviar_nc_total(
    payload: NCTotalPayload,
    authorization: str = Header(...)
):
    """
    Envía NC Total al ministerio para validación.

    Args:
        payload: Payload con xmlFevFile en base64
        authorization: Header Authorization: Bearer <token>

    Returns:
        NCValidationResponse con resultado de la validación
    """
    # Extraer token del header Authorization: Bearer <token>
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token de autorización inválido")

    token = authorization.replace("Bearer ", "").strip()

    if not token:
        raise HTTPException(status_code=401, detail="Token de autorización requerido")

    try:
        service = MinisterioService()
        result = await service.enviar_nc_total(payload.xmlFevFile, token)
        return result
    except requests.exceptions.HTTPError as e:
        # Si el ministerio responde 401, propagar ese error al frontend
        if e.response.status_code == 401:
            raise HTTPException(
                status_code=401,
                detail="Token de SISPRO expirado o inválido. Por favor inicie sesión nuevamente."
            )
        raise HTTPException(
            status_code=500,
            detail=f"Error del ministerio: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al enviar NC Total: {str(e)}")
