import requests
import json
from typing import Dict, Any
import urllib3
import logging

from app.models import LoginCredentials, NCPayload, NCValidationResponse, ValidationError
from app.config import settings

# Configurar logging
logger = logging.getLogger(__name__)

# Deshabilitar warnings de SSL verification (para certificados self-signed)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class MinisterioService:
    """Servicio para comunicación con el API del Ministerio de Salud."""

    def __init__(self):
        self.base_url = settings.ministerio_api_url
        self.timeout = settings.ministerio_api_timeout

    async def login(self, credentials: LoginCredentials) -> str:
        """
        Realiza login con SISPRO y retorna el token JWT.

        Args:
            credentials: Credenciales de login (tipoDocumento, numeroDocumento, nit)

        Returns:
            Token JWT string

        Raises:
            requests.exceptions.HTTPError: Si hay error HTTP (401, etc.)
            requests.exceptions.Timeout: Si hay timeout
            requests.exceptions.RequestException: Para otros errores de conexión
        """
        url = f"{self.base_url}/auth/LoginSISPRO"

        # Construir payload según formato del Ministerio
        payload = {
            "persona": {
                "identificacion": {
                    "tipo": credentials.persona.identificacion.tipo,
                    "numero": credentials.persona.identificacion.numero
                }
            },
            "clave": credentials.clave,
            "nit": credentials.nit
        }

        response = requests.post(
            url,
            json=payload,
            timeout=self.timeout,
            verify=False  # Certificado self-signed del ministerio
        )
        response.raise_for_status()

        data = response.json()
        token = data.get("token")
        if not token:
            raise ValueError("No se recibió token en la respuesta")

        return token

    async def enviar_nc(self, payload: NCPayload, token: str) -> NCValidationResponse:
        """
        Envía la NC al ministerio para validación.

        Args:
            payload: Payload con rips y xmlFevFile en base64
            token: Token JWT de autorización

        Returns:
            NCValidationResponse con resultado de la validación
        """
        url = f"{self.base_url}/PaquetesFevRips/CargarNC"

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

        # El payload ya viene listo: { rips: {...}, xmlFevFile: "base64..." }
        json_payload = {
            "rips": payload.rips,
            "xmlFevFile": payload.xmlFevFile
        }

        # Intentar con retry logic
        max_retries = 2
        last_error = None

        for attempt in range(max_retries + 1):
            try:
                response = requests.post(
                    url,
                    json=json_payload,
                    headers=headers,
                    timeout=60,  # Timeout más largo para este endpoint
                    verify=False
                )
                response.raise_for_status()

                data = response.json()
                return self._parse_validation_response(data)

            except requests.exceptions.Timeout as e:
                last_error = e
                if attempt < max_retries:
                    continue  # Reintentar
                raise  # Agotados los reintentos

            except requests.exceptions.HTTPError:
                raise  # No reintentar errores HTTP

        # Si llegamos aquí, agotamos los reintentos por timeout
        if last_error:
            raise last_error

        raise RuntimeError("Error inesperado al enviar NC")

    def _parse_validation_response(self, data: Dict[str, Any]) -> NCValidationResponse:
        """
        Parsea la respuesta del ministerio al formato NCValidationResponse.

        Args:
            data: Respuesta JSON del ministerio

        Returns:
            NCValidationResponse estructurada
        """
        errores = []
        notificaciones = []

        # Los resultados vienen en "ResultadosValidacion" (array)
        resultados = data.get("ResultadosValidacion", [])

        for item in resultados:
            clase = item.get("Clase", "").upper()
            error_obj = ValidationError(
                Clase=item.get("Clase", ""),
                Codigo=item.get("Codigo", ""),
                Descripcion=item.get("Descripcion", ""),
                Fuente=item.get("Fuente", ""),
                Observaciones=item.get("Observaciones"),
                PathFuente=item.get("PathFuente")
            )

            if clase == "RECHAZADO":
                errores.append(error_obj)
            elif clase == "NOTIFICACION":
                notificaciones.append(error_obj)

        # Determinar éxito: ResultState es True y no hay errores de rechazo
        result_state = data.get("ResultState", False)
        # ResultState puede ser booleano o string
        if isinstance(result_state, str):
            result_state = result_state.lower() == "true"

        success = result_state is True and len(errores) == 0

        # CodigoUnicoValidacion solo es válido cuando ResultState es True
        codigo_unico_validacion = data.get("CodigoUnicoValidacion")
        if not result_state or codigo_unico_validacion == "No aplica a paquetes procesados en estado [RECHAZADO] o validaciones realizadas antes del envío al Ministerio de Salud y Protección Social":
            codigo_unico_validacion = None

        return NCValidationResponse(
            success=success,
            result_state=result_state,
            codigo_unico_validacion=codigo_unico_validacion,
            numeroRadicado=data.get("FechaRadicacion"),  # Usamos fecha como referencia
            errores=errores,
            notificaciones=notificaciones,
            raw_response=data
        )

    async def check_connectivity(self) -> bool:
        """
        Verifica si se puede conectar al API del ministerio.

        Returns:
            True si hay conectividad, False de lo contrario
        """
        try:
            # Intentar un GET a la raíz o health check
            url = f"{self.base_url}/health"
            response = requests.get(
                url,
                timeout=5,
                verify=False
            )
            return response.status_code < 500
        except requests.exceptions.RequestException:
            # Si falla, intentar con el endpoint de auth (que sabemos existe)
            try:
                url = f"{self.base_url}/auth/LoginSISPRO"
                response = requests.options(url, timeout=5, verify=False)
                return True  # Si no hay error de conexión, asumimos que está disponible
            except:
                return False
