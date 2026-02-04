import json
from typing import List, Dict, Any
from openai import AsyncOpenAI

from app.models import (
    PropuestaCorreccion,
    CorreccionResponse,
    ValidationError
)
from app.config import settings


class CorreccionAgent:
    """Agente de IA para proponer correcciones a errores de validación CUV."""

    def __init__(self):
        self.client = AsyncOpenAI(
            api_key=settings.kimi_api_key,
            base_url=settings.kimi_base_url
        )
        self.model = settings.kimi_model

    async def analizar_errores(
        self,
        errores: List[ValidationError],
        xml_content: str,
        rips_json: dict
    ) -> CorreccionResponse:
        """Analiza errores y propone correcciones usando Kimi."""
        prompt = self._construir_prompt(errores, xml_content, rips_json)

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "Eres un experto en validación RIPS del Ministerio de Salud de Colombia."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.1,
                response_format={"type": "json_object"}
            )

            content = response.choices[0].message.content
            resultado = json.loads(content)

            return self._parsear_resultado(resultado, errores)

        except Exception as e:
            # En caso de error, retornar todos los errores como requieren revisión manual
            return CorreccionResponse(
                propuestas=[],
                requieren_revision_manual=[
                    {
                        "error": error.model_dump(),
                        "motivo": f"Error al procesar con el agente: {str(e)}"
                    }
                    for error in errores
                ]
            )

    def _construir_prompt(
        self,
        errores: List[ValidationError],
        xml_content: str,
        rips_json: dict
    ) -> str:
        """Construye el prompt para el agente de corrección."""
        # Truncar XML y JSON para evitar límites de tokens
        xml_truncado = xml_content[:5000] if len(xml_content) > 5000 else xml_content
        json_truncado = json.dumps(rips_json)[:3000] if len(json.dumps(rips_json)) > 3000 else json.dumps(rips_json)

        # Construir lista de errores
        errores_texto = []
        for i, error in enumerate(errores, 1):
            errores_texto.append(f"""
Error {i}:
  - Clase: {error.Clase}
  - Código: {error.Codigo}
  - Descripción: {error.Descripcion}
  - Fuente: {error.Fuente}
  - Observaciones: {error.Observaciones or 'N/A'}
  - PathFuente: {error.PathFuente or 'N/A'}
""")

        prompt = f"""Analiza los siguientes errores de validación CUV (Código Único de Validación) del Ministerio de Salud de Colombia y propón correcciones.

## ERRORES DE VALIDACIÓN:
{chr(10).join(errores_texto)}

## CONTENIDO XML (Nota Crédito FEV - truncado):
```xml
{xml_truncado}
```

## CONTENIDO RIPS (JSON - truncado):
```json
{json_truncado}
```

## INSTRUCCIONES:

1. Analiza cada error y determina si se puede corregir automáticamente
2. Para cada error que ENTIENDAS y puedas corregir, propón:
   - El campo específico a modificar
   - La ruta en el JSON (ruta_json) o XML (ruta_xml) donde se debe aplicar
   - El valor actual
   - El valor propuesto
   - Una justificación clara

3. Para errores que NO ENTIENDAS o que requieran revisión humana, inclúyelos en "requieren_revision_manual"

## FORMATO DE RESPUESTA (JSON):

{{
  "propuestas": [
    {{
      "error_codigo": "Código del error",
      "error_descripcion": "Descripción del error",
      "campo": "nombre_del_campo",
      "ruta_json": "ruta.en.el.json",
      "ruta_xml": "ruta/en/el/xml",
      "valor_actual": "valor actual",
      "valor_propuesto": "valor propuesto",
      "justificacion": "Explicación de por qué se propone este cambio"
    }}
  ],
  "requieren_revision_manual": [
    {{
      "error_codigo": "Código del error",
      "error_descripcion": "Descripción del error",
      "motivo": "Por qué no se pudo proponer una corrección automática"
    }}
  ]
}}

Responde SOLO con el JSON válido, sin explicaciones adicionales."""

        return prompt

    def _parsear_resultado(
        self,
        resultado: dict,
        errores_originales: List[ValidationError]
    ) -> CorreccionResponse:
        """Parsea el resultado de Kimi en un CorreccionResponse."""
        propuestas = []
        requieren_revision_manual = []

        # Procesar propuestas
        for propuesta_data in resultado.get("propuestas", []):
            try:
                propuesta = PropuestaCorreccion(
                    error_codigo=propuesta_data.get("error_codigo", ""),
                    error_descripcion=propuesta_data.get("error_descripcion", ""),
                    campo=propuesta_data.get("campo", ""),
                    ruta_json=propuesta_data.get("ruta_json"),
                    ruta_xml=propuesta_data.get("ruta_xml"),
                    valor_actual=propuesta_data.get("valor_actual"),
                    valor_propuesto=propuesta_data.get("valor_propuesto"),
                    justificacion=propuesta_data.get("justificacion", "")
                )
                propuestas.append(propuesta)
            except Exception as e:
                # Si hay error al parsear una propuesta, agregar a revisión manual
                requieren_revision_manual.append({
                    "error_codigo": propuesta_data.get("error_codigo", "desconocido"),
                    "error_descripcion": propuesta_data.get("error_descripcion", ""),
                    "motivo": f"Error al parsear propuesta: {str(e)}"
                })

        # Procesar errores que requieren revisión manual según el agente
        for manual_data in resultado.get("requieren_revision_manual", []):
            requieren_revision_manual.append({
                "error_codigo": manual_data.get("error_codigo", ""),
                "error_descripcion": manual_data.get("error_descripcion", ""),
                "motivo": manual_data.get("motivo", "Requiere revisión humana")
            })

        # Verificar que todos los errores originales estén cubiertos
        errores_cubiertos = set(p.error_codigo for p in propuestas)
        errores_cubiertos.update(m.get("error_codigo", "") for m in requieren_revision_manual)

        for error in errores_originales:
            if error.Codigo not in errores_cubiertos:
                # Error no cubierto, agregar a revisión manual
                requieren_revision_manual.append({
                    "error": error.model_dump(),
                    "motivo": "El agente no propuso corrección para este error"
                })

        return CorreccionResponse(
            propuestas=propuestas,
            requieren_revision_manual=requieren_revision_manual
        )
