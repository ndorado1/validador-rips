import pytest
from app.processors.xml_processor import XMLProcessor


class TestExtractCDATA:
    def test_extract_cdata_with_content(self):
        xml = '<root><![CDATA[<inner>content</inner>]]></root>'
        result = XMLProcessor.extract_cdata(xml)
        assert result == '<inner>content</inner>'

    def test_extract_cdata_empty(self):
        xml = '<root><![CDATA[]]></root>'
        result = XMLProcessor.extract_cdata(xml)
        assert result == ''

    def test_extract_cdata_no_cdata(self):
        xml = '<root><inner>content</inner></root>'
        result = XMLProcessor.extract_cdata(xml)
        assert result is None

    def test_get_embedded_document_with_cdata(self):
        xml = '<root><![CDATA[<inner>content</inner>]]></root>'
        result = XMLProcessor.get_embedded_document(xml)
        assert result == '<inner>content</inner>'

    def test_get_embedded_document_without_cdata(self):
        xml = '<inner>content</inner>'
        result = XMLProcessor.get_embedded_document(xml)
        assert result == xml


class TestExtractSections:
    def test_extract_interoperabilidad(self):
        xml = '''<root xmlns:ext="urn:ext" xmlns:cac="urn:cac" xmlns:cbc="urn:cbc">
        <ext:UBLExtension>
            <ext:ExtensionContent>
                <CustomTagGeneral>
                    <Interoperabilidad>
                        <Group>Test</Group>
                    </Interoperabilidad>
                </CustomTagGeneral>
            </ext:ExtensionContent>
        </ext:UBLExtension>
        </root>'''
        result = XMLProcessor.extract_interoperabilidad(xml)
        assert result is not None
        assert '<Interoperabilidad>' in result
        assert '<CustomTagGeneral>' in result

    def test_extract_interoperabilidad_not_found(self):
        xml = '<root><other>content</other></root>'
        result = XMLProcessor.extract_interoperabilidad(xml)
        assert result is None

    def test_extract_invoice_period(self):
        xml = '''<root xmlns:cac="urn:cac" xmlns:cbc="urn:cbc">
        <cac:InvoicePeriod>
            <cbc:StartDate>2025-01-01</cbc:StartDate>
            <cbc:EndDate>2025-01-31</cbc:EndDate>
        </cac:InvoicePeriod>
        </root>'''
        result = XMLProcessor.extract_invoice_period(xml)
        assert result is not None
        assert '<cac:InvoicePeriod>' in result
        assert '2025-01-01' in result

    def test_extract_invoice_period_not_found(self):
        xml = '<root><other>content</other></root>'
        result = XMLProcessor.extract_invoice_period(xml)
        assert result is None


class TestExtractNCLines:
    def test_extract_single_line(self):
        xml = '''<CreditNote xmlns:cac="urn:cac" xmlns:cbc="urn:cbc">
        <cac:CreditNoteLine>
            <cbc:ID>1</cbc:ID>
            <cbc:CreditedQuantity unitCode="EA">1.00</cbc:CreditedQuantity>
            <cbc:LineExtensionAmount currencyID="COP">2000.0000</cbc:LineExtensionAmount>
            <cac:Item>
                <cbc:Description>00037492 (19943544) PRESERVATIVOS</cbc:Description>
            </cac:Item>
        </cac:CreditNoteLine>
        </CreditNote>'''

        lines = XMLProcessor.extract_nc_lines(xml)
        assert len(lines) == 1
        assert lines[0].id == 1
        assert lines[0].cantidad == 1.0
        assert lines[0].valor == 2000.0
        assert lines[0].codigo_extraido == "19943544"

    def test_extract_multiple_lines(self):
        xml = '''<CreditNote xmlns:cac="urn:cac" xmlns:cbc="urn:cbc">
        <cac:CreditNoteLine>
            <cbc:ID>1</cbc:ID>
            <cbc:CreditedQuantity>1.00</cbc:CreditedQuantity>
            <cbc:LineExtensionAmount>2000.00</cbc:LineExtensionAmount>
            <cac:Item>
                <cbc:Description>(CODE1) Product 1</cbc:Description>
            </cac:Item>
        </cac:CreditNoteLine>
        <cac:CreditNoteLine>
            <cbc:ID>2</cbc:ID>
            <cbc:CreditedQuantity>2.00</cbc:CreditedQuantity>
            <cbc:LineExtensionAmount>500.00</cbc:LineExtensionAmount>
            <cac:Item>
                <cbc:Description>Product 2 sin codigo</cbc:Description>
            </cac:Item>
        </cac:CreditNoteLine>
        </CreditNote>'''

        lines = XMLProcessor.extract_nc_lines(xml)
        assert len(lines) == 2
        assert lines[0].codigo_extraido == "CODE1"
        assert lines[1].codigo_extraido is None

    def test_extract_no_lines(self):
        xml = '<CreditNote xmlns:cac="urn:cac"></CreditNote>'
        lines = XMLProcessor.extract_nc_lines(xml)
        assert len(lines) == 0


class TestInsertSections:
    def test_insert_both_sections_with_cdata(self):
        nc_xml = '''<?xml version="1.0"?>
<AttachedDocument>
  <cac:Attachment>
    <cac:ExternalReference>
      <cbc:Description><![CDATA[
        <CreditNote xmlns:ext="urn:ext" xmlns:cac="urn:cac">
          <ext:UBLExtensions>
            <ext:UBLExtension>Extension1</ext:UBLExtension>
            <ext:UBLExtension>Extension2</ext:UBLExtension>
          </ext:UBLExtensions>
          <cac:DiscrepancyResponse>Response</cac:DiscrepancyResponse>
          <cac:BillingReference>Ref</cac:BillingReference>
        </CreditNote>
      ]]></cbc:Description>
    </cac:ExternalReference>
  </cac:Attachment>
</AttachedDocument>'''

        interop = '<ext:UBLExtension><ext:ExtensionContent><CustomTagGeneral>Interop</CustomTagGeneral></ext:ExtensionContent></ext:UBLExtension>'
        period = '<cac:InvoicePeriod><cbc:StartDate>2025-01-01</cbc:StartDate></cac:InvoicePeriod>'

        result = XMLProcessor.insert_sections(nc_xml, interop, period)

        assert '<CustomTagGeneral>Interop</CustomTagGeneral>' in result
        assert '<cac:InvoicePeriod>' in result
        assert ']]>' in result  # CDATA preserved

    def test_insert_no_cdata(self):
        nc_xml = '''<CreditNote xmlns:ext="urn:ext" xmlns:cac="urn:cac">
          <ext:UBLExtensions>
            <ext:UBLExtension>Extension1</ext:UBLExtension>
          </ext:UBLExtensions>
          <cac:DiscrepancyResponse>Response</cac:DiscrepancyResponse>
        </CreditNote>'''

        interop = '<ext:UBLExtension><CustomTagGeneral>Interop</CustomTagGeneral></ext:UBLExtension>'

        result = XMLProcessor.insert_sections(nc_xml, interop, None)
        assert '<CustomTagGeneral>Interop</CustomTagGeneral>' in result

    def test_insert_none(self):
        nc_xml = '<root>content</root>'
        result = XMLProcessor.insert_sections(nc_xml, None, None)
        assert result == nc_xml
