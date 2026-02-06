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
            interop_section = match.group(1)
            # Corregir schemeID de COBERTURA_PLAN_BENEFICIOS de 01 a 10
            interop_section = XMLProcessor._fix_cobertura_scheme_id(interop_section)
            return interop_section

        # Fallback: buscar solo CustomTagGeneral
        pattern2 = r'(<CustomTagGeneral>.*?<Interoperabilidad>.*?</Interoperabilidad>.*?</CustomTagGeneral>)'
        match2 = re.search(pattern2, embedded, re.DOTALL)
        if match2:
            # Envolver en UBLExtension
            content = match2.group(1)
            # Corregir schemeID de COBERTURA_PLAN_BENEFICIOS de 01 a 10
            content = XMLProcessor._fix_cobertura_scheme_id(content)
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

    @staticmethod
    def insert_sections(nc_xml: str, interop: Optional[str], period: Optional[str]) -> str:
        """Inserta Interoperabilidad e InvoicePeriod en la NC."""
        if not interop and not period:
            return nc_xml

        # Buscar CDATA
        cdata_match = re.search(r'(<!\[CDATA\[)(.*?)(\]\]>)', nc_xml, re.DOTALL)

        if cdata_match:
            prefix, creditnote, suffix = cdata_match.groups()
            modified_creditnote = creditnote

            # Insertar Interoperabilidad (después del último UBLExtension)
            if interop:
                close_extensions = modified_creditnote.find('</ext:UBLExtensions>')
                if close_extensions != -1:
                    # Encontrar el último UBLExtension antes de cerrar UBLExtensions
                    last_ext = modified_creditnote.rfind('</ext:UBLExtension>', 0, close_extensions)
                    if last_ext != -1:
                        insert_pos = last_ext + len('</ext:UBLExtension>')
                        modified_creditnote = (
                            modified_creditnote[:insert_pos] +
                            '\n    ' + interop +
                            modified_creditnote[insert_pos:]
                        )

            # Insertar InvoicePeriod (después de DiscrepancyResponse)
            if period:
                discrepancy_end = modified_creditnote.find('</cac:DiscrepancyResponse>')
                if discrepancy_end != -1:
                    insert_pos = discrepancy_end + len('</cac:DiscrepancyResponse>')
                    modified_creditnote = (
                        modified_creditnote[:insert_pos] +
                        '\n  ' + period +
                        modified_creditnote[insert_pos:]
                    )

            # Reconstruir
            new_cdata = prefix + modified_creditnote + suffix
            return nc_xml[:cdata_match.start()] + new_cdata + nc_xml[cdata_match.end():]

        # Si no hay CDATA, modificar directamente
        modified = nc_xml

        if interop:
            close_extensions = modified.find('</ext:UBLExtensions>')
            if close_extensions != -1:
                last_ext = modified.rfind('</ext:UBLExtension>', 0, close_extensions)
                if last_ext != -1:
                    insert_pos = last_ext + len('</ext:UBLExtension>')
                    modified = modified[:insert_pos] + '\n    ' + interop + modified[insert_pos:]

        if period:
            discrepancy_end = modified.find('</cac:DiscrepancyResponse>')
            if discrepancy_end != -1:
                insert_pos = discrepancy_end + len('</cac:DiscrepancyResponse>')
                modified = modified[:insert_pos] + '\n  ' + period + modified[insert_pos:]

        return modified

    @staticmethod
    def _fix_cobertura_scheme_id(interop_content: str) -> str:
        """Cambia schemeID de COBERTURA_PLAN_BENEFICIOS de 01 a 10."""
        # Reemplazar schemeID="01" por schemeID="10" cuando el campo es COBERTURA_PLAN_BENEFICIOS
        # El schemeID viene como atributo: <Value schemeID="01" ...>

        # Buscar <Name>COBERTURA_PLAN_BENEFICIOS</Name> seguido de <Value schemeID="01" ...>
        # y reemplazar por schemeID="10"
        result = re.sub(
            r'(<Name>COBERTURA_PLAN_BENEFICIOS</Name>\s*<Value[^>]*schemeID=")01(")',
            r'\g<1>10\g<2>',
            interop_content,
            flags=re.DOTALL
        )

        return result

    @staticmethod
    def aplicar_caso_colesterol(nc_xml: str) -> str:
        """Aplica el caso especial de colesterol: pone todos los valores monetarios en 0.00."""
        # Reemplazar valores monetarios en el XML por 0.00
        result = nc_xml

        # Reemplazar en elementos de monto
        montos = ['LineExtensionAmount', 'TaxExclusiveAmount', 'TaxInclusiveAmount',
                  'PrepaidAmount', 'PayableAmount', 'PriceAmount']

        for monto in montos:
            # Buscar valores como >38900.00<, >38900<, >38900.0000<
            pattern = rf'(<cbc:{monto}[^>]*>)[\d.]+(</cbc:{monto}>)'
            result = re.sub(pattern, r'\g<1>0.00\g<2>', result)

        # Reemplazar CreditedQuantity y BaseQuantity
        result = re.sub(r'(<cbc:CreditedQuantity[^>]*>)[\d.]+(</cbc:CreditedQuantity>)', r'\g<1>0.00\g<2>', result)
        result = re.sub(r'(<cbc:BaseQuantity[^>]*>)[\d.]+(</cbc:BaseQuantity>)', r'\g<1>0.00\g<2>', result)

        return result

    @staticmethod
    def aplicar_valores_cero_por_linea(nc_xml: str, lineas_ids: List[int]) -> str:
        """Pone a 0 los valores monetarios de lineas especificas de la NC y recalcula totales."""
        if not lineas_ids:
            return nc_xml

        result = nc_xml

        # Process each CreditNoteLine
        for line_id in lineas_ids:
            # Find the specific CreditNoteLine by ID
            pattern = rf'(<cac:CreditNoteLine[^>]*>.*?<cbc:ID[^>]*>{line_id}</cbc:ID>.*?</cac:CreditNoteLine>)'
            match = re.search(pattern, result, re.DOTALL)
            if not match:
                continue

            original_line = match.group(1)
            modified_line = original_line

            # Zero out LineExtensionAmount in this line
            modified_line = re.sub(
                r'(<cbc:LineExtensionAmount[^>]*>)[\d.]+(</cbc:LineExtensionAmount>)',
                r'\g<1>0.00\g<2>',
                modified_line
            )
            # Zero out PriceAmount in this line
            modified_line = re.sub(
                r'(<cbc:PriceAmount[^>]*>)[\d.]+(</cbc:PriceAmount>)',
                r'\g<1>0.00\g<2>',
                modified_line
            )
            # Zero out CreditedQuantity in this line
            modified_line = re.sub(
                r'(<cbc:CreditedQuantity[^>]*>)[\d.]+(</cbc:CreditedQuantity>)',
                r'\g<1>0.00\g<2>',
                modified_line
            )
            # Zero out BaseQuantity in this line
            modified_line = re.sub(
                r'(<cbc:BaseQuantity[^>]*>)[\d.]+(</cbc:BaseQuantity>)',
                r'\g<1>0.00\g<2>',
                modified_line
            )

            result = result.replace(original_line, modified_line)

        # Recalculate LegalMonetaryTotal by summing remaining LineExtensionAmounts
        total = 0.0
        for line_match in re.finditer(
            r'<cac:CreditNoteLine[^>]*>.*?<cbc:LineExtensionAmount[^>]*>([\d.]+)</cbc:LineExtensionAmount>.*?</cac:CreditNoteLine>',
            result, re.DOTALL
        ):
            total += float(line_match.group(1))

        # Update LegalMonetaryTotal fields
        total_str = f"{total:.2f}"

        # Update LineExtensionAmount in LegalMonetaryTotal
        result = re.sub(
            r'(<cac:LegalMonetaryTotal>.*?<cbc:LineExtensionAmount[^>]*>)[\d.]+(</cbc:LineExtensionAmount>)',
            rf'\g<1>{total_str}\g<2>',
            result, count=1, flags=re.DOTALL
        )
        # Update TaxInclusiveAmount in LegalMonetaryTotal
        result = re.sub(
            r'(<cac:LegalMonetaryTotal>.*?<cbc:TaxInclusiveAmount[^>]*>)[\d.]+(</cbc:TaxInclusiveAmount>)',
            rf'\g<1>{total_str}\g<2>',
            result, count=1, flags=re.DOTALL
        )
        # Update PayableAmount in LegalMonetaryTotal
        result = re.sub(
            r'(<cac:LegalMonetaryTotal>.*?<cbc:PayableAmount[^>]*>)[\d.]+(</cbc:PayableAmount>)',
            rf'\g<1>{total_str}\g<2>',
            result, count=1, flags=re.DOTALL
        )

        return result
