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
