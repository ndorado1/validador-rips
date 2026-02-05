from pydantic import BaseModel
from typing import List, Optional, Any


class PropuestaCorreccion(BaseModel):
    error_codigo: str
    error_descripcion: str
    campo: str
    ruta_json: Optional[str] = None
    ruta_xml: Optional[str] = None
    valor_actual: Any
    valor_propuesto: Any
    justificacion: str


class CorreccionRequest(BaseModel):
    errores: List[dict]  # ValidationError como dicts
    xml_content: str
    rips_json: dict


class CorreccionResponse(BaseModel):
    propuestas: List[PropuestaCorreccion]
    requieren_revision_manual: List[dict]  # Errores que el agente no pudo entender


class CambioAprobado(BaseModel):
    ruta_json: Optional[str] = None
    ruta_xml: Optional[str] = None
    valor_nuevo: Any


class AplicarCorreccionRequest(BaseModel):
    cambios: List[CambioAprobado]
    xml_original: str
    rips_json_original: dict


class AplicarCorreccionResponse(BaseModel):
    xml_corregido: str
    rips_json_corregido: dict
    cambios_aplicados: int
