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
