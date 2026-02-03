import re
from typing import Optional, List, Dict
from app.models import LineaNC


class XMLProcessor:
    """Procesador de archivos XML para NC y Facturas."""

    @staticmethod
    def extract_cdata(xml_content: str) -> Optional[str]:
        """Extrae el contenido del CDATA (documento embebido)."""
        match = re.search(r'<!\[CDATA\[(.*?)\]\]>', xml_content, re.DOTALL)
        return match.group(1) if match else None

    @staticmethod
    def get_embedded_document(xml_content: str) -> str:
        """Obtiene el documento embebido (dentro de CDATA o el mismo XML)."""
        embedded = XMLProcessor.extract_cdata(xml_content)
        return embedded if embedded else xml_content

    @staticmethod
    def extract_interoperabilidad(factura_xml: str) -> Optional[str]:
        """Extrae UBLExtension completo con CustomTagGeneral."""
        embedded = XMLProcessor.get_embedded_document(factura_xml)

        # Buscar el UBLExtension que contiene CustomTagGeneral con Interoperabilidad
        pattern = r'(<ext:UBLExtension>\s*<ext:ExtensionContent>\s*<CustomTagGeneral>.*?<Interoperabilidad>.*?</Interoperabilidad>.*?</CustomTagGeneral>\s*</ext:ExtensionContent>\s*</ext:UBLExtension>)'
        match = re.search(pattern, embedded, re.DOTALL)

        if match:
            return match.group(1)

        # Fallback: buscar solo CustomTagGeneral
        pattern2 = r'(<CustomTagGeneral>.*?<Interoperabilidad>.*?</Interoperabilidad>.*?</CustomTagGeneral>)'
        match2 = re.search(pattern2, embedded, re.DOTALL)
        if match2:
            # Envolver en UBLExtension
            content = match2.group(1)
            return f'<ext:UBLExtension>\n      <ext:ExtensionContent>\n        {content}\n      </ext:ExtensionContent>\n    </ext:UBLExtension>'

        return None

    @staticmethod
    def extract_invoice_period(factura_xml: str) -> Optional[str]:
        """Extrae el InvoicePeriod del documento."""
        embedded = XMLProcessor.get_embedded_document(factura_xml)

        pattern = r'(<cac:InvoicePeriod>.*?</cac:InvoicePeriod>)'
        match = re.search(pattern, embedded, re.DOTALL)
        return match.group(1) if match else None

    @staticmethod
    def extract_nc_lines(nc_xml: str) -> List[LineaNC]:
        """Extrae las líneas de la Nota Crédito."""
        embedded = XMLProcessor.get_embedded_document(nc_xml)
        lines = []

        # Buscar CreditNoteLine
        for match in re.finditer(r'<cac:CreditNoteLine[^>]*>(.*?)</cac:CreditNoteLine>', embedded, re.DOTALL):
            line_content = match.group(1)
            line = {}

            # ID
            id_match = re.search(r'<cbc:ID[^>]*>(\d+)</cbc:ID>', line_content)
            if id_match:
                line['id'] = int(id_match.group(1))
            else:
                continue

            # Cantidad (CreditedQuantity)
            qty_match = re.search(r'<cbc:CreditedQuantity[^>]*>([^<]+)</cbc:CreditedQuantity>', line_content)
            if qty_match:
                line['cantidad'] = float(qty_match.group(1))
            else:
                line['cantidad'] = 0.0

            # Valor (LineExtensionAmount)
            amount_match = re.search(r'<cbc:LineExtensionAmount[^>]*>([^<]+)</cbc:LineExtensionAmount>', line_content)
            if amount_match:
                line['valor'] = float(amount_match.group(1))
            else:
                line['valor'] = 0.0

            # Descripción
            desc_match = re.search(r'<cbc:Description>([^<]+)</cbc:Description>', line_content)
            if desc_match:
                desc = desc_match.group(1)
                line['descripcion'] = desc
                # Extraer código entre paréntesis
                code_match = re.search(r'\(([A-Z0-9\-]+)\)', desc)
                if code_match:
                    line['codigo_extraido'] = code_match.group(1)
            else:
                line['descripcion'] = ''

            lines.append(LineaNC(**line))

        return lines
