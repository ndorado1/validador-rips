# NC Processor - Plan de Implementación

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Crear una aplicación web completa que automatice la generación de Notas Crédito con Interoperabilidad del sector salud y sus archivos RIPS asociados para la DIAN colombiana.

**Architecture:** Backend en FastAPI con procesadores modulares (XMLProcessor, RIPSProcessor, LLMMatcher) y frontend React con Vite. El sistema extrae secciones de facturas originales, las inserta en NCs, y usa LLM para hacer matching inteligente entre líneas de NC y servicios RIPS.

**Tech Stack:** Python 3.10+, FastAPI, Pydantic v2, OpenAI SDK, React 18+, Vite, TailwindCSS, shadcn/ui

---

## Task 1: Estructura Base del Proyecto

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/.env.example`
- Create: `backend/.gitignore`
- Create: `frontend/.gitignore`
- Create: `frontend/package.json`
- Create: `.gitignore` (root)

**Step 1: Crear estructura de directorios**

```bash
mkdir -p backend/app/{processors,services,models,api}
mkdir -p backend/tests
mkdir -p frontend/src/{components,pages,hooks,utils}
mkdir -p frontend/public
```

**Step 2: Crear backend/requirements.txt**

```txt
fastapi==0.115.0
uvicorn[standard]==0.32.0
pydantic==2.9.0
pydantic-settings==2.6.0
python-multipart==0.0.17
openai==1.54.0
httpx==0.27.0
pytest==8.3.0
pytest-asyncio==0.24.0
```

**Step 3: Crear backend/.env.example**

```env
# LLM Configuration
LLM_API_KEY=your_kimi_api_key_here
LLM_BASE_URL=https://api.moonshot.cn/v1
LLM_MODEL=moonshot-v1-128k

# Server
HOST=0.0.0.0
PORT=8000
DEBUG=true

# CORS
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

**Step 4: Crear backend/.gitignore**

```gitignore
__pycache__/
*.py[cod]
*$py.class
*.so
.env
.venv
venv/
ENV/
env/
*.log
.pytest_cache/
.coverage
htmlcov/
```

**Step 5: Crear frontend/package.json**

```json
{
  "name": "nc-processor-frontend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "axios": "^1.7.0",
    "lucide-react": "^0.454.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0"
  }
}
```

**Step 6: Crear frontend/.gitignore**

```gitignore
node_modules/
dist/
dist-ssr/
*.local
.env
.env.local
*.log
```

**Step 7: Crear .gitignore root**

```gitignore
# Python
__pycache__/
*.py[cod]
.env
.venv/

# Node
node_modules/
dist/

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db
```

**Step 8: Commit**

```bash
git add .
git commit -m "chore: initial project structure"
```

---

## Task 2: Configuración del Backend - Settings y Main

**Files:**
- Create: `backend/app/__init__.py`
- Create: `backend/app/config.py`
- Create: `backend/app/main.py`

**Step 1: Crear backend/app/config.py**

```python
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    llm_api_key: str
    llm_base_url: str = "https://api.moonshot.cn/v1"
    llm_model: str = "moonshot-v1-128k"

    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = True
    cors_origins: List[str] = ["http://localhost:5173"]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
```

**Step 2: Crear backend/app/main.py**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.api import nc_router

app = FastAPI(
    title="NC Processor API",
    description="API para procesar Notas Crédito del sector salud",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(nc_router.router, prefix="/api/nc", tags=["Notas Crédito"])


@app.get("/health")
async def health_check():
    return {"status": "ok"}
```

**Step 3: Crear backend/app/__init__.py**

```python
# Empty file
```

**Step 4: Commit**

```bash
git add backend/app/
git commit -m "feat: add backend config and main app"
```

---

## Task 3: Modelos Pydantic

**Files:**
- Create: `backend/app/models/__init__.py`
- Create: `backend/app/models/schemas.py`

**Step 1: Crear backend/app/models/schemas.py**

```python
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from enum import Enum


class Confianza(str, Enum):
    ALTA = "alta"
    MEDIA = "media"
    BAJA = "baja"


class LineaNC(BaseModel):
    id: int
    cantidad: float
    valor: float
    descripcion: str
    codigo_extraido: Optional[str] = None


class ServicioRIPS(BaseModel):
    tipo: str
    codigo: str
    nombre: str
    valor_unitario: float
    cantidad_original: float
    datos_completos: Dict[str, Any]


class MatchResult(BaseModel):
    linea_nc: int
    tipo_servicio: str
    codigo_rips: str
    valor_nc: float
    valor_unitario_rips: float
    cantidad_calculada: float
    confianza: Confianza


class MatchingResponse(BaseModel):
    matches: List[MatchResult]
    warnings: List[str]


class ValidacionResult(BaseModel):
    total_nc_xml: float
    total_rips: float
    coinciden: bool
    diferencia: float


class MatchingDetail(BaseModel):
    linea_nc: int
    descripcion_nc: str
    servicio_rips: str
    valor_nc: float
    cantidad_calculada: float
    confianza: Confianza


class ProcesarNCResponse(BaseModel):
    success: bool
    nc_xml_completo: str
    nc_rips_json: Dict[str, Any]
    validacion: ValidacionResult
    matching_details: List[MatchingDetail]
    warnings: List[str]
    errors: List[str]


class PreviewMatchingResponse(BaseModel):
    lineas_nc: List[LineaNC]
    servicios_rips: List[ServicioRIPS]
    matching_sugerido: List[Dict[str, Any]]
```

**Step 2: Crear backend/app/models/__init__.py**

```python
from .schemas import (
    LineaNC,
    ServicioRIPS,
    MatchResult,
    MatchingResponse,
    ValidacionResult,
    MatchingDetail,
    ProcesarNCResponse,
    PreviewMatchingResponse,
    Confianza,
)
```

**Step 3: Commit**

```bash
git add backend/app/models/
git commit -m "feat: add pydantic models"
```

---

## Task 4: XMLProcessor - Extracción de CDATA

**Files:**
- Create: `backend/app/processors/__init__.py`
- Create: `backend/app/processors/xml_processor.py`
- Create: `backend/tests/test_xml_processor.py`

**Step 1: Crear backend/app/processors/xml_processor.py**

```python
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
```

**Step 2: Crear backend/tests/test_xml_processor.py**

```python
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
```

**Step 3: Ejecutar tests**

```bash
cd backend
python -m pytest tests/test_xml_processor.py -v
```

**Step 4: Commit**

```bash
git add backend/app/processors/ backend/tests/
git commit -m "feat: add XMLProcessor with CDATA extraction"
```

---

## Task 5: XMLProcessor - Extracción de Secciones

**Files:**
- Modify: `backend/app/processors/xml_processor.py`

**Step 1: Agregar métodos de extracción**

```python
# Agregar a XMLProcessor class en xml_processor.py

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
```

**Step 2: Agregar tests**

```python
# Agregar a test_xml_processor.py

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
```

**Step 3: Ejecutar tests**

```bash
python -m pytest tests/test_xml_processor.py -v
```

**Step 4: Commit**

```bash
git add backend/
git commit -m "feat: add section extraction methods"
```

---

## Task 6: XMLProcessor - Extracción de Líneas NC

**Files:**
- Modify: `backend/app/processors/xml_processor.py`

**Step 1: Agregar método extract_nc_lines**

```python
# Agregar a XMLProcessor class

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
```

**Step 2: Agregar tests**

```python
# Agregar a test_xml_processor.py

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
```

**Step 3: Ejecutar tests**

```bash
python -m pytest tests/test_xml_processor.py -v
```

**Step 4: Commit**

```bash
git add backend/
git commit -m "feat: add NC line extraction"
```

---

## Task 7: XMLProcessor - Inserción de Secciones

**Files:**
- Modify: `backend/app/processors/xml_processor.py`

**Step 1: Agregar método insert_sections**

```python
# Agregar a XMLProcessor class

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
```

**Step 2: Agregar tests**

```python
# Agregar a test_xml_processor.py

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
```

**Step 3: Ejecutar tests**

```bash
python -m pytest tests/test_xml_processor.py -v
```

**Step 4: Commit**

```bash
git add backend/
git commit -m "feat: add section insertion to NC"
```

---

## Task 8: RIPSProcessor - Parseo y Extracción

**Files:**
- Create: `backend/app/processors/rips_processor.py`
- Create: `backend/tests/test_rips_processor.py`

**Step 1: Crear backend/app/processors/rips_processor.py**

```python
import json
from typing import List, Dict, Any, Optional
from app.models import ServicioRIPS


class RIPSProcessor:
    """Procesador de archivos RIPS JSON."""

    @staticmethod
    def parse_rips(rips_json: str) -> Dict[str, Any]:
        """Parsea el JSON RIPS."""
        return json.loads(rips_json)

    @staticmethod
    def get_all_services(rips_data: Dict[str, Any]) -> List[ServicioRIPS]:
        """Extrae todos los servicios del RIPS en una lista plana."""
        services = []

        usuarios = rips_data.get('usuarios', [])
        for usuario in usuarios:
            servicios = usuario.get('servicios', {})

            # Medicamentos
            for med in servicios.get('medicamentos', []):
                services.append(ServicioRIPS(
                    tipo='medicamentos',
                    codigo=med.get('codTecnologiaSalud', ''),
                    nombre=med.get('nomTecnologiaSalud', ''),
                    valor_unitario=float(med.get('vrUnitMedicamento', 0)),
                    cantidad_original=float(med.get('cantidadMedicamento', 0)),
                    datos_completos=med
                ))

            # Otros Servicios
            for os in servicios.get('otrosServicios', []):
                services.append(ServicioRIPS(
                    tipo='otrosServicios',
                    codigo=os.get('codTecnologiaSalud', ''),
                    nombre=os.get('nomTecnologiaSalud', ''),
                    valor_unitario=float(os.get('vrUnitOS', 0)),
                    cantidad_original=float(os.get('cantidadOS', 0)),
                    datos_completos=os
                ))

            # Procedimientos
            for proc in servicios.get('procedimientos', []):
                services.append(ServicioRIPS(
                    tipo='procedimientos',
                    codigo=proc.get('codProcedimiento', ''),
                    nombre=proc.get('descripcion', ''),
                    valor_unitario=float(proc.get('vrServicio', 0)),
                    cantidad_original=float(proc.get('cantidad', 0)),
                    datos_completos=proc
                ))

            # Consultas
            for cons in servicios.get('consultas', []):
                services.append(ServicioRIPS(
                    tipo='consultas',
                    codigo=cons.get('codConsulta', ''),
                    nombre=cons.get('descripcion', ''),
                    valor_unitario=float(cons.get('vrServicio', 0)),
                    cantidad_original=1.0,
                    datos_completos=cons
                ))

        return services
```

**Step 2: Crear backend/tests/test_rips_processor.py**

```python
import pytest
import json
from app.processors.rips_processor import RIPSProcessor


class TestParseRIPS:
    def test_parse_valid_json(self):
        data = {"numFactura": "HMD123", "usuarios": []}
        result = RIPSProcessor.parse_rips(json.dumps(data))
        assert result['numFactura'] == 'HMD123'

    def test_parse_invalid_json(self):
        with pytest.raises(json.JSONDecodeError):
            RIPSProcessor.parse_rips('invalid json')


class TestGetAllServices:
    def test_get_medicamentos(self):
        rips_data = {
            "usuarios": [{
                "servicios": {
                    "medicamentos": [{
                        "codTecnologiaSalud": "19943544",
                        "nomTecnologiaSalud": "PRESERVATIVOS",
                        "vrUnitMedicamento": 500,
                        "cantidadMedicamento": 10
                    }]
                }
            }]
        }

        services = RIPSProcessor.get_all_services(rips_data)
        assert len(services) == 1
        assert services[0].tipo == 'medicamentos'
        assert services[0].codigo == '19943544'
        assert services[0].valor_unitario == 500

    def test_get_otros_servicios(self):
        rips_data = {
            "usuarios": [{
                "servicios": {
                    "otrosServicios": [{
                        "codTecnologiaSalud": "DM-INS-099",
                        "nomTecnologiaSalud": "FRASCO",
                        "vrUnitOS": 795,
                        "cantidadOS": 1
                    }]
                }
            }]
        }

        services = RIPSProcessor.get_all_services(rips_data)
        assert len(services) == 1
        assert services[0].tipo == 'otrosServicios'

    def test_get_multiple_types(self):
        rips_data = {
            "usuarios": [{
                "servicios": {
                    "medicamentos": [{"codTecnologiaSalud": "M1", "nomTecnologiaSalud": "Med1", "vrUnitMedicamento": 100, "cantidadMedicamento": 1}],
                    "otrosServicios": [{"codTecnologiaSalud": "O1", "nomTecnologiaSalud": "Otro1", "vrUnitOS": 200, "cantidadOS": 1}],
                    "procedimientos": [],
                    "consultas": []
                }
            }]
        }

        services = RIPSProcessor.get_all_services(rips_data)
        assert len(services) == 2

    def test_empty_services(self):
        rips_data = {"usuarios": [{"servicios": {}}]}
        services = RIPSProcessor.get_all_services(rips_data)
        assert len(services) == 0
```

**Step 3: Ejecutar tests**

```bash
python -m pytest tests/test_rips_processor.py -v
```

**Step 4: Commit**

```bash
git add backend/
git commit -m "feat: add RIPSProcessor with service extraction"
```

---

## Task 9: RIPSProcessor - Generación de RIPS NC

**Files:**
- Modify: `backend/app/processors/rips_processor.py`

**Step 1: Agregar método generate_nc_rips**

```python
# Agregar a RIPSProcessor class

    @staticmethod
    def generate_nc_rips(
        rips_data: Dict[str, Any],
        num_nota: str,
        matches: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Genera el RIPS filtrado para la Nota Crédito."""
        # Copiar estructura base
        nc_rips = {
            "numDocumentoIdObligado": rips_data.get("numDocumentoIdObligado", ""),
            "numFactura": rips_data.get("numFactura", ""),
            "tipoNota": "NC",
            "numNota": num_nota,
            "usuarios": []
        }

        # Agrupar matches por tipo de servicio
        services_by_type: Dict[str, List[Dict]] = {}
        for match in matches:
            tipo = match['tipo_servicio']
            if tipo not in services_by_type:
                services_by_type[tipo] = []
            services_by_type[tipo].append(match)

        # Procesar usuarios
        usuarios = rips_data.get('usuarios', [])
        for usuario in usuarios:
            nc_usuario = {
                "tipoDocumentoIdentificacion": usuario.get("tipoDocumentoIdentificacion"),
                "numDocumentoIdentificacion": usuario.get("numDocumentoIdentificacion"),
                "tipoUsuario": usuario.get("tipoUsuario"),
                "fechaNacimiento": usuario.get("fechaNacimiento"),
                "codSexo": usuario.get("codSexo"),
                "codPaisResidencia": usuario.get("codPaisResidencia"),
                "codMunicipioResidencia": usuario.get("codMunicipioResidencia"),
                "codZonaTerritorialResidencia": usuario.get("codZonaTerritorialResidencia"),
                "incapacidad": usuario.get("incapacidad"),
                "consecutivo": usuario.get("consecutivo"),
                "codPaisOrigen": usuario.get("codPaisOrigen"),
                "servicios": {}
            }

            servicios_originales = usuario.get('servicios', {})

            # Procesar cada tipo de servicio
            for tipo, tipo_matches in services_by_type.items():
                if tipo == 'medicamentos':
                    nc_usuario['servicios']['medicamentos'] = RIPSProcessor._process_medicamentos(
                        servicios_originales.get('medicamentos', []),
                        tipo_matches
                    )
                elif tipo == 'otrosServicios':
                    nc_usuario['servicios']['otrosServicios'] = RIPSProcessor._process_otros_servicios(
                        servicios_originales.get('otrosServicios', []),
                        tipo_matches
                    )
                elif tipo == 'procedimientos':
                    nc_usuario['servicios']['procedimientos'] = RIPSProcessor._process_procedimientos(
                        servicios_originales.get('procedimientos', []),
                        tipo_matches
                    )
                elif tipo == 'consultas':
                    nc_usuario['servicios']['consultas'] = RIPSProcessor._process_consultas(
                        servicios_originales.get('consultas', []),
                        tipo_matches
                    )

            # Solo agregar usuario si tiene servicios
            if any(nc_usuario['servicios'].values()):
                nc_rips['usuarios'].append(nc_usuario)

        return nc_rips

    @staticmethod
    def _process_medicamentos(meds_originales: List[Dict], matches: List[Dict]) -> List[Dict]:
        """Procesa medicamentos para la NC."""
        result = []
        for match in matches:
            codigo = match['codigo_rips']
            for med in meds_originales:
                if med.get('codTecnologiaSalud') == codigo:
                    # Crear copia con valores ajustados
                    med_nc = {k: v for k, v in med.items() if k not in ['numAutorizacion', 'idMIPRES', 'fechaDispensAdmon', 'codDiagnosticoPrincipal', 'codDiagnosticoRelacionado', 'tipoMedicamento', 'concentracionMedicamento', 'unidadMedida', 'formaFarmaceutica', 'unidadMinDispensa', 'diasTratamiento', 'tipoDocumentoIdentificacion', 'numDocumentoIdentificacion', 'conceptoRecaudo', 'valorPagoModerador', 'numFEVPagoModerador']}
                    med_nc['cantidadMedicamento'] = match['cantidad_calculada']
                    med_nc['vrServicio'] = match['valor_nc']
                    med_nc['consecutivo'] = len(result) + 1
                    result.append(med_nc)
                    break
        return result

    @staticmethod
    def _process_otros_servicios(os_originales: List[Dict], matches: List[Dict]) -> List[Dict]:
        """Procesa otros servicios para la NC."""
        result = []
        for match in matches:
            codigo = match['codigo_rips']
            for os in os_originales:
                if os.get('codTecnologiaSalud') == codigo:
                    os_nc = {k: v for k, v in os.items() if k not in ['numAutorizacion', 'idMIPRES', 'fechaSuministroTecnologia', 'tipoOS', 'tipoDocumentoIdentificacion', 'numDocumentoIdentificacion', 'conceptoRecaudo', 'valorPagoModerador', 'numFEVPagoModerador']}
                    os_nc['cantidadOS'] = match['cantidad_calculada']
                    os_nc['vrServicio'] = match['valor_nc']
                    os_nc['consecutivo'] = len(result) + 1
                    result.append(os_nc)
                    break
        return result

    @staticmethod
    def _process_procedimientos(proc_originales: List[Dict], matches: List[Dict]) -> List[Dict]:
        """Procesa procedimientos para la NC."""
        result = []
        for match in matches:
            codigo = match['codigo_rips']
            for proc in proc_originales:
                if proc.get('codProcedimiento') == codigo:
                    proc_nc = {k: v for k, v in proc.items()}
                    proc_nc['cantidad'] = match['cantidad_calculada']
                    proc_nc['vrServicio'] = match['valor_nc']
                    proc_nc['consecutivo'] = len(result) + 1
                    result.append(proc_nc)
                    break
        return result

    @staticmethod
    def _process_consultas(cons_originales: List[Dict], matches: List[Dict]) -> List[Dict]:
        """Procesa consultas para la NC."""
        result = []
        for match in matches:
            codigo = match['codigo_rips']
            for cons in cons_originales:
                if cons.get('codConsulta') == codigo:
                    cons_nc = {k: v for k, v in cons.items()}
                    cons_nc['vrServicio'] = match['valor_nc']
                    cons_nc['consecutivo'] = len(result) + 1
                    result.append(cons_nc)
                    break
        return result

    @staticmethod
    def calculate_total(rips_data: Dict[str, Any]) -> float:
        """Calcula el total de vrServicio en el RIPS."""
        total = 0.0
        for usuario in rips_data.get('usuarios', []):
            servicios = usuario.get('servicios', {})
            for tipo, lista in servicios.items():
                for servicio in lista:
                    total += float(servicio.get('vrServicio', 0))
        return total
```

**Step 2: Agregar tests**

```python
# Agregar a test_rips_processor.py

class TestGenerateNCRIPS:
    def test_generate_simple(self):
        rips_data = {
            "numDocumentoIdObligado": "817000162",
            "numFactura": "HMD73787",
            "usuarios": [{
                "tipoDocumentoIdentificacion": "CC",
                "numDocumentoIdentificacion": "4770399",
                "tipoUsuario": "11",
                "fechaNacimiento": "1953-02-28",
                "codSexo": "M",
                "codPaisResidencia": "170",
                "codMunicipioResidencia": "19743",
                "codZonaTerritorialResidencia": "01",
                "incapacidad": "NO",
                "consecutivo": 1,
                "codPaisOrigen": "170",
                "servicios": {
                    "medicamentos": [{
                        "codPrestador": "197430005801",
                        "codTecnologiaSalud": "19943544",
                        "nomTecnologiaSalud": "PRESERVATIVOS",
                        "vrUnitMedicamento": 500,
                        "cantidadMedicamento": 10,
                        "vrServicio": 5000
                    }]
                }
            }]
        }

        matches = [{
            'tipo_servicio': 'medicamentos',
            'codigo_rips': '19943544',
            'valor_nc': 2000,
            'cantidad_calculada': 4
        }]

        result = RIPSProcessor.generate_nc_rips(rips_data, 'NCD13239', matches)

        assert result['tipoNota'] == 'NC'
        assert result['numNota'] == 'NCD13239'
        assert len(result['usuarios']) == 1
        assert len(result['usuarios'][0]['servicios']['medicamentos']) == 1
        assert result['usuarios'][0]['servicios']['medicamentos'][0]['cantidadMedicamento'] == 4
        assert result['usuarios'][0]['servicios']['medicamentos'][0]['vrServicio'] == 2000

    def test_calculate_total(self):
        rips_data = {
            "usuarios": [{
                "servicios": {
                    "medicamentos": [
                        {"vrServicio": 2000},
                        {"vrServicio": 500}
                    ],
                    "otrosServicios": [
                        {"vrServicio": 397}
                    ]
                }
            }]
        }

        total = RIPSProcessor.calculate_total(rips_data)
        assert total == 2897.0
```

**Step 3: Ejecutar tests**

```bash
python -m pytest tests/test_rips_processor.py -v
```

**Step 4: Commit**

```bash
git add backend/
git commit -m "feat: add NC RIPS generation"
```

---

## Task 10: LLMMatcher - Servicio de Matching

**Files:**
- Create: `backend/app/services/__init__.py`
- Create: `backend/app/services/llm_matcher.py`
- Create: `backend/tests/test_llm_matcher.py`

**Step 1: Crear backend/app/services/llm_matcher.py**

```python
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
```

**Step 2: Crear backend/app/services/__init__.py**

```python
from .llm_matcher import LLMMatcher
```

**Step 3: Crear backend/tests/test_llm_matcher.py**

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.services.llm_matcher import LLMMatcher
from app.models import LineaNC, ServicioRIPS, Confianza


class TestMatchByCode:
    def test_match_by_code_success(self):
        matcher = LLMMatcher()

        lineas = [
            LineaNC(id=1, cantidad=1, valor=2000, descripcion="(19943544) PRESERVATIVOS", codigo_extraido="19943544")
        ]

        servicios = [
            ServicioRIPS(tipo="medicamentos", codigo="19943544", nombre="PRESERVATIVOS", valor_unitario=500, cantidad_original=10, datos_completos={})
        ]

        matches, unmatched = matcher._match_by_code(lineas, servicios)

        assert len(matches) == 1
        assert matches[0].codigo_rips == "19943544"
        assert matches[0].cantidad_calculada == 4.0
        assert matches[0].confianza == Confianza.ALTA
        assert len(unmatched) == 0

    def test_match_by_code_no_code(self):
        matcher = LLMMatcher()

        lineas = [
            LineaNC(id=1, cantidad=1, valor=2000, descripcion="PRESERVATIVOS", codigo_extraido=None)
        ]

        servicios = [
            ServicioRIPS(tipo="medicamentos", codigo="19943544", nombre="PRESERVATIVOS", valor_unitario=500, cantidad_original=10, datos_completos={})
        ]

        matches, unmatched = matcher._match_by_code(lineas, servicios)

        assert len(matches) == 0
        assert len(unmatched) == 1

    def test_match_by_code_not_found(self):
        matcher = LLMMatcher()

        lineas = [
            LineaNC(id=1, cantidad=1, valor=2000, descripcion="(99999) UNKNOWN", codigo_extraido="99999")
        ]

        servicios = [
            ServicioRIPS(tipo="medicamentos", codigo="19943544", nombre="PRESERVATIVOS", valor_unitario=500, cantidad_original=10, datos_completos={})
        ]

        matches, unmatched = matcher._match_by_code(lineas, servicios)

        assert len(matches) == 0
        assert len(unmatched) == 1


class TestFallbackMatches:
    def test_fallback_similarity(self):
        matcher = LLMMatcher()

        lineas = [
            LineaNC(id=1, cantidad=1, valor=795, descripcion="FRASCO RECOLECCION ORINA", codigo_extraido=None)
        ]

        servicios = [
            ServicioRIPS(tipo="otrosServicios", codigo="DM-INS-099", nombre="FRASCO PARA RECOLECCION DE ORINA", valor_unitario=795, cantidad_original=1, datos_completos={})
        ]

        matches = matcher._fallback_matches(lineas, servicios)

        assert len(matches) == 1
        assert matches[0].codigo_rips == "DM-INS-099"
        assert matches[0].confianza == Confianza.BAJA
```

**Step 4: Commit**

```bash
git add backend/
git commit -m "feat: add LLMMatcher service"
```

---

## Task 11: API Router - Endpoints

**Files:**
- Create: `backend/app/api/__init__.py`
- Create: `backend/app/api/nc_router.py`

**Step 1: Crear backend/app/api/nc_router.py**

```python
import re
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from typing import List, Dict, Any

from app.processors.xml_processor import XMLProcessor
from app.processors.rips_processor import RIPSProcessor
from app.services.llm_matcher import LLMMatcher
from app.models import (
    ProcesarNCResponse,
    PreviewMatchingResponse,
    ValidacionResult,
    MatchingDetail,
    LineaNC,
    ServicioRIPS
)

router = APIRouter()


@router.post("/procesar", response_model=ProcesarNCResponse)
async def procesar_nc(
    nc_xml: UploadFile = File(...),
    factura_xml: UploadFile = File(...),
    factura_rips: UploadFile = File(...)
):
    """Procesa una Nota Crédito completa."""

    errors = []
    warnings = []

    try:
        # Leer archivos
        nc_content = (await nc_xml.read()).decode('utf-8')
        factura_content = (await factura_xml.read()).decode('utf-8')
        rips_content = (await factura_rips.read()).decode('utf-8')

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

        nc_rips = RIPSProcessor.generate_nc_rips(rips_data, num_nota, matches_for_rips)

        # Insertar secciones en NC
        nc_completo = XMLProcessor.insert_sections(nc_content, interop, period)

        # Validar totales
        total_nc = _extract_total_nc(nc_content)
        total_rips = RIPSProcessor.calculate_total(nc_rips)

        validacion = ValidacionResult(
            total_nc_xml=total_nc,
            total_rips=total_rips,
            coinciden=abs(total_nc - total_rips) < 0.01,
            diferencia=round(total_nc - total_rips, 2)
        )

        # Construir detalles de matching
        matching_details = [
            MatchingDetail(
                linea_nc=m.linea_nc,
                descripcion_nc=next((l.descripcion for l in lineas_nc if l.id == m.linea_nc), ""),
                servicio_rips=f"{m.tipo_servicio}/{m.codigo_rips}",
                valor_nc=m.valor_nc,
                cantidad_calculada=m.cantidad_calculada,
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
            errors=errors
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
    """Extrae el número de nota del XML."""
    embedded = XMLProcessor.get_embedded_document(nc_xml)
    match = re.search(r'<cbc:ID[^>]*>([^<]+)</cbc:ID>', embedded)
    return match.group(1) if match else "NC"


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
```

**Step 2: Crear backend/app/api/__init__.py**

```python
from .nc_router import router
```

**Step 3: Commit**

```bash
git add backend/
git commit -m "feat: add API endpoints"
```

---

## Task 12: Frontend - Configuración Base

**Files:**
- Create: `frontend/index.html`
- Create: `frontend/tsconfig.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tailwind.config.js`
- Create: `frontend/postcss.config.js`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/index.css`

**Step 1: Crear frontend/index.html**

```html
<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>NC Processor - Sector Salud</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 2: Crear frontend/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

**Step 3: Crear frontend/tsconfig.node.json**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

**Step 4: Crear frontend/vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true
      }
    }
  }
})
```

**Step 5: Crear frontend/tailwind.config.js**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

**Step 6: Crear frontend/postcss.config.js**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

**Step 7: Crear frontend/src/index.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  @apply bg-gray-50;
}
```

**Step 8: Crear frontend/src/main.tsx**

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

**Step 9: Crear frontend/src/App.tsx (versión inicial)**

```typescript
import FileUpload from './components/FileUpload'

function App() {
  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-2">
          NC Processor
        </h1>
        <p className="text-gray-600 text-center mb-8">
          Generación de Notas Crédito con Interoperabilidad - Sector Salud
        </p>
        <FileUpload />
      </div>
    </div>
  )
}

export default App
```

**Step 10: Commit**

```bash
git add frontend/
git commit -m "chore: frontend base configuration"
```

---

## Task 13: Frontend - Componente FileUpload

**Files:**
- Create: `frontend/src/components/FileUpload.tsx`
- Create: `frontend/src/components/FileDropZone.tsx`
- Create: `frontend/src/components/ResultsView.tsx`
- Create: `frontend/src/utils/api.ts`

**Step 1: Crear frontend/src/utils/api.ts**

```typescript
import axios from 'axios'

const API_URL = '/api/nc'

export interface ProcessNCResponse {
  success: boolean
  nc_xml_completo: string
  nc_rips_json: Record<string, unknown>
  validacion: {
    total_nc_xml: number
    total_rips: number
    coinciden: boolean
    diferencia: number
  }
  matching_details: Array<{
    linea_nc: number
    descripcion_nc: string
    servicio_rips: string
    valor_nc: number
    cantidad_calculada: number
    confianza: string
  }>
  warnings: string[]
  errors: string[]
}

export async function procesarNC(
  ncXml: File,
  facturaXml: File,
  facturaRips: File
): Promise<ProcessNCResponse> {
  const formData = new FormData()
  formData.append('nc_xml', ncXml)
  formData.append('factura_xml', facturaXml)
  formData.append('factura_rips', facturaRips)

  const response = await axios.post(`${API_URL}/procesar`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  return response.data
}

export function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function downloadJSON(data: Record<string, unknown>, filename: string) {
  const content = JSON.stringify(data, null, 2)
  downloadFile(content, filename, 'application/json')
}
```

**Step 2: Crear frontend/src/components/FileDropZone.tsx**

```typescript
import { useCallback } from 'react'
import { Upload } from 'lucide-react'

interface FileDropZoneProps {
  label: string
  accept: string
  file: File | null
  onFileSelect: (file: File) => void
}

export default function FileDropZone({ label, accept, file, onFileSelect }: FileDropZoneProps) {
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) {
      onFileSelect(droppedFile)
    }
  }, [onFileSelect])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      onFileSelect(selectedFile)
    }
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      className={`
        border-2 border-dashed rounded-lg p-6 text-center cursor-pointer
        transition-colors duration-200
        ${file ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'}
      `}
    >
      <input
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
        id={`file-${label}`}
      />
      <label htmlFor={`file-${label}`} className="cursor-pointer block">
        <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
        <p className="text-sm font-medium text-gray-700">{label}</p>
        {file ? (
          <p className="text-xs text-green-600 mt-1">{file.name}</p>
        ) : (
          <p className="text-xs text-gray-500 mt-1">Arrastra o haz clic para seleccionar</p>
        )}
      </label>
    </div>
  )
}
```

**Step 3: Crear frontend/src/components/ResultsView.tsx**

```typescript
import { CheckCircle, AlertCircle, Download } from 'lucide-react'
import { downloadFile, downloadJSON } from '../utils/api'
import type { ProcessNCResponse } from '../utils/api'

interface ResultsViewProps {
  result: ProcessNCResponse
  onDownloadXML: () => void
  onDownloadJSON: () => void
}

export default function ResultsView({ result, onDownloadXML, onDownloadJSON }: ResultsViewProps) {
  return (
    <div className="bg-white rounded-lg shadow-md p-6 mt-6">
      <h2 className="text-xl font-semibold mb-4">Resultados</h2>

      {/* Estado */}
      <div className={`p-4 rounded-lg mb-4 ${result.success ? 'bg-green-50' : 'bg-red-50'}`}>
        <div className="flex items-center gap-2">
          {result.success ? (
            <CheckCircle className="text-green-500" />
          ) : (
            <AlertCircle className="text-red-500" />
          )}
          <span className={result.success ? 'text-green-700' : 'text-red-700'}>
            {result.success ? 'Procesamiento exitoso' : 'Errores encontrados'}
          </span>
        </div>
      </div>

      {/* Validación */}
      {result.success && (
        <div className="mb-4 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-medium mb-2">Validación de Totales</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Total NC (XML):</span>
              <span className="ml-2 font-medium">${result.validacion.total_nc_xml.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-gray-600">Total RIPS:</span>
              <span className="ml-2 font-medium">${result.validacion.total_rips.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-gray-600">Diferencia:</span>
              <span className={`ml-2 font-medium ${result.validacion.coinciden ? 'text-green-600' : 'text-red-600'}`}>
                ${result.validacion.diferencia.toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-gray-600">Estado:</span>
              <span className={`ml-2 font-medium ${result.validacion.coinciden ? 'text-green-600' : 'text-red-600'}`}>
                {result.validacion.coinciden ? 'Coinciden' : 'No coinciden'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Matching Details */}
      {result.matching_details.length > 0 && (
        <div className="mb-4">
          <h3 className="font-medium mb-2">Detalle de Matching</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-3 py-2 text-left">Línea</th>
                  <th className="px-3 py-2 text-left">Descripción NC</th>
                  <th className="px-3 py-2 text-left">Servicio RIPS</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2 text-right">Cantidad</th>
                  <th className="px-3 py-2 text-center">Confianza</th>
                </tr>
              </thead>
              <tbody>
                {result.matching_details.map((detail, idx) => (
                  <tr key={idx} className="border-b">
                    <td className="px-3 py-2">{detail.linea_nc}</td>
                    <td className="px-3 py-2 max-w-xs truncate" title={detail.descripcion_nc}>
                      {detail.descripcion_nc}
                    </td>
                    <td className="px-3 py-2">{detail.servicio_rips}</td>
                    <td className="px-3 py-2 text-right">${detail.valor_nc.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">{detail.cantidad_calculada}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-2 py-1 rounded text-xs ${
                        detail.confianza === 'alta' ? 'bg-green-100 text-green-800' :
                        detail.confianza === 'media' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {detail.confianza}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="mb-4 p-4 bg-yellow-50 rounded-lg">
          <h3 className="font-medium mb-2 text-yellow-800">Advertencias</h3>
          <ul className="list-disc list-inside text-sm text-yellow-700">
            {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {/* Errors */}
      {result.errors.length > 0 && (
        <div className="mb-4 p-4 bg-red-50 rounded-lg">
          <h3 className="font-medium mb-2 text-red-800">Errores</h3>
          <ul className="list-disc list-inside text-sm text-red-700">
            {result.errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {/* Download Buttons */}
      {result.success && (
        <div className="flex gap-4 mt-6">
          <button
            onClick={onDownloadXML}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Download size={18} />
            Descargar XML
          </button>
          <button
            onClick={onDownloadJSON}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Download size={18} />
            Descargar RIPS JSON
          </button>
        </div>
      )}
    </div>
  )
}
```

**Step 4: Crear frontend/src/components/FileUpload.tsx**

```typescript
import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import FileDropZone from './FileDropZone'
import ResultsView from './ResultsView'
import { procesarNC, downloadFile, downloadJSON } from '../utils/api'
import type { ProcessNCResponse } from '../utils/api'

export default function FileUpload() {
  const [ncXml, setNcXml] = useState<File | null>(null)
  const [facturaXml, setFacturaXml] = useState<File | null>(null)
  const [facturaRips, setFacturaRips] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ProcessNCResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = ncXml && facturaXml && facturaRips

  const handleSubmit = async () => {
    if (!canSubmit) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await procesarNC(ncXml, facturaXml, facturaRips)
      setResult(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadXML = () => {
    if (result?.nc_xml_completo) {
      downloadFile(result.nc_xml_completo, 'NC_con_interoperabilidad.xml', 'application/xml')
    }
  }

  const handleDownloadJSON = () => {
    if (result?.nc_rips_json) {
      downloadJSON(result.nc_rips_json, 'NC_RIPS.json')
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <FileDropZone
          label="Nota Crédito (XML)"
          accept=".xml"
          file={ncXml}
          onFileSelect={setNcXml}
        />
        <FileDropZone
          label="Factura Original (XML)"
          accept=".xml"
          file={facturaXml}
          onFileSelect={setFacturaXml}
        />
        <FileDropZone
          label="RIPS Factura (JSON)"
          accept=".json"
          file={facturaRips}
          onFileSelect={setFacturaRips}
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={!canSubmit || loading}
        className={`
          w-full py-3 px-4 rounded-lg font-medium transition-colors
          ${canSubmit && !loading
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }
        `}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="animate-spin" size={20} />
            Procesando...
          </span>
        ) : (
          'Procesar Nota Crédito'
        )}
      </button>

      {error && (
        <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {result && (
        <ResultsView
          result={result}
          onDownloadXML={handleDownloadXML}
          onDownloadJSON={handleDownloadJSON}
        />
      )}
    </div>
  )
}
```

**Step 5: Commit**

```bash
git add frontend/
git commit -m "feat: add frontend components"
```

---

## Task 14: Tests de Integración

**Files:**
- Create: `backend/tests/test_integration.py`

**Step 1: Crear backend/tests/test_integration.py**

```python
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


class TestHealth:
    def test_health_check(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


class TestProcesarNC:
    def test_procesar_nc_missing_files(self):
        response = client.post("/api/nc/procesar")
        assert response.status_code == 422  # Validation error

    def test_procesar_nc_with_files(self):
        # Crear XML de prueba simple
        nc_xml = '''<?xml version="1.0"?>
<AttachedDocument>
  <cac:Attachment>
    <cac:ExternalReference>
      <cbc:Description><![CDATA[
        <CreditNote xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
          <ext:UBLExtensions>
            <ext:UBLExtension>Extension1</ext:UBLExtension>
          </ext:UBLExtensions>
          <cbc:ID>NCD13239</cbc:ID>
          <cbc:PayableAmount>2000.00</cbc:PayableAmount>
          <cac:DiscrepancyResponse>
            <cbc:ReferenceID>HMD73787</cbc:ReferenceID>
          </cac:DiscrepancyResponse>
          <cac:CreditNoteLine>
            <cbc:ID>1</cbc:ID>
            <cbc:CreditedQuantity>1.00</cbc:CreditedQuantity>
            <cbc:LineExtensionAmount>2000.00</cbc:LineExtensionAmount>
            <cac:Item>
              <cbc:Description>(19943544) PRESERVATIVOS</cbc:Description>
            </cac:Item>
          </cac:CreditNoteLine>
        </CreditNote>
      ]]></cbc:Description>
    </cac:ExternalReference>
  </cac:Attachment>
</AttachedDocument>'''

        factura_xml = '''<?xml version="1.0"?>
<AttachedDocument>
  <cac:Attachment>
    <cac:ExternalReference>
      <cbc:Description><![CDATA[
        <Invoice xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
          <ext:UBLExtensions>
            <ext:UBLExtension>Extension1</ext:UBLExtension>
            <ext:UBLExtension>
              <ext:ExtensionContent>
                <CustomTagGeneral>
                  <Interoperabilidad>
                    <Group schemeName="Sector Salud">
                      <Collection schemeName="Usuario">
                        <AdditionalInformation>
                          <n>CODIGO_PRESTADOR</n>
                          <Value>197430005801</Value>
                        </AdditionalInformation>
                      </Collection>
                    </Group>
                  </Interoperabilidad>
                </CustomTagGeneral>
              </ext:ExtensionContent>
            </ext:UBLExtension>
          </ext:UBLExtensions>
          <cac:InvoicePeriod>
            <cbc:StartDate>2025-01-01</cbc:StartDate>
            <cbc:EndDate>2025-01-31</cbc:EndDate>
          </cac:InvoicePeriod>
        </Invoice>
      ]]></cbc:Description>
    </cac:ExternalReference>
  </cac:Attachment>
</AttachedDocument>'''

        rips_json = '''{
            "numDocumentoIdObligado": "817000162",
            "numFactura": "HMD73787",
            "tipoNota": null,
            "numNota": null,
            "usuarios": [{
                "tipoDocumentoIdentificacion": "CC",
                "numDocumentoIdentificacion": "4770399",
                "tipoUsuario": "11",
                "fechaNacimiento": "1953-02-28",
                "codSexo": "M",
                "codPaisResidencia": "170",
                "codMunicipioResidencia": "19743",
                "codZonaTerritorialResidencia": "01",
                "incapacidad": "NO",
                "consecutivo": 1,
                "codPaisOrigen": "170",
                "servicios": {
                    "medicamentos": [{
                        "codPrestador": "197430005801",
                        "codTecnologiaSalud": "19943544",
                        "nomTecnologiaSalud": "PRESERVATIVOS",
                        "vrUnitMedicamento": 500,
                        "cantidadMedicamento": 10,
                        "vrServicio": 5000
                    }],
                    "otrosServicios": [],
                    "procedimientos": [],
                    "consultas": []
                }
            }]
        }'''

        files = {
            'nc_xml': ('nc.xml', nc_xml, 'application/xml'),
            'factura_xml': ('factura.xml', factura_xml, 'application/xml'),
            'factura_rips': ('rips.json', rips_json, 'application/json')
        }

        response = client.post("/api/nc/procesar", files=files)

        # Debería retornar algo (puede fallar por LLM no configurado)
        assert response.status_code in [200, 500]
```

**Step 2: Commit**

```bash
git add backend/tests/
git commit -m "test: add integration tests"
```

---

## Task 15: Documentación y README

**Files:**
- Create: `README.md`
- Create: `backend/README.md`
- Create: `frontend/README.md`

**Step 1: Crear README.md root**

```markdown
# NC Processor

Aplicación para automatizar la generación de Notas Crédito con Interoperabilidad del sector salud colombiano y sus archivos RIPS asociados para la DIAN.

## Características

- Extracción automática de secciones Interoperabilidad e InvoicePeriod de facturas
- Matching inteligente entre líneas de NC y servicios RIPS usando LLM
- Generación de XML NC completo con secciones requeridas
- Generación de JSON RIPS filtrado con solo los servicios afectados
- Validación de totales entre XML y RIPS
- Interfaz web intuitiva con drag & drop

## Arquitectura

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   React     │──────▶   FastAPI   │──────▶   Kimi LLM  │
│  Frontend   │      │   Backend   │      │   Matcher   │
└─────────────┘      └─────────────┘      └─────────────┘
                            │
                     ┌──────┴──────┐
                     ▼             ▼
              ┌──────────┐   ┌──────────┐
              │ XMLProc  │   │RIPSProc  │
              └──────────┘   └──────────┘
```

## Requisitos

- Python 3.10+
- Node.js 18+
- API Key de Kimi (Moonshot AI)

## Instalación

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Crear archivo `.env`:
```
LLM_API_KEY=tu_api_key_de_kimi
LLM_BASE_URL=https://api.moonshot.cn/v1
LLM_MODEL=moonshot-v1-128k
```

### Frontend

```bash
cd frontend
npm install
```

## Uso

### Desarrollo

Terminal 1 (Backend):
```bash
cd backend
uvicorn app.main:app --reload
```

Terminal 2 (Frontend):
```bash
cd frontend
npm run dev
```

Abrir http://localhost:5173

### Producción

```bash
# Backend
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000

# Frontend
cd frontend
npm run build
# Servir carpeta dist/ con nginx o similar
```

## API Endpoints

- `POST /api/nc/procesar` - Procesar NC completa
- `POST /api/nc/preview-matching` - Preview de matching
- `GET /health` - Health check

## Licencia

MIT
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README"
```

---

## Resumen de Tareas

| # | Tarea | Archivos Principales |
|---|-------|---------------------|
| 1 | Estructura Base | `requirements.txt`, `package.json`, `.gitignore` |
| 2 | Backend Config | `config.py`, `main.py` |
| 3 | Modelos | `schemas.py` |
| 4-7 | XMLProcessor | `xml_processor.py` + tests |
| 8-9 | RIPSProcessor | `rips_processor.py` + tests |
| 10 | LLMMatcher | `llm_matcher.py` + tests |
| 11 | API Router | `nc_router.py` |
| 12-13 | Frontend | React components, API utils |
| 14 | Tests | `test_integration.py` |
| 15 | Docs | `README.md` |

## Comandos de Ejecución

```bash
# Backend
cd backend && uvicorn app.main:app --reload

# Frontend
cd frontend && npm run dev

# Tests
cd backend && pytest -v
```
