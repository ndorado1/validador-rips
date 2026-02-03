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
