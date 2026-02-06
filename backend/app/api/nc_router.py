import re
import logging
from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from fastapi.responses import JSONResponse
from typing import List, Dict, Any, Optional

from app.processors.xml_processor import XMLProcessor
from app.processors.rips_processor import RIPSProcessor
from app.services.llm_matcher import LLMMatcher
from app.models import (
    ProcesarNCResponse,
    PreviewMatchingResponse,
    ValidacionResult,
    MatchingDetail,
    LineaNC,
    ServicioRIPS,
    ItemIgualadoCero,
    ValoresPreProcesamiento,
    PreviewValuesResponse,
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/procesar", response_model=ProcesarNCResponse)
async def procesar_nc(
    nc_xml: UploadFile = File(...),
    factura_xml: UploadFile = File(...),
    factura_rips: UploadFile = File(...),
    es_caso_colesterol: bool = Form(False)
):
    """Procesa una Nota Crédito completa."""

    errors = []
    warnings = []

    try:
        # Leer archivos
        nc_content = (await nc_xml.read()).decode('utf-8')
        factura_content = (await factura_xml.read()).decode('utf-8')
        rips_content = (await factura_rips.read()).decode('utf-8')

        # DEBUG: Loguear información del archivo NC
        logger.info(f"[procesar_nc] Archivo NC subido: {nc_xml.filename}")
        logger.info(f"[procesar_nc] Tamaño NC: {len(nc_content)} bytes")
        logger.info(f"[procesar_nc] Primeros 1000 caracteres del NC:\n{nc_content[:1000]}")
        logger.info(f"[procesar_nc] Buscando ParentDocumentID en contenido crudo...")

        # Buscar manualmente
        manual_search = re.search(r'<cbc:ParentDocumentID[^>]*>([^<]+)</cbc:ParentDocumentID>', nc_content)
        if manual_search:
            logger.info(f"[procesar_nc] Encontrado en contenido crudo: {manual_search.group(1).strip()}")
        else:
            logger.info(f"[procesar_nc] No se encontró ParentDocumentID en contenido crudo")

        # Extraer secciones de la factura
        interop = XMLProcessor.extract_interoperabilidad(factura_content)
        period = XMLProcessor.extract_invoice_period(factura_content)

        if not interop:
            errors.append("No se encontró sección de Interoperabilidad en la factura")
        if not period:
            errors.append("No se encontró InvoicePeriod en la factura")

        # Extraer líneas de la NC
        lineas_nc = XMLProcessor.extract_nc_lines(nc_content)
        if not lineas_nc:
            errors.append("No se encontraron líneas en la Nota Crédito")

        # Parsear RIPS
        rips_data = RIPSProcessor.parse_rips(rips_content)
        servicios_rips = RIPSProcessor.get_all_services(rips_data)

        if not servicios_rips:
            errors.append("No se encontraron servicios en el RIPS")

        # Si hay errores críticos, retornar
        if errors:
            return ProcesarNCResponse(
                success=False,
                nc_xml_completo="",
                nc_rips_json={},
                validacion=ValidacionResult(total_nc_xml=0, total_rips=0, coinciden=False, diferencia=0),
                matching_details=[],
                warnings=warnings,
                errors=errors
            )

        # Matching
        matcher = LLMMatcher()
        matching_result = await matcher.match_services(lineas_nc, servicios_rips)

        # Calculate pre-processing totals
        total_nc_original = _extract_total_nc_original(nc_content)
        total_rips_original = _calculate_total_rips_original(rips_data)
        valores_pre = ValoresPreProcesamiento(
            total_nc_xml=total_nc_original,
            total_rips=total_rips_original
        )

        # Detect equal values (item by item)
        items_igualados = _detect_equal_values(
            matching_result.matches, lineas_nc, servicios_rips
        )
        codigos_igualados = {item.codigo_rips for item in items_igualados}
        lineas_igualadas = [item.linea_nc for item in items_igualados]

        # Extraer número de nota
        num_nota = _extract_nc_number(nc_content)

        # Generar RIPS de NC
        matches_for_rips = [
            {
                'tipo_servicio': m.tipo_servicio,
                'codigo_rips': m.codigo_rips,
                'valor_nc': m.valor_nc,
                'cantidad_calculada': m.cantidad_calculada
            }
            for m in matching_result.matches
        ]

        nc_rips = RIPSProcessor.generate_nc_rips(
            rips_data, num_nota, matches_for_rips, es_caso_colesterol,
            codigos_igualados_a_cero=codigos_igualados if codigos_igualados else None
        )

        # Insertar secciones en NC
        nc_completo = XMLProcessor.insert_sections(nc_content, interop, period)

        # Apply per-line zero-equalization to XML
        if lineas_igualadas:
            nc_completo = XMLProcessor.aplicar_valores_cero_por_linea(nc_completo, lineas_igualadas)

        # Aplicar caso especial de colesterol si está activo
        if es_caso_colesterol:
            nc_completo = XMLProcessor.aplicar_caso_colesterol(nc_completo)

        # Validar totales
        # Usar nc_completo (con caso colesterol aplicado) no nc_content (original)
        total_nc = _extract_total_nc(nc_completo)
        total_rips = RIPSProcessor.calculate_total(nc_rips)

        validacion = ValidacionResult(
            total_nc_xml=total_nc,
            total_rips=total_rips,
            coinciden=abs(total_nc - total_rips) < 0.01,
            diferencia=round(total_nc - total_rips, 2)
        )

        # Construir detalles de matching
        def _get_cantidad_rips(tipo_servicio: str) -> Optional[float]:
            # Según especificación RIPS para NC:
            # - medicamentos: cantidad siempre 1
            # - otrosServicios: cantidad siempre 1
            # - procedimientos: no tienen campo cantidad en RIPS
            # - consultas: siempre 1
            if tipo_servicio == 'procedimientos':
                return None
            return 1.0

        matching_details = [
            MatchingDetail(
                linea_nc=m.linea_nc,
                descripcion_nc=next((l.descripcion for l in lineas_nc if l.id == m.linea_nc), ""),
                servicio_rips=f"{m.tipo_servicio}/{m.codigo_rips}",
                valor_nc=m.valor_nc,
                cantidad_calculada=m.cantidad_calculada,
                cantidad_rips=_get_cantidad_rips(m.tipo_servicio),
                confianza=m.confianza
            )
            for m in matching_result.matches
        ]

        return ProcesarNCResponse(
            success=True,
            nc_xml_completo=nc_completo,
            nc_rips_json=nc_rips,
            validacion=validacion,
            matching_details=matching_details,
            warnings=matching_result.warnings + warnings,
            errors=errors,
            numero_nota_credito=num_nota,
            valores_pre_procesamiento=valores_pre,
            items_igualados_a_cero=items_igualados
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/preview-matching", response_model=PreviewMatchingResponse)
async def preview_matching(
    nc_xml: UploadFile = File(...),
    factura_rips: UploadFile = File(...)
):
    """Preview del matching sin generar archivos."""

    try:
        nc_content = (await nc_xml.read()).decode('utf-8')
        rips_content = (await factura_rips.read()).decode('utf-8')

        lineas_nc = XMLProcessor.extract_nc_lines(nc_content)

        rips_data = RIPSProcessor.parse_rips(rips_content)
        servicios_rips = RIPSProcessor.get_all_services(rips_data)

        matcher = LLMMatcher()
        matching_result = await matcher.match_services(lineas_nc, servicios_rips)

        matching_sugerido = [
            {
                "linea_nc": m.linea_nc,
                "servicio": f"{m.tipo_servicio}/{m.codigo_rips}",
                "confianza": m.confianza.value
            }
            for m in matching_result.matches
        ]

        return PreviewMatchingResponse(
            lineas_nc=lineas_nc,
            servicios_rips=servicios_rips,
            matching_sugerido=matching_sugerido
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _extract_nc_number(nc_xml: str) -> str:
    """Extrae el número de nota del XML (ParentDocumentID)."""
    # Buscar en el XML completo (no solo el embedded) para Mayor robustez
    xml_to_search = nc_xml

    logger.info(f"[_extract_nc_number] XML length: {len(xml_to_search)}")

    # Buscar ParentDocumentID con varios formatos posibles
    patterns = [
        r'<cbc:ParentDocumentID[^>]*>([^<]+)</cbc:ParentDocumentID>',
        r'<ParentDocumentID[^>]*>([^<]+)</ParentDocumentID>',
    ]

    for pattern in patterns:
        match = re.search(pattern, xml_to_search)
        if match:
            result = match.group(1).strip()
            logger.info(f"[_extract_nc_number] Found ParentDocumentID: {result}")
            return result

    # Fallback: buscar ID
    id_patterns = [
        r'<cbc:ID[^>]*>([^<]+)</cbc:ID>',
        r'<ID[^>]*>([^<]+)</ID>',
    ]

    for pattern in id_patterns:
        match = re.search(pattern, xml_to_search)
        if match:
            result = match.group(1).strip()
            logger.info(f"[_extract_nc_number] Found ID (fallback): {result}")
            return result

    logger.warning("[_extract_nc_number] No ID found, returning 'NC'")
    return "NC"


def _extract_total_nc(nc_xml: str) -> float:
    """Extrae el valor total de la NC."""
    embedded = XMLProcessor.get_embedded_document(nc_xml)
    # Buscar PayableAmount
    match = re.search(r'<cbc:PayableAmount[^>]*>([^<]+)</cbc:PayableAmount>', embedded)
    if match:
        return float(match.group(1))
    # Fallback: sumar líneas
    lines = XMLProcessor.extract_nc_lines(nc_xml)
    return sum(l.valor for l in lines)


def _extract_total_nc_original(nc_content: str) -> float:
    """Extract total from original NC XML (before any modifications)."""
    embedded = XMLProcessor.get_embedded_document(nc_content)
    match = re.search(r'<cbc:PayableAmount[^>]*>([^<]+)</cbc:PayableAmount>', embedded)
    if match:
        return float(match.group(1))
    lines = XMLProcessor.extract_nc_lines(nc_content)
    return sum(l.valor for l in lines)


def _calculate_total_rips_original(rips_data) -> float:
    """Calculate total vrServicio from original RIPS."""
    return RIPSProcessor.calculate_total(rips_data)


def _detect_equal_values(
    matching_result_matches,
    lineas_nc: List[LineaNC],
    servicios_rips: List[ServicioRIPS]
) -> List[ItemIgualadoCero]:
    """Detect items where NC XML and RIPS values are equal before processing."""
    items_igualados = []

    for m in matching_result_matches:
        linea = next((l for l in lineas_nc if l.id == m.linea_nc), None)
        if not linea:
            continue

        valor_nc = linea.valor

        servicio = next(
            (s for s in servicios_rips
             if s.codigo == m.codigo_rips and s.tipo == m.tipo_servicio),
            None
        )
        if not servicio:
            continue

        valor_rips = servicio.valor_unitario

        if abs(valor_nc - valor_rips) < 0.01:
            items_igualados.append(ItemIgualadoCero(
                linea_nc=m.linea_nc,
                codigo_rips=m.codigo_rips,
                tipo_servicio=m.tipo_servicio,
                valor_original=valor_nc
            ))

    return items_igualados


@router.post("/preview-values", response_model=PreviewValuesResponse)
async def preview_values(
    nc_xml: UploadFile = File(...),
    factura_rips: UploadFile = File(...)
):
    """Preview original values from NC XML and RIPS before processing."""
    try:
        nc_content = (await nc_xml.read()).decode('utf-8')
        rips_content = (await factura_rips.read()).decode('utf-8')

        total_nc = _extract_total_nc_original(nc_content)

        rips_data = RIPSProcessor.parse_rips(rips_content)
        total_rips = RIPSProcessor.calculate_total(rips_data)

        nc_cdata = XMLProcessor.extract_cdata(nc_content) or nc_content

        return PreviewValuesResponse(
            valores_nc_xml=total_nc,
            valores_rips=total_rips,
            nc_xml_cdata=nc_cdata,
            rips_json=rips_data
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
