import json
import re
from typing import List, Dict, Any, Optional
from openai import AsyncOpenAI
from app.config import settings
from app.models import LineaNC, ServicioRIPS, MatchResult, MatchingResponse, Confianza


class LLMMatcher:
    """Servicio de matching usando LLM."""

    def __init__(self):
        self.client = AsyncOpenAI(
            api_key=settings.llm_api_key,
            base_url=settings.llm_base_url
        )
        self.model = settings.llm_model

    async def match_services(
        self,
        lineas_nc: List[LineaNC],
        servicios_rips: List[ServicioRIPS]
    ) -> MatchingResponse:
        """Realiza el matching entre líneas NC y servicios RIPS."""

        # Primero intentar matching por código
        code_matches, unmatched_lines = self._match_by_code(lineas_nc, servicios_rips)

        # Si quedan líneas sin match, usar LLM
        if unmatched_lines:
            llm_matches = await self._match_with_llm(unmatched_lines, servicios_rips)
            code_matches.extend(llm_matches)

        return MatchingResponse(
            matches=code_matches,
            warnings=[]
        )

    def _match_by_code(
        self,
        lineas_nc: List[LineaNC],
        servicios_rips: List[ServicioRIPS]
    ) -> tuple[List[MatchResult], List[LineaNC]]:
        """Intenta hacer matching por código extraído de la descripción."""
        matches = []
        unmatched = []

        used_services = set()

        for linea in lineas_nc:
            if not linea.codigo_extraido:
                unmatched.append(linea)
                continue

            # Buscar servicio con ese código
            found = False
            for i, servicio in enumerate(servicios_rips):
                if i in used_services:
                    continue

                if servicio.codigo == linea.codigo_extraido:
                    cantidad = linea.valor / servicio.valor_unitario if servicio.valor_unitario > 0 else 0

                    matches.append(MatchResult(
                        linea_nc=linea.id,
                        tipo_servicio=servicio.tipo,
                        codigo_rips=servicio.codigo,
                        valor_nc=linea.valor,
                        valor_unitario_rips=servicio.valor_unitario,
                        cantidad_calculada=round(cantidad, 2),
                        confianza=Confianza.ALTA
                    ))
                    used_services.add(i)
                    found = True
                    break

            if not found:
                unmatched.append(linea)

        return matches, unmatched

    async def _match_with_llm(
        self,
        lineas_nc: List[LineaNC],
        servicios_rips: List[ServicioRIPS]
    ) -> List[MatchResult]:
        """Usa LLM para hacer matching de líneas restantes."""

        system_prompt = '''Eres un experto en facturación electrónica del sector salud colombiano.
Tu tarea es hacer el matching entre líneas de una Nota Crédito y servicios del RIPS.

REGLAS:
1. Cada línea de la NC debe matchear con UN servicio del RIPS
2. El código puede estar entre paréntesis en la descripción: "00037492 (19943544) NOMBRE" → código es "19943544"
3. Calcula cantidad: cantidad = valor_nc / valor_unitario_rips
4. Si no puedes calcular cantidad exacta, indica "verificar_manualmente"

TIPOS DE SERVICIO VÁLIDOS:
- medicamentos
- procedimientos
- consultas
- otrosServicios

RESPONDE SOLO JSON válido sin markdown ni explicaciones adicionales.'''

        user_prompt = self._build_prompt(lineas_nc, servicios_rips)

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.1,
                max_tokens=2000
            )

            content = response.choices[0].message.content
            # Limpiar posible markdown
            content = re.sub(r'```json\s*', '', content)
            content = re.sub(r'```\s*', '', content)

            data = json.loads(content)
            matches = []

            for match_data in data.get('matches', []):
                matches.append(MatchResult(
                    linea_nc=match_data['linea_nc'],
                    tipo_servicio=match_data['tipo_servicio'],
                    codigo_rips=match_data['codigo_rips'],
                    valor_nc=match_data['valor_nc'],
                    valor_unitario_rips=match_data['valor_unitario_rips'],
                    cantidad_calculada=match_data['cantidad_calculada'],
                    confianza=Confianza(match_data.get('confianza', 'media'))
                ))

            return matches

        except Exception as e:
            # Fallback: crear matches con baja confianza
            return self._fallback_matches(lineas_nc, servicios_rips)

    def _build_prompt(
        self,
        lineas_nc: List[LineaNC],
        servicios_rips: List[ServicioRIPS]
    ) -> str:
        """Construye el prompt para el LLM."""
        lines_text = []
        for linea in lineas_nc:
            lines_text.append(f"Línea {linea.id}:")
            lines_text.append(f"  - Descripción: {linea.descripcion}")
            lines_text.append(f"  - Cantidad en NC: {linea.cantidad}")
            lines_text.append(f"  - Valor: ${linea.valor}")

        services_text = []
        for servicio in servicios_rips:
            services_text.append(f"- Tipo: {servicio.tipo}")
            services_text.append(f"  Código: {servicio.codigo}")
            services_text.append(f"  Nombre: {servicio.nombre}")
            services_text.append(f"  Valor unitario: ${servicio.valor_unitario}")

        return f'''LÍNEAS DE LA NOTA CRÉDITO:
{chr(10).join(lines_text)}

SERVICIOS EN RIPS:
{chr(10).join(services_text)}

Realiza el matching y responde en formato JSON:
{{
  "matches": [
    {{
      "linea_nc": 1,
      "tipo_servicio": "medicamentos",
      "codigo_rips": "19943544",
      "valor_nc": 2000,
      "valor_unitario_rips": 500,
      "cantidad_calculada": 4,
      "confianza": "alta"
    }}
  ],
  "warnings": []
}}'''

    def _fallback_matches(
        self,
        lineas_nc: List[LineaNC],
        servicios_rips: List[ServicioRIPS]
    ) -> List[MatchResult]:
        """Matching fallback por similitud de texto simple."""
        matches = []
        used = set()

        for linea in lineas_nc:
            best_match = None
            best_score = 0

            for i, servicio in enumerate(servicios_rips):
                if i in used:
                    continue

                # Similitud simple: palabras en común
                line_words = set(linea.descripcion.lower().split())
                service_words = set(servicio.nombre.lower().split())
                common = line_words & service_words
                score = len(common) / max(len(line_words), len(service_words))

                if score > best_score and score > 0.3:
                    best_score = score
                    best_match = (i, servicio)

            if best_match:
                i, servicio = best_match
                cantidad = linea.valor / servicio.valor_unitario if servicio.valor_unitario > 0 else 1

                matches.append(MatchResult(
                    linea_nc=linea.id,
                    tipo_servicio=servicio.tipo,
                    codigo_rips=servicio.codigo,
                    valor_nc=linea.valor,
                    valor_unitario_rips=servicio.valor_unitario,
                    cantidad_calculada=round(cantidad, 2),
                    confianza=Confianza.BAJA
                ))
                used.add(i)

        return matches
