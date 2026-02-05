from fastapi import APIRouter, HTTPException
from typing import List
import copy
import re
import logging

from app.models import (
    CorreccionRequest,
    CorreccionResponse,
    AplicarCorreccionRequest,
    AplicarCorreccionResponse,
    ValidationError,
)
from app.services.correccion_agent import CorreccionAgent

router = APIRouter()
logger = logging.getLogger(__name__)


def _convertir_tipo(valor_nuevo, valor_original):
    """
    Convierte valor_nuevo al tipo de valor_original para preservar
    tipos numéricos en el JSON (el ministerio rechaza strings donde espera números).
    """
    if valor_original is None or valor_nuevo is None:
        return valor_nuevo

    if isinstance(valor_nuevo, str) and isinstance(valor_original, (int, float)):
        try:
            if isinstance(valor_original, int):
                return int(valor_nuevo)
            return float(valor_nuevo)
        except (ValueError, TypeError):
            return valor_nuevo

    return valor_nuevo


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
        logger.info(f"[aplicar_correcciones] Recibidos {len(request.cambios)} cambios")
        for i, cambio in enumerate(request.cambios):
            if cambio.ruta_json:
                logger.info(f"[aplicar_correcciones] Cambio {i}: tipo=JSON, ruta='{cambio.ruta_json}', valor='{cambio.valor_nuevo}'")
            elif cambio.ruta_xml:
                logger.info(f"[aplicar_correcciones] Cambio {i}: tipo=XML, ruta='{cambio.ruta_xml}', valor='{cambio.valor_nuevo}'")

        # Copiar objetos originales
        rips_corregido = copy.deepcopy(request.rips_json_original)
        xml_corregido = request.xml_original
        logger.info(f"[aplicar_correcciones] Estructura JSON original: {list(rips_corregido.keys())}")

        cambios_aplicados = 0

        # Aplicar cada cambio
        for cambio in request.cambios:
            if cambio.ruta_json:
                # Cambio en JSON
                resultado = _aplicar_cambio_json(rips_corregido, cambio.ruta_json, cambio.valor_nuevo)
                logger.info(f"[aplicar_correcciones] Aplicando cambio JSON en '{cambio.ruta_json}': {'ÉXITO' if resultado else 'FALLÓ'}")
                if resultado:
                    cambios_aplicados += 1
            elif cambio.ruta_xml:
                # Cambio en XML
                resultado = _aplicar_cambio_xml(xml_corregido, cambio.ruta_xml, cambio.valor_nuevo)
                if resultado['success']:
                    xml_corregido = resultado['xml']
                    cambios_aplicados += 1
                    logger.info(f"[aplicar_correcciones] Aplicando cambio XML en '{cambio.ruta_xml}': ÉXITO")
                else:
                    logger.warning(f"[aplicar_correcciones] Aplicando cambio XML en '{cambio.ruta_xml}': FALLÓ - {resultado.get('error', 'desconocido')}")

        logger.info(f"[aplicar_correcciones] Total cambios aplicados: {cambios_aplicados}/{len(request.cambios)}")

        return AplicarCorreccionResponse(
            xml_corregido=xml_corregido,
            rips_json_corregido=rips_corregido,
            cambios_aplicados=cambios_aplicados
        )

    except Exception as e:
        logger.error(f"[aplicar_correcciones] Error: {e}")
        raise HTTPException(status_code=500, detail=f"Error al aplicar: {str(e)}")


def _aplicar_cambio_json(obj: dict, ruta: str, valor_nuevo: any) -> bool:
    """
    Aplica un cambio a un objeto JSON dada una ruta en notación punto.
    Soporta índices de array: usuarios[0].tipoUsuario
    También maneja rutas ambiguas donde un campo es array pero no se especifica índice.
    """
    logger = logging.getLogger(__name__)

    try:
        # Intentar 1: Ruta exacta como especificó el usuario
        partes = re.split(r'\.|\[(\d+)\]', ruta)
        partes = [p for p in partes if p is not None and p != '']

        # Navegar hasta el padre del último campo
        actual = obj
        for parte in partes[:-1]:
            if parte.isdigit():
                actual = actual[int(parte)]
            else:
                actual = actual[parte]

        # Aplicar el cambio, preservando el tipo original
        ultimo_campo = partes[-1]
        valor_tipado = _convertir_tipo(valor_nuevo, actual.get(ultimo_campo) if isinstance(actual, dict) else actual[int(ultimo_campo)] if ultimo_campo.isdigit() else valor_nuevo)
        if ultimo_campo.isdigit():
            actual[int(ultimo_campo)] = valor_tipado
        else:
            actual[ultimo_campo] = valor_tipado

        logger.info(f"[_aplicar_cambio_json] Éxito con ruta exacta: {ruta}")
        return True

    except (KeyError, IndexError, TypeError) as e:
        logger.warning(f"[_aplicar_cambio_json] Falló ruta exacta '{ruta}': {e}")

        # Intentar 2: Si la ruta falla, verificar si alguna parte es un array sin índice
        try:
            resultado = _aplicar_cambio_json_con_arrays(obj, ruta, valor_nuevo)
            if resultado:
                return True
        except Exception as e2:
            logger.error(f"[_aplicar_cambio_json] Falló método alternativo: {e2}")

        return False


def _aplicar_cambio_json_con_arrays(obj: dict, ruta: str, valor_nuevo: any) -> bool:
    """
    Intenta aplicar cambios manejando automáticamente arrays.
    Ej: 'usuarios.tipoUsuario' -> busca en 'usuarios[0].tipoUsuario', 'usuarios[1].tipoUsuario', etc.
    """
    logger = logging.getLogger(__name__)
    partes = ruta.split('.')

    def navegar_y_aplicar(actual, partes_restantes, ruta_construida=""):
        if not partes_restantes:
            return False

        parte = partes_restantes[0]
        resto = partes_restantes[1:]

        logger.debug(f"[_aplicar_cambio_json_con_arrays] Navegando: '{parte}' en {type(actual).__name__}")

        # Si es el último campo, aplicar el cambio
        if not resto:
            if isinstance(actual, dict) and parte in actual:
                logger.info(f"[_aplicar_cambio_json_con_arrays] Aplicando en {ruta_construida}.{parte}")
                actual[parte] = _convertir_tipo(valor_nuevo, actual[parte])
                return True
            elif isinstance(actual, list):
                # Aplicar a todos los elementos del array
                for i, item in enumerate(actual):
                    if isinstance(item, dict) and parte in item:
                        logger.info(f"[_aplicar_cambio_json_con_arrays] Aplicando en {ruta_construida}[{i}].{parte}")
                        item[parte] = _convertir_tipo(valor_nuevo, item[parte])
                return True
            return False

        # Navegar al siguiente nivel
        if isinstance(actual, dict):
            if parte not in actual:
                return False
            siguiente = actual[parte]
            nueva_ruta = f"{ruta_construida}.{parte}" if ruta_construida else parte

            if isinstance(siguiente, list):
                # Intentar con el primer elemento del array
                logger.info(f"[_aplicar_cambio_json_con_arrays] '{parte}' es array, intentando índice [0]")
                if len(siguiente) > 0:
                    return navegar_y_aplicar(siguiente[0], resto, f"{nueva_ruta}[0]")
            else:
                return navegar_y_aplicar(siguiente, resto, nueva_ruta)

        return False

    return navegar_y_aplicar(obj, partes)


def _aplicar_cambio_en_cdata(cdata_text: str, partes_ruta: list, valor_nuevo: str) -> dict:
    """
    Aplica un cambio a XML dentro de una sección CDATA usando regex.
    Preserva la estructura y formato original del XML (importante para documentos firmados).

    partes_ruta: lista de elementos de la ruta, ej: ['CreditNote', 'cac:LegalMonetaryTotal', 'cbc:LineExtensionAmount']
    """
    logger = logging.getLogger(__name__)

    tag_objetivo = partes_ruta[-1]
    contexto_padres = partes_ruta[1:-1]  # Sin root ni objetivo

    texto = cdata_text
    tag_regex = rf'(<{re.escape(tag_objetivo)}[^>]*>)[^<]*(</{re.escape(tag_objetivo)}>)'

    if contexto_padres:
        # Buscar dentro del padre inmediato para contexto correcto
        padre = contexto_padres[-1]
        padre_pattern = re.compile(
            rf'(<{re.escape(padre)}[^>]*>)(.*?)(</{re.escape(padre)}>)',
            re.DOTALL
        )

        for padre_match in padre_pattern.finditer(texto):
            contenido_padre = padre_match.group(2)

            tag_match = re.search(tag_regex, contenido_padre)
            if tag_match:
                nuevo_contenido = (
                    contenido_padre[:tag_match.start()] +
                    tag_match.group(1) + str(valor_nuevo) + tag_match.group(2) +
                    contenido_padre[tag_match.end():]
                )
                nuevo_texto = (
                    texto[:padre_match.start(2)] +
                    nuevo_contenido +
                    texto[padre_match.end(2):]
                )
                logger.info(f"[_aplicar_cambio_en_cdata] Modificado: {'/'.join(partes_ruta)}")
                return {'success': True, 'text': nuevo_texto}

    # Sin contexto padre o no encontrado: buscar el tag directamente
    tag_match = re.search(tag_regex, texto)
    if tag_match:
        nuevo_texto = (
            texto[:tag_match.start()] +
            tag_match.group(1) + str(valor_nuevo) + tag_match.group(2) +
            texto[tag_match.end():]
        )
        logger.info(f"[_aplicar_cambio_en_cdata] Modificado (sin contexto padre): {tag_objetivo}")
        return {'success': True, 'text': nuevo_texto}

    logger.warning(f"[_aplicar_cambio_en_cdata] No encontrado: {'/'.join(partes_ruta)}")
    return {'success': False}


def _aplicar_cambio_xml(xml_content: str, ruta: str, valor_nuevo: str) -> dict:
    """
    Aplica un cambio a un XML dada una ruta en formato de elementos separados por /.
    Soporta namespaces: ext:UBLExtensions/ext:UBLExtension
    Soporta documentos embebidos en CDATA (ej: CreditNote dentro de AttachedDocument).

    Retorna un dict con 'success' (bool) y 'xml' (str con el XML modificado o original si falló)
    """
    logger = logging.getLogger(__name__)

    try:
        from xml.etree import ElementTree as ET

        partes = ruta.split('/')
        if not partes:
            return {'success': False, 'xml': xml_content, 'error': 'Ruta vacía'}

        # === Verificar si el target está en un documento embebido (CDATA) ===
        primer_elemento = partes[0]
        cdata_matches = list(re.finditer(r'(<!\[CDATA\[)(.*?)(\]\]>)', xml_content, re.DOTALL))
        for cdata_match in cdata_matches:
            cdata_content = cdata_match.group(2)
            # Verificar si este CDATA contiene el elemento raíz buscado
            if re.search(rf'<{re.escape(primer_elemento)}[\s>]', cdata_content):
                logger.info(f"[_aplicar_cambio_xml] Documento embebido encontrado en CDATA: {primer_elemento}")
                resultado = _aplicar_cambio_en_cdata(cdata_content, partes, valor_nuevo)
                if resultado['success']:
                    new_xml = (xml_content[:cdata_match.start(2)] +
                              resultado['text'] +
                              xml_content[cdata_match.end(2):])
                    return {'success': True, 'xml': new_xml}

        # Intentar parsear el XML
        try:
            root = ET.fromstring(xml_content.encode('utf-8'))
        except ET.ParseError as e:
            logger.error(f"[_aplicar_cambio_xml] Error parseando XML: {e}")
            return {'success': False, 'xml': xml_content, 'error': 'XML mal formado'}

        logger.info(f"[_aplicar_cambio_xml] Buscando ruta: {ruta}")
        logger.info(f"[_aplicar_cambio_xml] Root tag: {root.tag}")

        # Extraer todos los namespaces del documento (incluyendo el root)
        ns_map = {}
        ns_map_reverse = {}  # URI -> prefijo

        # Primero buscar en el root los xmlns
        for attr_name, attr_value in root.attrib.items():
            if attr_name.startswith('xmlns:'):
                prefix = attr_name.split(':', 1)[1]
                ns_map[prefix] = attr_value
                ns_map_reverse[attr_value] = prefix
                logger.info(f"[_aplicar_cambio_xml] NS encontrado en root: {prefix} -> {attr_value}")
            elif attr_name == 'xmlns':
                ns_map[''] = attr_value
                ns_map_reverse[attr_value] = ''
                logger.info(f"[_aplicar_cambio_xml] NS default en root: {attr_value}")

        # También buscar en todos los elementos
        for elem in root.iter():
            for attr_name, attr_value in elem.attrib.items():
                if attr_name.startswith('xmlns:'):
                    prefix = attr_name.split(':', 1)[1]
                    if prefix not in ns_map:
                        ns_map[prefix] = attr_value
                        ns_map_reverse[attr_value] = prefix

        # El último elemento de la ruta es el que queremos modificar
        tag_objetivo = partes[-1]

        def get_tag_local(tag):
            """Extrae el nombre local del tag sin namespace"""
            return tag.split('}')[-1] if '}' in tag else tag

        def tag_match(elem_tag, search_tag):
            """Comprueba si un tag coincide con el tag buscado (manejando namespaces)"""
            elem_local = get_tag_local(elem_tag)

            if ':' in search_tag:
                ns_prefix, local_name = search_tag.split(':', 1)
                if elem_local == local_name:
                    return True
                # También comparar con namespace completo
                if ns_prefix in ns_map:
                    full_tag = f'{{{ns_map[ns_prefix]}}}{local_name}'
                    if elem_tag == full_tag:
                        return True
            else:
                if elem_local == search_tag:
                    return True

            return False

        def encontrar_y_modificar(elemento, partes_ruta, indice=0, ruta_actual=""):
            """
            Navega recursivamente por el XML para encontrar y modificar el elemento objetivo.
            Retorna True si se modificó al menos un elemento.
            """
            if indice >= len(partes_ruta):
                return False

            tag_buscado = partes_ruta[indice]
            ruta_construida = f"{ruta_actual}/{tag_buscado}" if ruta_actual else tag_buscado

            # Si es el primer elemento, verificar que coincida con el root
            if indice == 0:
                if not tag_match(elemento.tag, tag_buscado):
                    logger.warning(f"[_aplicar_cambio_xml] Root no coincide: {get_tag_local(elemento.tag)} != {tag_buscado}")
                    return False

                # Si solo hay una parte en la ruta, modificar el root
                if len(partes_ruta) == 1:
                    elemento.text = str(valor_nuevo)
                    logger.info(f"[_aplicar_cambio_xml] Elemento modificado (root): {tag_buscado} = {valor_nuevo}")
                    return True

                # Buscar en los hijos
                siguiente_tag = partes_ruta[indice + 1]
                for hijo in elemento:
                    if tag_match(hijo.tag, siguiente_tag):
                        resultado = encontrar_y_modificar(hijo, partes_ruta, indice + 1, ruta_construida)
                        if resultado:
                            return True
                return False

            # Para elementos intermedios o finales
            if not tag_match(elemento.tag, tag_buscado):
                return False

            # Si es el último elemento de la ruta, modificar su valor
            if indice == len(partes_ruta) - 1:
                elemento.text = str(valor_nuevo)
                logger.info(f"[_aplicar_cambio_xml] Elemento modificado: {ruta_construida} = {valor_nuevo}")
                return True

            # Buscar en los hijos el siguiente elemento de la ruta
            siguiente_tag = partes_ruta[indice + 1]
            for hijo in elemento:
                if tag_match(hijo.tag, siguiente_tag):
                    resultado = encontrar_y_modificar(hijo, partes_ruta, indice + 1, ruta_construida)
                    if resultado:
                        return True

            return False

        # Estrategia 1: Navegación por ruta exacta
        modificado = encontrar_y_modificar(root, partes)

        # Estrategia 2: Si falla, buscar por tags individuales en orden jerárquico
        if not modificado:
            logger.warning(f"[_aplicar_cambio_xml] Intentando búsqueda jerárquica...")

            def busqueda_jerarquica(elemento, partes_ruta, indice=0):
                """Busca recursivamente siguiendo la jerarquía de tags"""
                if indice >= len(partes_ruta):
                    return False

                tag_buscado = partes_ruta[indice]
                es_ultimo = (indice == len(partes_ruta) - 1)

                # Si es el último, modificar este elemento
                if es_ultimo and tag_match(elemento.tag, tag_buscado):
                    elemento.text = str(valor_nuevo)
                    logger.info(f"[_aplicar_cambio_xml] Modificado por jerarquía: {tag_buscado}")
                    return True

                # Buscar hijos que coincidan con el siguiente tag
                if tag_match(elemento.tag, tag_buscado) or indice == 0:
                    siguiente_tag = partes_ruta[indice + 1] if indice + 1 < len(partes_ruta) else None
                    if siguiente_tag:
                        for hijo in elemento:
                            if tag_match(hijo.tag, siguiente_tag):
                                if busqueda_jerarquica(hijo, partes_ruta, indice + 1):
                                    return True

                # También buscar en todos los descendientes
                for hijo in elemento:
                    if busqueda_jerarquica(hijo, partes_ruta, indice):
                        return True

                return False

            modificado = busqueda_jerarquica(root, partes)

        # Estrategia 3: Búsqueda por contexto - buscar elementos que estén dentro del padre correcto
        if not modificado:
            logger.warning(f"[_aplicar_cambio_xml] Intentando búsqueda por contexto...")

            tag_objetivo_local = tag_objetivo.split(':')[-1] if ':' in tag_objetivo else tag_objetivo
            padre_esperado = partes[-2] if len(partes) >= 2 else None
            abuelo_esperado = partes[-3] if len(partes) >= 3 else None

            for elem in root.iter():
                elem_local = get_tag_local(elem.tag)

                if elem_local == tag_objetivo_local:
                    # Verificar contexto (padre)
                    parent = None
                    for p in root.iter():
                        for child in p:
                            if child is elem:
                                parent = p
                                break
                        if parent:
                            break

                    if parent and padre_esperado:
                        parent_local = get_tag_local(parent.tag)
                        if tag_match(parent.tag, padre_esperado):
                            elem.text = str(valor_nuevo)
                            logger.info(f"[_aplicar_cambio_xml] Modificado por contexto: {tag_objetivo} en {parent_local}")
                            modificado = True
                            break

        # Estrategia 4: Búsqueda simple por tag (último recurso)
        if not modificado:
            logger.warning(f"[_aplicar_cambio_xml] Intentando búsqueda simple por tag: {tag_objetivo}")

            tag_objetivo_local = tag_objetivo.split(':')[-1] if ':' in tag_objetivo else tag_objetivo

            for elem in root.iter():
                if get_tag_local(elem.tag) == tag_objetivo_local:
                    elem.text = str(valor_nuevo)
                    logger.info(f"[_aplicar_cambio_xml] Elemento modificado por búsqueda simple: {tag_objetivo}")
                    modificado = True
                    break

        if modificado:
            # Convertir de vuelta a string
            ET.register_namespace('', 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2')
            ET.register_namespace('cbc', 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2')
            ET.register_namespace('cac', 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2')
            ET.register_namespace('ext', 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2')

            xml_modificado = ET.tostring(root, encoding='unicode')
            return {'success': True, 'xml': xml_modificado}
        else:
            logger.warning(f"[_aplicar_cambio_xml] No se pudo modificar el elemento: {ruta}")
            return {'success': False, 'xml': xml_content, 'error': f'Elemento no encontrado: {ruta}'}

    except Exception as e:
        logger.error(f"[_aplicar_cambio_xml] Error aplicando cambio: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return {'success': False, 'xml': xml_content, 'error': str(e)}
