from fastapi import APIRouter, HTTPException
from typing import List
import copy
import re

from app.models import (
    CorreccionRequest,
    CorreccionResponse,
    AplicarCorreccionRequest,
    AplicarCorreccionResponse,
    ValidationError,
)
from app.services.correccion_agent import CorreccionAgent

router = APIRouter()


@router.post("/analizar", response_model=CorreccionResponse)
async def analizar_errores(request: CorreccionRequest):
    """Analiza errores de validación y propone correcciones usando IA."""
    try:
        # Convertir errores dict a ValidationError
        errores = [
            ValidationError(
                Clase=e.get("Clase", ""),
                Codigo=e.get("Codigo", ""),
                Descripcion=e.get("Descripcion", ""),
                Fuente=e.get("Fuente", ""),
                Observaciones=e.get("Observaciones"),
                PathFuente=e.get("PathFuente")
            )
            for e in request.errores
        ]

        agent = CorreccionAgent()
        resultado = await agent.analizar_errores(
            errores=errores,
            xml_content=request.xml_content,
            rips_json=request.rips_json
        )

        return resultado

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al analizar: {str(e)}")


@router.post("/aplicar", response_model=AplicarCorreccionResponse)
async def aplicar_correcciones(request: AplicarCorreccionRequest):
    """Aplica las correcciones aprobadas a los archivos."""
    try:
        # Copiar objetos originales
        rips_corregido = copy.deepcopy(request.rips_json_original)
        cambios_aplicados = 0

        # Aplicar cada cambio
        for cambio in request.cambios:
            if _aplicar_cambio_json(rips_corregido, cambio.ruta_json, cambio.valor_nuevo):
                cambios_aplicados += 1

        # TODO: Aplicar cambios al XML si es necesario
        xml_corregido = request.xml_original

        return AplicarCorreccionResponse(
            xml_corregido=xml_corregido,
            rips_json_corregido=rips_corregido,
            cambios_aplicados=cambios_aplicados
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al aplicar: {str(e)}")


def _aplicar_cambio_json(obj: dict, ruta: str, valor_nuevo: any) -> bool:
    """
    Aplica un cambio a un objeto JSON dada una ruta en notación punto.
    Soporta índices de array: usuarios[0].tipoUsuario
    """
    try:
        # Parsear ruta: usuarios[0].tipoUsuario -> ['usuarios', '0', 'tipoUsuario']
        partes = re.split(r'\.|\[(\d+)\]', ruta)
        partes = [p for p in partes if p is not None and p != '']

        # Navegar hasta el padre del último campo
        actual = obj
        for parte in partes[:-1]:
            if parte.isdigit():
                actual = actual[int(parte)]
            else:
                actual = actual[parte]

        # Aplicar el cambio
        ultimo_campo = partes[-1]
        if ultimo_campo.isdigit():
            actual[int(ultimo_campo)] = valor_nuevo
        else:
            actual[ultimo_campo] = valor_nuevo

        return True

    except (KeyError, IndexError, TypeError):
        return False
