# NC Processor - Especificación Técnica Completa

## 1. Contexto del Problema

### 1.1 Descripción General
En Colombia, las Notas Crédito del sector salud que se envían a la DIAN requieren una sección especial llamada **Interoperabilidad** (Sector Salud) que contiene información regulatoria del Ministerio de Salud (Resolución 2275:2023). 

El problema es que muchos sistemas de facturación generan las Notas Crédito **sin** esta sección, lo que causa rechazo por parte de la DIAN.

Adicionalmente, cada Nota Crédito debe ir acompañada de un archivo **RIPS** (Registro Individual de Prestación de Servicios) en formato JSON que debe contener **únicamente** los servicios afectados por la NC, no todos los de la factura original.

### 1.2 Proceso Manual Actual
1. Obtener XML de la factura original (HMD*.xml o PMD*.xml)
2. Obtener JSON RIPS de la factura original
3. Extraer manualmente la sección `<Interoperabilidad>` de la factura
4. Extraer manualmente la sección `<cac:InvoicePeriod>` de la factura
5. Insertar ambas secciones en el XML de la Nota Crédito
6. Identificar qué servicios del RIPS corresponden a las líneas de la NC
7. Crear un nuevo JSON RIPS con solo esos servicios y valores ajustados
8. Validar que los totales coincidan
9. Enviar a la DIAN

### 1.3 Objetivo del Sistema
Automatizar completamente los pasos 3-8, recibiendo los archivos de entrada y generando los archivos de salida listos para enviar a la DIAN.

---

## 2. Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                     FRONTEND (React/HTML)                        │
│  - Upload de 3 archivos (drag & drop)                           │
│  - Visualización de resultados                                   │
│  - Descarga de archivos procesados                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ POST /api/nc/procesar
                              │ multipart/form-data
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     BACKEND (FastAPI)                            │
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │  XMLProcessor   │  │  RIPSProcessor  │  │   LLMMatcher    │ │
│  │                 │  │                 │  │                 │ │
│  │ - Extraer CDATA │  │ - Parsear JSON  │  │ - Matching      │ │
│  │ - Extraer       │  │ - Listar        │  │   inteligente   │ │
│  │   secciones     │  │   servicios     │  │ - Cálculo de    │ │
│  │ - Insertar      │  │ - Generar RIPS  │  │   cantidades    │ │
│  │   secciones     │  │   filtrado      │  │                 │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│                              │                                   │
│                              ▼                                   │
│                     ┌─────────────────┐                         │
│                     │   LLM (Kimi/    │                         │
│                     │   OpenAI/Claude)│                         │
│                     └─────────────────┘                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  OUTPUTS:                                                        │
│  - NC_con_interoperabilidad.xml                                 │
│  - NC_RIPS.json                                                 │
│  - Reporte de validación                                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Estructura de Archivos de Entrada

### 3.1 XML de Nota Crédito (NC)

La NC viene envuelta en un `AttachedDocument` con el `CreditNote` real dentro de un CDATA:

```xml
<?xml version="1.0" encoding="utf-8"?>
<AttachedDocument xmlns="urn:oasis:names:specification:ubl:schema:xsd:AttachedDocument-2" ...>
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent>
        <!-- Firma digital del AttachedDocument -->
      </ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  
  <!-- Metadatos del contenedor -->
  <cbc:UBLVersionID>UBL 2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>Documentos adjuntos</cbc:CustomizationID>
  <cbc:ParentDocumentID>NCD13239</cbc:ParentDocumentID>
  
  <cac:Attachment>
    <cac:ExternalReference>
      <cbc:Description><![CDATA[
        <?xml version="1.0" encoding="utf-8"?>
        <CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2" ...>
          <!-- AQUÍ ESTÁ EL CREDITNOTE REAL - ESTE ES EL QUE DEBEMOS MODIFICAR -->
          <ext:UBLExtensions>
            <ext:UBLExtension>
              <!-- 1. DianExtensions -->
            </ext:UBLExtension>
            <ext:UBLExtension>
              <!-- 2. Firma digital -->
            </ext:UBLExtension>
            <!-- FALTA: 3. CustomTagGeneral con Interoperabilidad -->
          </ext:UBLExtensions>
          
          <cbc:ID>NCD13239</cbc:ID>
          <cbc:IssueDate>2026-01-23</cbc:IssueDate>
          
          <cac:DiscrepancyResponse>
            <cbc:ReferenceID>HMD73787</cbc:ReferenceID>
            <cbc:ResponseCode>4</cbc:ResponseCode>
          </cac:DiscrepancyResponse>
          <!-- FALTA: cac:InvoicePeriod AQUÍ -->
          
          <cac:BillingReference>...</cac:BillingReference>
          
          <!-- Líneas de la NC -->
          <cac:CreditNoteLine>
            <cbc:ID>1</cbc:ID>
            <cbc:CreditedQuantity unitCode="EA">1.00</cbc:CreditedQuantity>
            <cbc:LineExtensionAmount currencyID="COP">2000.0000</cbc:LineExtensionAmount>
            <cac:Item>
              <cbc:Description>00037492 (19943544) PRESERVATIVOS CJA UND</cbc:Description>
            </cac:Item>
          </cac:CreditNoteLine>
          
        </CreditNote>
      ]]></cbc:Description>
    </cac:ExternalReference>
  </cac:Attachment>
</AttachedDocument>
```

**IMPORTANTE:** Las modificaciones deben hacerse DENTRO del CDATA, en el CreditNote embebido, NO en el AttachedDocument exterior.

### 3.2 XML de Factura Original (FEV)

Misma estructura (AttachedDocument con Invoice en CDATA), pero YA TIENE las secciones que necesitamos:

```xml
<!-- Dentro del CDATA, en el Invoice embebido -->
<Invoice>
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <!-- DianExtensions -->
    </ext:UBLExtension>
    <ext:UBLExtension>
      <!-- Firma -->
    </ext:UBLExtension>
    <ext:UBLExtension>
      <ext:ExtensionContent>
        <CustomTagGeneral>
          <n>Responsable</n>
          <n>Tipo, identificador:año del acto administrativo</n>
          <Value>url www.minsalud.gov.co</Value>
          <Value>Resolución 2275:2023</Value>
          <Interoperabilidad>
            <Group schemeName="Sector Salud">
              <Collection schemeName="Usuario">
                <AdditionalInformation>
                  <n>CODIGO_PRESTADOR</n>
                  <Value>197430005801</Value>
                </AdditionalInformation>
                <AdditionalInformation>
                  <n>MODALIDAD_PAGO</n>
                  <Value schemeID="04" schemeName="salud_modalidad_pago.gc">Pago por evento</Value>
                </AdditionalInformation>
                <AdditionalInformation>
                  <n>COBERTURA_PLAN_BENEFICIOS</n>
                  <Value schemeID="01" schemeName="salud_cobertura.gc">Plan complementario en salud</Value>
                </AdditionalInformation>
                <AdditionalInformation>
                  <n>NUMERO_CONTRATO</n>
                  <Value>20251900120824</Value>
                </AdditionalInformation>
                <AdditionalInformation>
                  <n>COPAGO</n>
                  <Value>0,00</Value>
                </AdditionalInformation>
                <AdditionalInformation>
                  <n>CUOTA_MODERADORA</n>
                  <Value>0,00</Value>
                </AdditionalInformation>
              </Collection>
            </Group>
          </Interoperabilidad>
        </CustomTagGeneral>
      </ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  
  <!-- También tiene InvoicePeriod -->
  <cac:InvoicePeriod>
    <cbc:StartDate>2025-11-13</cbc:StartDate>
    <cbc:StartTime>00:00:01-05:00</cbc:StartTime>
    <cbc:EndDate>2025-11-13</cbc:EndDate>
    <cbc:EndTime>23:59:59-05:00</cbc:EndTime>
  </cac:InvoicePeriod>
</Invoice>
```

### 3.3 JSON RIPS de la Factura

```json
{
  "numDocumentoIdObligado": "817000162",
  "numFactura": "HMD73787",
  "tipoNota": null,
  "numNota": null,
  "usuarios": [
    {
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
        "medicamentos": [
          {
            "codPrestador": "197430005801",
            "numAutorizacion": "",
            "idMIPRES": "",
            "fechaDispensAdmon": "2025-11-13 22:56",
            "codDiagnosticoPrincipal": "K429",
            "codDiagnosticoRelacionado": null,
            "tipoMedicamento": "01",
            "codTecnologiaSalud": "19943544",
            "nomTecnologiaSalud": "PRESERVATIVOS CJA UND",
            "concentracionMedicamento": 0,
            "unidadMedida": 0,
            "formaFarmaceutica": null,
            "unidadMinDispensa": 1,
            "cantidadMedicamento": 10,
            "diasTratamiento": 365,
            "tipoDocumentoIdentificacion": "CC",
            "numDocumentoIdentificacion": "4770399",
            "vrUnitMedicamento": 500,
            "vrServicio": 5000,
            "conceptoRecaudo": "05",
            "valorPagoModerador": 0,
            "numFEVPagoModerador": "HMD73787",
            "consecutivo": 1
          }
        ],
        "otrosServicios": [
          {
            "codPrestador": "197430005801",
            "numAutorizacion": "",
            "idMIPRES": null,
            "fechaSuministroTecnologia": "2025-11-13 22:56",
            "tipoOS": "01",
            "codTecnologiaSalud": "DM-INS-099",
            "nomTecnologiaSalud": "FRASCO PARA RECOLECCION DE ORINA",
            "cantidadOS": 1,
            "tipoDocumentoIdentificacion": "CC",
            "numDocumentoIdentificacion": "4770399",
            "vrUnitOS": 795,
            "vrServicio": 795,
            "conceptoRecaudo": "05",
            "valorPagoModerador": 0,
            "numFEVPagoModerador": "HMD73787",
            "consecutivo": 1
          }
        ],
        "procedimientos": [],
        "consultas": []
      }
    }
  ]
}
```

**Tipos de servicios posibles en RIPS:**
- `medicamentos` - campos clave: `codTecnologiaSalud`, `cantidadMedicamento`, `vrUnitMedicamento`, `vrServicio`
- `otrosServicios` - campos clave: `codTecnologiaSalud`, `cantidadOS`, `vrUnitOS`, `vrServicio`
- `procedimientos` - campos clave: `codProcedimiento`, `cantidad`, `vrServicio`
- `consultas` - campos clave: `codConsulta`, `vrServicio`
- `urgencias`
- `hospitalizacion`
- `recienNacidos`

---

## 4. Estructura de Archivos de Salida

### 4.1 XML de NC Completo

El CreditNote embebido debe quedar con:

```xml
<CreditNote>
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <!-- 1. DianExtensions (ya existe) -->
    </ext:UBLExtension>
    <ext:UBLExtension>
      <!-- 2. Firma (ya existe) -->
    </ext:UBLExtension>
    <ext:UBLExtension>
      <!-- 3. NUEVO: CustomTagGeneral con Interoperabilidad -->
      <ext:ExtensionContent>
        <CustomTagGeneral>
          <!-- Copiado de la factura original -->
        </CustomTagGeneral>
      </ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  
  ...
  
  <cac:DiscrepancyResponse>...</cac:DiscrepancyResponse>
  
  <!-- NUEVO: InvoicePeriod (copiado de la factura) -->
  <cac:InvoicePeriod>
    <cbc:StartDate>2025-11-13</cbc:StartDate>
    <cbc:StartTime>00:00:01-05:00</cbc:StartTime>
    <cbc:EndDate>2025-11-13</cbc:EndDate>
    <cbc:EndTime>23:59:59-05:00</cbc:EndTime>
  </cac:InvoicePeriod>
  
  <cac:BillingReference>...</cac:BillingReference>
  ...
</CreditNote>
```

### 4.2 JSON RIPS de la NC

Solo los servicios afectados, con valores ajustados:

```json
{
  "numDocumentoIdObligado": "817000162",
  "numFactura": "HMD73787",
  "tipoNota": "NC",
  "numNota": "NCD13239",
  "usuarios": [
    {
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
        "medicamentos": [
          {
            "codPrestador": "197430005801",
            "codTecnologiaSalud": "19943544",
            "nomTecnologiaSalud": "PRESERVATIVOS CJA UND",
            "cantidadMedicamento": 4,
            "vrUnitMedicamento": 500,
            "vrServicio": 2000,
            "consecutivo": 1
          }
        ],
        "otrosServicios": [
          {
            "codPrestador": "197430005801",
            "codTecnologiaSalud": "DM-INS-099",
            "nomTecnologiaSalud": "FRASCO PARA RECOLECCION DE ORINA",
            "cantidadOS": 1,
            "vrUnitOS": 397,
            "vrServicio": 397,
            "consecutivo": 1
          }
        ]
      }
    }
  ]
}
```

**Regla crítica:** La suma de todos los `vrServicio` en el RIPS debe ser EXACTAMENTE igual al `PayableAmount` del XML de la NC.

---

## 5. Lógica de Matching (Problema Principal)

### 5.1 El Desafío

Las líneas de la NC tienen descripciones como:
```
"00037492 (19943544) PRESERVATIVOS CJA UND"
```

Y el RIPS tiene:
```json
{
  "codTecnologiaSalud": "19943544",
  "nomTecnologiaSalud": "PRESERVATIVOS CJA UND"
}
```

El código está entre paréntesis en la descripción de la NC, pero no siempre. A veces solo está el nombre.

### 5.2 Estrategia de Matching

1. **Extraer código de la descripción:** Buscar patrón `(CODIGO)` en la descripción
2. **Buscar por código:** Si se encontró código, buscar servicio en RIPS con ese código
3. **Buscar por nombre:** Si no hay código, usar similitud de texto
4. **Calcular cantidad:** `cantidad = valor_nc / valor_unitario_rips`

### 5.3 Prompt para LLM (Matching Inteligente)

```
SYSTEM:
Eres un experto en facturación electrónica del sector salud colombiano.
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

RESPONDE SOLO JSON:
{
  "matches": [
    {
      "linea_nc": 1,
      "tipo_servicio": "medicamentos",
      "codigo_rips": "19943544",
      "valor_nc": 2000,
      "valor_unitario_rips": 500,
      "cantidad_calculada": 4,
      "confianza": "alta"
    }
  ],
  "warnings": []
}

USER:
LÍNEAS DE LA NOTA CRÉDITO:
Línea 1:
  - Descripción: 00037492 (19943544) PRESERVATIVOS CJA UND
  - Cantidad en NC: 1.00
  - Valor: $2,000.00

Línea 2:
  - Descripción: 0009018 (DM-INS-099) FRASCO PARA RECOLECCION DE ORINA
  - Cantidad en NC: 1.00
  - Valor: $397.00

SERVICIOS EN RIPS:
- Tipo: medicamentos
  Código: 19943544
  Nombre: PRESERVATIVOS CJA UND
  Valor unitario: $500.00
  
- Tipo: otrosServicios
  Código: DM-INS-099
  Nombre: FRASCO PARA RECOLECCION DE ORINA
  Valor unitario: $795.00

Realiza el matching.
```

---

## 6. Especificación de Endpoints API

### 6.1 POST /api/nc/procesar

**Request:** `multipart/form-data`
- `nc_xml`: File - XML de la Nota Crédito base
- `factura_xml`: File - XML de la Factura original
- `factura_rips`: File - JSON RIPS de la Factura

**Response:**
```json
{
  "success": true,
  "nc_xml_completo": "<?xml version=\"1.0\"...",
  "nc_rips_json": {
    "numDocumentoIdObligado": "817000162",
    "numFactura": "HMD73787",
    "tipoNota": "NC",
    "numNota": "NCD13239",
    "usuarios": [...]
  },
  "validacion": {
    "total_nc_xml": 2399.00,
    "total_rips": 2399.00,
    "coinciden": true,
    "diferencia": 0
  },
  "matching_details": [
    {
      "linea_nc": 1,
      "descripcion_nc": "00037492 (19943544) PRESERVATIVOS",
      "servicio_rips": "medicamentos/19943544",
      "valor_nc": 2000,
      "cantidad_calculada": 4,
      "confianza": "alta"
    }
  ],
  "warnings": [],
  "errors": []
}
```

### 6.2 POST /api/nc/preview-matching

Preview del matching sin generar archivos (para validación manual).

**Request:** `multipart/form-data`
- `nc_xml`: File
- `factura_rips`: File

**Response:**
```json
{
  "lineas_nc": [
    {"id": 1, "descripcion": "...", "valor": 2000, "codigo_extraido": "19943544"}
  ],
  "servicios_rips": [
    {"tipo": "medicamentos", "codigo": "19943544", "nombre": "...", "valor_unitario": 500}
  ],
  "matching_sugerido": [
    {"linea_nc": 1, "servicio": "medicamentos/19943544", "confianza": "alta"}
  ]
}
```

---

## 7. Algoritmos Clave

### 7.1 Extracción de CDATA

```python
import re

def extract_cdata(xml_content: str) -> str | None:
    """Extrae el contenido del CDATA (documento embebido)"""
    match = re.search(r'<!\[CDATA\[(.*?)\]\]>', xml_content, re.DOTALL)
    return match.group(1) if match else None
```

### 7.2 Extracción de Sección Interoperabilidad

```python
def extract_interoperabilidad(factura_xml: str) -> str | None:
    """Extrae UBLExtension completo con CustomTagGeneral"""
    embedded = extract_cdata(factura_xml) or factura_xml
    
    pattern = r'(<ext:UBLExtension>\s*<ext:ExtensionContent>\s*<CustomTagGeneral>.*?</CustomTagGeneral>\s*</ext:ExtensionContent>\s*</ext:UBLExtension>)'
    match = re.search(pattern, embedded, re.DOTALL)
    return match.group(1) if match else None
```

### 7.3 Extracción de InvoicePeriod

```python
def extract_invoice_period(factura_xml: str) -> str | None:
    embedded = extract_cdata(factura_xml) or factura_xml
    
    pattern = r'(<cac:InvoicePeriod>.*?</cac:InvoicePeriod>)'
    match = re.search(pattern, embedded, re.DOTALL)
    return match.group(1) if match else None
```

### 7.4 Inserción en NC

```python
def insert_sections(nc_xml: str, interop: str, period: str) -> str:
    # Extraer CDATA
    cdata_match = re.search(r'(<!\[CDATA\[)(.*?)(\]\]>)', nc_xml, re.DOTALL)
    
    if cdata_match:
        prefix, creditnote, suffix = cdata_match.groups()
        
        # Insertar Interoperabilidad (después del último UBLExtension)
        close_extensions = creditnote.find('</ext:UBLExtensions>')
        last_ext = creditnote.rfind('</ext:UBLExtension>', 0, close_extensions)
        insert_pos = last_ext + len('</ext:UBLExtension>')
        creditnote = creditnote[:insert_pos] + '\n    ' + interop + creditnote[insert_pos:]
        
        # Insertar InvoicePeriod (después de DiscrepancyResponse)
        discrepancy_end = creditnote.find('</cac:DiscrepancyResponse>')
        insert_pos = discrepancy_end + len('</cac:DiscrepancyResponse>')
        creditnote = creditnote[:insert_pos] + '\n  ' + period + creditnote[insert_pos:]
        
        # Reconstruir
        new_cdata = prefix + creditnote + suffix
        return nc_xml[:cdata_match.start()] + new_cdata + nc_xml[cdata_match.end():]
    
    return nc_xml
```

### 7.5 Extracción de Líneas de NC

```python
def extract_nc_lines(nc_xml: str) -> list[dict]:
    embedded = extract_cdata(nc_xml) or nc_xml
    lines = []
    
    for match in re.finditer(r'<cac:CreditNoteLine>(.*?)</cac:CreditNoteLine>', embedded, re.DOTALL):
        line_content = match.group(1)
        
        line = {}
        
        # ID
        id_match = re.search(r'<cbc:ID>(\d+)</cbc:ID>', line_content)
        if id_match:
            line['id'] = int(id_match.group(1))
        
        # Cantidad
        qty_match = re.search(r'<cbc:CreditedQuantity[^>]*>([^<]+)</cbc:CreditedQuantity>', line_content)
        if qty_match:
            line['cantidad'] = float(qty_match.group(1))
        
        # Valor
        amount_match = re.search(r'<cbc:LineExtensionAmount[^>]*>([^<]+)</cbc:LineExtensionAmount>', line_content)
        if amount_match:
            line['valor'] = float(amount_match.group(1))
        
        # Descripción
        desc_match = re.search(r'<cbc:Description>([^<]+)</cbc:Description>', line_content)
        if desc_match:
            line['descripcion'] = desc_match.group(1)
            # Extraer código entre paréntesis
            code_match = re.search(r'\(([^)]+)\)', desc_match.group(1))
            if code_match:
                line['codigo_extraido'] = code_match.group(1)
        
        lines.append(line)
    
    return lines
```

---

## 8. Stack Tecnológico Recomendado

### Backend
- **Framework:** FastAPI (Python 3.10+)
- **Servidor:** Uvicorn
- **LLM Client:** OpenAI SDK (compatible con Kimi, Claude, etc.)
- **Validación:** Pydantic v2

### Frontend
- **Framework:** React 18+ con Vite (o HTML simple con TailwindCSS)
- **HTTP Client:** Fetch API o Axios
- **UI:** TailwindCSS + shadcn/ui

### LLM Options
- **Kimi k2.5:** `https://api.moonshot.cn/v1` - modelo `moonshot-v1-128k`
- **OpenAI:** `https://api.openai.com/v1` - modelo `gpt-4o-mini`
- **Claude:** `https://api.anthropic.com/v1` - modelo `claude-3-haiku`
- **Azure OpenAI:** endpoint personalizado

---

## 9. Variables de Entorno

```env
# LLM Configuration
LLM_API_KEY=your_api_key
LLM_BASE_URL=https://api.moonshot.cn/v1
LLM_MODEL=moonshot-v1-128k

# Server
HOST=0.0.0.0
PORT=8000
DEBUG=true

# CORS
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

---

## 10. Casos de Prueba

### Caso 1: NC Parcial de Medicamentos
- Factura: 10 unidades de medicamento X a $500 c/u = $5,000
- NC: Ajuste de 4 unidades = $2,000
- RIPS NC esperado: 4 unidades, vrServicio = $2,000

### Caso 2: NC Parcial de Otros Servicios (valor ajustado)
- Factura: 1 frasco a $795
- NC: Ajuste parcial = $397
- RIPS NC esperado: 1 unidad, vrUnitOS = $397, vrServicio = $397

### Caso 3: NC Múltiples Líneas
- Factura: medicamentos + otros servicios
- NC: Afecta algunos de cada tipo
- RIPS NC: Solo los afectados, totales deben coincidir

---

## 11. Errores Comunes de la DIAN

| Código | Descripción | Causa | Solución |
|--------|-------------|-------|----------|
| VCN019/VCN020 | Falta InvoicePeriod | NC sin período | Agregar InvoicePeriod de la factura |
| GI019 | Valor no corresponde a factura | COBERTURA_PLAN_BENEFICIOS diferente | Usar mismo schemeID que factura en DIAN |
| RVG02 | Valor RIPS no coincide | Total RIPS ≠ Total NC | Verificar suma de vrServicio |
| - | Sector Salud no existe | Interoperabilidad en lugar incorrecto | Insertar en CreditNote embebido, no en AttachedDocument |

---

## 12. Checklist de Implementación

- [ ] Endpoint POST /api/nc/procesar
- [ ] Endpoint POST /api/nc/preview-matching
- [ ] XMLProcessor.extract_cdata()
- [ ] XMLProcessor.extract_interoperabilidad()
- [ ] XMLProcessor.extract_invoice_period()
- [ ] XMLProcessor.extract_nc_lines()
- [ ] XMLProcessor.insert_sections()
- [ ] RIPSProcessor.parse_rips()
- [ ] RIPSProcessor.get_all_services()
- [ ] RIPSProcessor.generate_nc_rips()
- [ ] RIPSProcessor.calculate_total()
- [ ] LLMMatcher.match_services()
- [ ] LLMMatcher fallback por reglas
- [ ] Frontend: Upload de 3 archivos
- [ ] Frontend: Mostrar resultados
- [ ] Frontend: Descargar archivos
- [ ] Validación de totales
- [ ] Manejo de errores
- [ ] Tests unitarios

---

## 13. Ejemplo Completo de Flujo

**Input:**
1. `NCD13239.XML` - NC base sin interoperabilidad
2. `HMD73787.xml` - Factura con interoperabilidad
3. `HMD73787.json` - RIPS con 3 medicamentos y 2 otros servicios

**Proceso:**
1. Extraer líneas NC: 3 líneas, total $2,399
2. Extraer Interoperabilidad de factura: sección completa
3. Extraer InvoicePeriod de factura: 2025-11-13
4. Matching LLM:
   - Línea 1 ($2,000) → medicamentos/19943544 (4 unidades x $500)
   - Línea 2 ($397) → otrosServicios/DM-INS-099
   - Línea 3 ($2) → otrosServicios/DM-INS-101
5. Generar RIPS NC con 3 servicios
6. Validar: $2,000 + $397 + $2 = $2,399 ✓

**Output:**
1. `NCD13239_completo.xml` - NC con Interoperabilidad e InvoicePeriod
2. `NCD13239_RIPS.json` - RIPS filtrado con 3 servicios
