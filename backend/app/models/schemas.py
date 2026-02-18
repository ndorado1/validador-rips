from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from enum import Enum


class Confianza(str, Enum):
    ALTA = "alta"
    MEDIA = "media"
    BAJA = "baja"


class LineaNC(BaseModel):
    id: int
    cantidad: float
    valor: float
    descripcion: str
    codigo_extraido: Optional[str] = None


class ServicioRIPS(BaseModel):
    tipo: str
    codigo: str
    nombre: str
    valor_unitario: float
    cantidad_original: float
    datos_completos: Dict[str, Any]


class MatchResult(BaseModel):
    linea_nc: int
    tipo_servicio: str
    codigo_rips: str
    valor_nc: float
    valor_unitario_rips: float
    cantidad_calculada: float
    confianza: Confianza


class MatchingResponse(BaseModel):
    matches: List[MatchResult]
    warnings: List[str]


class ValidacionResult(BaseModel):
    total_nc_xml: float
    total_rips: float
    coinciden: bool
    diferencia: float


class MatchingDetail(BaseModel):
    linea_nc: int
    descripcion_nc: str
    servicio_rips: str
    valor_nc: float
    cantidad_calculada: float
    cantidad_rips: Optional[float] = None
    confianza: Confianza


class ItemIgualadoCero(BaseModel):
    linea_nc: int
    codigo_rips: str
    tipo_servicio: str
    valor_original: float


class ValoresPreProcesamiento(BaseModel):
    total_nc_xml: float
    total_rips: float


class ProcesarNCResponse(BaseModel):
    success: bool
    nc_xml_completo: str
    nc_rips_json: Dict[str, Any]
    validacion: ValidacionResult
    matching_details: List[MatchingDetail]
    warnings: List[str]
    errors: List[str]
    numero_nota_credito: Optional[str] = None  # Número de NC extraído del XML
    valores_pre_procesamiento: Optional[ValoresPreProcesamiento] = None
    items_igualados_a_cero: List[ItemIgualadoCero] = []


class PreviewMatchingResponse(BaseModel):
    lineas_nc: List[LineaNC]
    servicios_rips: List[ServicioRIPS]
    matching_sugerido: List[Dict[str, Any]]


class PreviewValuesResponse(BaseModel):
    valores_nc_xml: float
    valores_rips: float
    nc_xml_cdata: str
    rips_json: Dict[str, Any]


# Schemas para validación CUV con Ministerio de Salud

class Identificacion(BaseModel):
    tipo: str
    numero: str


class Persona(BaseModel):
    identificacion: Identificacion


class LoginCredentials(BaseModel):
    persona: Persona
    clave: str
    nit: str


class LoginResponse(BaseModel):
    token: str
    success: bool
    message: Optional[str] = None


class NCPayload(BaseModel):
    rips: Dict[str, Any]
    xmlFevFile: str  # Base64


class ValidationError(BaseModel):
    Clase: str
    Codigo: str
    Descripcion: str
    Fuente: str
    Observaciones: Optional[str] = None
    PathFuente: Optional[str] = None


class NCValidationResponse(BaseModel):
    success: bool
    result_state: Optional[bool] = None  # ResultState del ministerio
    codigo_unico_validacion: Optional[str] = None  # CUV - 96 caracteres hexadecimales
    errores: List[ValidationError] = []
    notificaciones: List[ValidationError] = []
    raw_response: Optional[Dict[str, Any]] = None  # Respuesta completa para descarga


# Schemas para Capita Periodo
class CapitaPeriodoPayload(BaseModel):
    rips: Dict[str, Any]
    xmlFevFile: str  # Base64


class CapitaPeriodoResponse(BaseModel):
    success: bool
    result_state: Optional[bool] = None
    codigo_unico_validacion: Optional[str] = None
    errores: List[ValidationError] = []
    notificaciones: List[ValidationError] = []
    raw_response: Optional[Dict[str, Any]] = None


# Schemas para NC Total
class NCTotalPayload(BaseModel):
    xmlFevFile: str  # Base64 del XML


# Schemas para FEV RIPS (CargarFevRips)
class FevRipsPayload(BaseModel):
    rips: Dict[str, Any]
    xmlFevFile: str  # Base64


class FevRipsResponse(BaseModel):
    success: bool
    result_state: Optional[bool] = None
    codigo_unico_validacion: Optional[str] = None
    errores: List[ValidationError] = []
    notificaciones: List[ValidationError] = []
    raw_response: Optional[Dict[str, Any]] = None
