# Deteccion Automatica de Valores Iguales (Valores a 0) - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Detect when NC XML and RIPS values match item-by-item (pre-processing) and automatically set both to 0, plus add pre-processing preview with JSON/XML explorers to the upload screen.

**Architecture:** After LLM matching, compare each matched pair's original values. If equal, zero out that item in both XML and RIPS output. Add a lightweight preview endpoint (no LLM) for the upload screen. Batch processing applies this only to non-LDL folders.

**Tech Stack:** Python FastAPI backend, React TypeScript frontend, regex-based XML processing, Pydantic models.

---

### Task 1: Add new schema models for pre-processing values and zero-equalized items

**Files:**
- Modify: `backend/app/models/schemas.py`
- Modify: `backend/app/models/__init__.py`

**Step 1: Add new models to schemas.py**

Add these models at the end of `backend/app/models/schemas.py` (before the existing validation/login schemas section starting at line 78):

```python
class ItemIgualadoCero(BaseModel):
    linea_nc: int
    codigo_rips: str
    tipo_servicio: str
    valor_original: float


class ValoresPreProcesamiento(BaseModel):
    total_nc_xml: float
    total_rips: float


class PreviewValuesResponse(BaseModel):
    valores_nc_xml: float
    valores_rips: float
    nc_xml_cdata: str  # CDATA content for XML preview
    rips_json: Dict[str, Any]  # Parsed RIPS for JSON preview
```

**Step 2: Update ProcesarNCResponse to include new fields**

In `backend/app/models/schemas.py`, modify `ProcesarNCResponse` (line 61-69) to add:

```python
class ProcesarNCResponse(BaseModel):
    success: bool
    nc_xml_completo: str
    nc_rips_json: Dict[str, Any]
    validacion: ValidacionResult
    matching_details: List[MatchingDetail]
    warnings: List[str]
    errors: List[str]
    numero_nota_credito: Optional[str] = None
    valores_pre_procesamiento: Optional[ValoresPreProcesamiento] = None
    items_igualados_a_cero: List[ItemIgualadoCero] = []
```

**Step 3: Export new models from `__init__.py`**

Add to `backend/app/models/__init__.py`:

```python
from .schemas import (
    # ... existing imports ...
    ItemIgualadoCero,
    ValoresPreProcesamiento,
    PreviewValuesResponse,
)
```

**Step 4: Commit**

```bash
git add backend/app/models/schemas.py backend/app/models/__init__.py
git commit -m "feat: add schema models for zero-equalization and pre-processing preview"
```

---

### Task 2: Add per-line zero-equalization method to XMLProcessor

**Files:**
- Modify: `backend/app/processors/xml_processor.py`

**Step 1: Add `aplicar_valores_cero_por_linea` method**

Add this static method to `XMLProcessor` class in `xml_processor.py` after the existing `aplicar_caso_colesterol` method (after line 202):

```python
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
```

**Step 2: Add the `List` import if not present**

Verify that `from typing import Optional, List, Dict` is at the top (line 2 already has `List`). Good.

**Step 3: Commit**

```bash
git add backend/app/processors/xml_processor.py
git commit -m "feat: add per-line zero-equalization for XML processor"
```

---

### Task 3: Add zero-equalization support to RIPSProcessor

**Files:**
- Modify: `backend/app/processors/rips_processor.py`

**Step 1: Modify `generate_nc_rips` to accept items to zero-equalize**

Update the `generate_nc_rips` method signature and body in `rips_processor.py` (line 70-142):

```python
@staticmethod
def generate_nc_rips(
    rips_data: Dict[str, Any],
    num_nota: str,
    matches: List[Dict[str, Any]],
    es_caso_colesterol: bool = False,
    codigos_igualados_a_cero: Optional[set] = None
) -> Dict[str, Any]:
```

The `codigos_igualados_a_cero` is a set of `codigo_rips` strings that should be zeroed. Pass it through to each `_process_*` method.

**Step 2: Update each `_process_*` method to handle zero-equalization**

Modify `_process_medicamentos` (line 145-162):

```python
@staticmethod
def _process_medicamentos(meds_originales: List[Dict], matches: List[Dict], codigos_igualados_a_cero: Optional[set] = None) -> List[Dict]:
    """Procesa medicamentos para la NC."""
    result = []
    for match in matches:
        codigo = match['codigo_rips']
        for med in meds_originales:
            if med.get('codTecnologiaSalud') == codigo:
                med_nc = dict(med)
                cantidad = 1
                med_nc['cantidadMedicamento'] = cantidad
                if codigos_igualados_a_cero and codigo in codigos_igualados_a_cero:
                    med_nc['vrServicio'] = 0
                    med_nc['vrUnitMedicamento'] = 0
                else:
                    med_nc['vrServicio'] = match['valor_nc']
                    med_nc['vrUnitMedicamento'] = match['valor_nc'] / cantidad if cantidad > 0 else 0
                med_nc['consecutivo'] = len(result) + 1
                result.append(med_nc)
                break
    return result
```

Modify `_process_otros_servicios` (line 165-182):

```python
@staticmethod
def _process_otros_servicios(os_originales: List[Dict], matches: List[Dict], codigos_igualados_a_cero: Optional[set] = None) -> List[Dict]:
    """Procesa otros servicios para la NC."""
    result = []
    for match in matches:
        codigo = match['codigo_rips']
        for os in os_originales:
            if os.get('codTecnologiaSalud') == codigo:
                os_nc = dict(os)
                cantidad = 1
                os_nc['cantidadOS'] = cantidad
                if codigos_igualados_a_cero and codigo in codigos_igualados_a_cero:
                    os_nc['vrServicio'] = 0
                    os_nc['vrUnitOS'] = 0
                else:
                    os_nc['vrServicio'] = match['valor_nc']
                    os_nc['vrUnitOS'] = match['valor_nc'] / cantidad if cantidad > 0 else 0
                os_nc['consecutivo'] = len(result) + 1
                result.append(os_nc)
                break
    return result
```

Modify `_process_procedimientos` (line 185-203):

```python
@staticmethod
def _process_procedimientos(proc_originales: List[Dict], matches: List[Dict], es_caso_colesterol: bool = False, codigos_igualados_a_cero: Optional[set] = None) -> List[Dict]:
    """Procesa procedimientos para la NC."""
    result = []
    for match in matches:
        codigo = match['codigo_rips']
        for proc in proc_originales:
            if proc.get('codProcedimiento') == codigo:
                proc_nc = {k: v for k, v in proc.items()}
                valor = match['valor_nc']
                if es_caso_colesterol and codigo == '903816':
                    valor = 0
                if codigos_igualados_a_cero and codigo in codigos_igualados_a_cero:
                    valor = 0
                proc_nc['vrServicio'] = valor
                proc_nc['consecutivo'] = len(result) + 1
                result.append(proc_nc)
                break
    return result
```

Modify `_process_consultas` (line 206-218):

```python
@staticmethod
def _process_consultas(cons_originales: List[Dict], matches: List[Dict], codigos_igualados_a_cero: Optional[set] = None) -> List[Dict]:
    """Procesa consultas para la NC."""
    result = []
    for match in matches:
        codigo = match['codigo_rips']
        for cons in cons_originales:
            if cons.get('codConsulta') == codigo:
                cons_nc = {k: v for k, v in cons.items()}
                if codigos_igualados_a_cero and codigo in codigos_igualados_a_cero:
                    cons_nc['vrServicio'] = 0
                else:
                    cons_nc['vrServicio'] = match['valor_nc']
                cons_nc['consecutivo'] = len(result) + 1
                result.append(cons_nc)
                break
    return result
```

**Step 3: Update the `generate_nc_rips` method body to pass the new parameter through**

In the `generate_nc_rips` method, update the calls to each processor (around lines 115-136):

```python
for tipo, tipo_matches in services_by_type.items():
    if tipo == 'medicamentos':
        nc_usuario['servicios']['medicamentos'] = RIPSProcessor._process_medicamentos(
            servicios_originales.get('medicamentos', []),
            tipo_matches,
            codigos_igualados_a_cero
        )
    elif tipo == 'otrosServicios':
        nc_usuario['servicios']['otrosServicios'] = RIPSProcessor._process_otros_servicios(
            servicios_originales.get('otrosServicios', []),
            tipo_matches,
            codigos_igualados_a_cero
        )
    elif tipo == 'procedimientos':
        nc_usuario['servicios']['procedimientos'] = RIPSProcessor._process_procedimientos(
            servicios_originales.get('procedimientos', []),
            tipo_matches,
            es_caso_colesterol,
            codigos_igualados_a_cero
        )
    elif tipo == 'consultas':
        nc_usuario['servicios']['consultas'] = RIPSProcessor._process_consultas(
            servicios_originales.get('consultas', []),
            tipo_matches,
            codigos_igualados_a_cero
        )
```

**Step 4: Add `Optional` to imports**

Make sure line 1 imports include `Optional`:

```python
from typing import List, Dict, Any, Optional
```

**Step 5: Commit**

```bash
git add backend/app/processors/rips_processor.py
git commit -m "feat: add zero-equalization support to RIPS processor"
```

---

### Task 4: Add detection logic and preview endpoint to nc_router

**Files:**
- Modify: `backend/app/api/nc_router.py`

**Step 1: Add imports for new models**

Update imports at top of `nc_router.py` (line 10-17):

```python
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
```

**Step 2: Add the detection function**

Add this helper function after the existing `_extract_total_nc` function (after line 249):

```python
def _detect_equal_values(
    matching_result_matches,
    lineas_nc: List[LineaNC],
    servicios_rips: List[ServicioRIPS]
) -> List[ItemIgualadoCero]:
    """Detect items where NC XML and RIPS values are equal before processing."""
    items_igualados = []

    for m in matching_result_matches:
        # Get original NC line value
        linea = next((l for l in lineas_nc if l.id == m.linea_nc), None)
        if not linea:
            continue

        valor_nc = linea.valor

        # Get original RIPS service value
        servicio = next(
            (s for s in servicios_rips
             if s.codigo == m.codigo_rips and s.tipo == m.tipo_servicio),
            None
        )
        if not servicio:
            continue

        valor_rips = servicio.valor_unitario

        # Compare with tolerance
        if abs(valor_nc - valor_rips) < 0.01:
            items_igualados.append(ItemIgualadoCero(
                linea_nc=m.linea_nc,
                codigo_rips=m.codigo_rips,
                tipo_servicio=m.tipo_servicio,
                valor_original=valor_nc
            ))

    return items_igualados
```

**Step 3: Add pre-processing total extraction helper**

Add after the detection function:

```python
def _extract_total_nc_original(nc_content: str) -> float:
    """Extract total from original NC XML (before any modifications)."""
    embedded = XMLProcessor.get_embedded_document(nc_content)
    match = re.search(r'<cbc:PayableAmount[^>]*>([^<]+)</cbc:PayableAmount>', embedded)
    if match:
        return float(match.group(1))
    lines = XMLProcessor.extract_nc_lines(nc_content)
    return sum(l.valor for l in lines)


def _calculate_total_rips_original(rips_data) -> float:
    """Calculate total vrServicio from original RIPS (before any modifications)."""
    return RIPSProcessor.calculate_total(rips_data)
```

**Step 4: Modify `procesar_nc` endpoint to include detection logic**

In the `procesar_nc` function, after the matching (line 89) and before generating RIPS (line 95), add the detection:

After line 89 (`matching_result = await matcher.match_services(lineas_nc, servicios_rips)`), insert:

```python
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

        # Build set of codes to zero-equalize
        codigos_igualados = {item.codigo_rips for item in items_igualados}
        lineas_igualadas = [item.linea_nc for item in items_igualados]
```

Then update the `RIPSProcessor.generate_nc_rips` call (line 105) to pass the new parameter:

```python
        nc_rips = RIPSProcessor.generate_nc_rips(
            rips_data, num_nota, matches_for_rips, es_caso_colesterol,
            codigos_igualados_a_cero=codigos_igualados if codigos_igualados else None
        )
```

After inserting sections into NC (line 108), and before applying cholesterol case (line 111), add:

```python
        # Apply per-line zero-equalization to XML
        if lineas_igualadas:
            nc_completo = XMLProcessor.aplicar_valores_cero_por_linea(nc_completo, lineas_igualadas)
```

Finally, update the return statement (line 150-159) to include new fields:

```python
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
```

**Step 5: Add the `/preview-values` endpoint**

Add this new endpoint after the existing `preview_matching` endpoint (after line 200):

```python
@router.post("/preview-values", response_model=PreviewValuesResponse)
async def preview_values(
    nc_xml: UploadFile = File(...),
    factura_rips: UploadFile = File(...)
):
    """Preview original values from NC XML and RIPS before processing."""
    try:
        nc_content = (await nc_xml.read()).decode('utf-8')
        rips_content = (await factura_rips.read()).decode('utf-8')

        # Extract NC total
        total_nc = _extract_total_nc_original(nc_content)

        # Parse and calculate RIPS total
        rips_data = RIPSProcessor.parse_rips(rips_content)
        total_rips = RIPSProcessor.calculate_total(rips_data)

        # Extract CDATA content for XML preview
        nc_cdata = XMLProcessor.extract_cdata(nc_content) or nc_content

        return PreviewValuesResponse(
            valores_nc_xml=total_nc,
            valores_rips=total_rips,
            nc_xml_cdata=nc_cdata,
            rips_json=rips_data
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

**Step 6: Commit**

```bash
git add backend/app/api/nc_router.py
git commit -m "feat: add zero-equalization detection and preview-values endpoint"
```

---

### Task 5: Add zero-equalization to batch processor for non-LDL folders

**Files:**
- Modify: `backend/app/services/batch_processor.py`

**Step 1: Update the `process_folder` method**

In `batch_processor.py`, update the `process_folder` method. After the matching section (around line 298-309), add detection logic for non-LDL folders.

After `matching_result = await matcher.match_services(lineas_nc, servicios_rips)` (line 298) and before generating RIPS (line 301), insert:

```python
            # Detect equal values for non-LDL folders
            codigos_igualados = None
            lineas_igualadas = []
            items_igualados_count = 0
            if not es_caso_especial:
                from app.models import ItemIgualadoCero
                for m in matching_result.matches:
                    linea = next((l for l in lineas_nc if l.id == m.linea_nc), None)
                    servicio = next(
                        (s for s in servicios_rips
                         if s.codigo == m.codigo_rips and s.tipo == m.tipo_servicio),
                        None
                    )
                    if linea and servicio and abs(linea.valor - servicio.valor_unitario) < 0.01:
                        if codigos_igualados is None:
                            codigos_igualados = set()
                        codigos_igualados.add(m.codigo_rips)
                        lineas_igualadas.append(m.linea_nc)
                        items_igualados_count += 1
```

Then update the `generate_nc_rips` call (around line 311-316):

```python
            nc_rips = RIPSProcessor.generate_nc_rips(
                rips_data,
                numero_nc,
                matches_for_rips,
                es_caso_especial,
                codigos_igualados_a_cero=codigos_igualados
            )
```

After inserting sections (line 319) and before applying special case (line 322), add:

```python
            # Apply per-line zero-equalization for non-LDL folders
            if lineas_igualadas:
                nc_completo = XMLProcessor.aplicar_valores_cero_por_linea(nc_completo, lineas_igualadas)
```

**Step 2: Add `items_igualados_a_cero` field to BatchResult**

At the top of the file, in the `BatchResult` dataclass (around line 30-48), add:

```python
@dataclass
class BatchResult:
    carpeta: str
    numero_nc: str
    exitoso: bool
    cuv: Optional[str] = None
    error: Optional[str] = None
    es_caso_especial: bool = False
    raw_response: Optional[Dict] = None
    items_igualados_a_cero: int = 0
```

And set it in the successful return (around line 343):

```python
                        return BatchResult(
                            carpeta=folder_name,
                            numero_nc=numero_nc,
                            exitoso=True,
                            cuv=response.codigo_unico_validacion,
                            es_caso_especial=es_caso_especial,
                            raw_response=response.raw_response,
                            items_igualados_a_cero=items_igualados_count
                        )
```

**Step 3: Update summary generation to report zero-equalized items**

In `_generate_summary` method, update the detail section (around line 606-612):

```python
        for resultado in state.resultados:
            status = "EXITOSO" if resultado.exitoso else "ERROR"
            lines.append(f"[{status}] {resultado.carpeta} - NC: {resultado.numero_nc}")
            if resultado.exitoso and resultado.cuv:
                lines.append(f"         CUV: {resultado.cuv}")
                if resultado.items_igualados_a_cero > 0:
                    lines.append(f"         Items igualados a 0: {resultado.items_igualados_a_cero}")
            elif resultado.error:
                lines.append(f"         Error: {resultado.error}")
```

**Step 4: Commit**

```bash
git add backend/app/services/batch_processor.py
git commit -m "feat: add zero-equalization detection to batch processor for non-LDL folders"
```

---

### Task 6: Update frontend API types and add preview endpoint

**Files:**
- Modify: `frontend/src/utils/api.ts`
- Modify: `frontend/src/services/batchApi.ts`

**Step 1: Update ProcessNCResponse type in api.ts**

In `frontend/src/utils/api.ts`, update the `ProcessNCResponse` interface (lines 5-27):

```typescript
export interface ItemIgualadoCero {
  linea_nc: number
  codigo_rips: string
  tipo_servicio: string
  valor_original: number
}

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
    cantidad_rips: number | null
    confianza: string
  }>
  warnings: string[]
  errors: string[]
  numero_nota_credito?: string
  valores_pre_procesamiento?: {
    total_nc_xml: number
    total_rips: number
  }
  items_igualados_a_cero: ItemIgualadoCero[]
}

export interface PreviewValuesResponse {
  valores_nc_xml: number
  valores_rips: number
  nc_xml_cdata: string
  rips_json: Record<string, unknown>
}
```

**Step 2: Add `previewValues` function**

Add this function after `procesarNC` in `api.ts`:

```typescript
export async function previewValues(
  ncXml: File,
  facturaRips: File
): Promise<PreviewValuesResponse> {
  const formData = new FormData()
  formData.append('nc_xml', ncXml)
  formData.append('factura_rips', facturaRips)

  const response = await axios.post(`${API_URL}/preview-values`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  return response.data
}
```

**Step 3: Update BatchStatusResponse in batchApi.ts**

In `frontend/src/services/batchApi.ts`, update the `detalles` type in `BatchStatusResponse` (line 44-51):

```typescript
  detalles: Array<{
    carpeta: string
    numero_nc: string
    exitoso: boolean
    estado: string
    cuv?: string
    error?: string
    items_igualados_a_cero?: number
  }>
```

**Step 4: Commit**

```bash
git add frontend/src/utils/api.ts frontend/src/services/batchApi.ts
git commit -m "feat: update frontend API types and add preview-values endpoint"
```

---

### Task 7: Add preview section to FileUpload component

**Files:**
- Modify: `frontend/src/components/FileUpload.tsx`

**Step 1: Rewrite FileUpload to include preview**

Replace the entire content of `FileUpload.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { Loader2, Eye, EyeOff, AlertTriangle } from 'lucide-react'
import FileDropZone from './FileDropZone'
import JsonExplorer from './JsonExplorer'
import XmlExplorer from './XmlExplorer'
import { previewValues } from '../utils/api'
import type { PreviewValuesResponse } from '../utils/api'

interface FileUploadProps {
  ncXml: File | null
  setNcXml: (file: File | null) => void
  facturaXml: File | null
  setFacturaXml: (file: File | null) => void
  facturaRips: File | null
  setFacturaRips: (file: File | null) => void
  esCasoColesterol: boolean
  setEsCasoColesterol: (value: boolean) => void
  loading: boolean
  canSubmit: boolean
  onSubmit: () => void
  error: string | null
}

export default function FileUpload({
  ncXml,
  setNcXml,
  facturaXml,
  setFacturaXml,
  facturaRips,
  setFacturaRips,
  esCasoColesterol,
  setEsCasoColesterol,
  loading,
  canSubmit,
  onSubmit,
  error
}: FileUploadProps) {
  const [preview, setPreview] = useState<PreviewValuesResponse | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [activePreviewTab, setActivePreviewTab] = useState<'json' | 'xml'>('json')

  // Auto-load preview when both NC XML and RIPS are selected
  useEffect(() => {
    if (ncXml && facturaRips) {
      loadPreview()
    } else {
      setPreview(null)
      setPreviewError(null)
    }
  }, [ncXml, facturaRips])

  const loadPreview = async () => {
    if (!ncXml || !facturaRips) return

    setPreviewLoading(true)
    setPreviewError(null)
    try {
      const result = await previewValues(ncXml, facturaRips)
      setPreview(result)
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Error al cargar preview')
    } finally {
      setPreviewLoading(false)
    }
  }

  const valoresIguales = preview
    ? Math.abs(preview.valores_nc_xml - preview.valores_rips) < 0.01
    : false

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <FileDropZone
          label="Nota Credito (XML)"
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

      {/* Pre-processing values summary */}
      {preview && (
        <div className={`mb-6 p-4 rounded-lg border ${
          valoresIguales
            ? 'bg-orange-50 border-orange-300'
            : 'bg-blue-50 border-blue-200'
        }`}>
          <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
            {valoresIguales && <AlertTriangle size={16} className="text-orange-600" />}
            Valores originales (antes de procesar)
          </h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Total NC (XML):</span>
              <span className="ml-2 font-medium">${preview.valores_nc_xml.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-gray-600">Total RIPS:</span>
              <span className="ml-2 font-medium">${preview.valores_rips.toFixed(2)}</span>
            </div>
          </div>
          {valoresIguales && (
            <div className="mt-3 p-2 bg-orange-100 rounded text-sm text-orange-800">
              <strong>Valores iguales detectados.</strong> Al procesar, los items coincidentes seran igualados a 0
              (se esta descontando el valor total de la factura original).
            </div>
          )}

          {/* Preview toggle */}
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="mt-3 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
          >
            {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
            {showPreview ? 'Ocultar previsualizacion' : 'Previsualizar archivos'}
          </button>
        </div>
      )}

      {/* Preview loading */}
      {previewLoading && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg flex items-center gap-2 text-sm text-gray-600">
          <Loader2 className="animate-spin" size={16} />
          Cargando preview de valores...
        </div>
      )}

      {/* Preview error */}
      {previewError && (
        <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg text-sm">
          {previewError}
        </div>
      )}

      {/* File previews (JSON/XML explorers) */}
      {showPreview && preview && (
        <div className="mb-6">
          {/* Tabs */}
          <div className="flex border-b border-gray-200 mb-4">
            <button
              onClick={() => setActivePreviewTab('json')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activePreviewTab === 'json'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              JSON (RIPS)
            </button>
            <button
              onClick={() => setActivePreviewTab('xml')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activePreviewTab === 'xml'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              XML (NC - CDATA)
            </button>
          </div>

          {/* JSON Explorer (read-only) */}
          {activePreviewTab === 'json' && (
            <JsonExplorer
              data={preview.rips_json}
              onSelectField={() => {}}
            />
          )}

          {/* XML Explorer (read-only) */}
          {activePreviewTab === 'xml' && (
            <XmlExplorer
              xmlContent={preview.nc_xml_cdata}
              onSelectField={() => {}}
            />
          )}
        </div>
      )}

      <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={esCasoColesterol}
            onChange={(e) => setEsCasoColesterol(e.target.checked)}
            className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">
            Caso especial: Contiene Colesterol de Baja Densidad (903816)
          </span>
        </label>
        <p className="mt-2 text-xs text-gray-500 ml-8">
          Marque esta opcion si la NC incluye el procedimiento 903816 (Colesterol de Baja Densidad).
          Esto pondra los valores monetarios en 0.00 y el vrServicio del procedimiento en 0.
        </p>
      </div>

      <button
        onClick={onSubmit}
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
          'Procesar Nota Credito'
        )}
      </button>

      {error && (
        <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-lg">
          {error}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/FileUpload.tsx
git commit -m "feat: add pre-processing preview with values summary and JSON/XML explorers"
```

---

### Task 8: Update ResultsView to show pre-processing values and zero-equalized items

**Files:**
- Modify: `frontend/src/components/ResultsView.tsx`

**Step 1: Update ResultsView component**

In `ResultsView.tsx`, add a section after the "Estado" block (after line 30) and before the "Validacion" block (line 33):

Add import at top:
```tsx
import { CheckCircle, AlertCircle, Download, ShieldCheck, UserCheck, UserX, AlertTriangle } from 'lucide-react'
```

After the Estado section (line 30 closing `</div>`), insert:

```tsx
      {/* Pre-processing values */}
      {result.valores_pre_procesamiento && (
        <div className="mb-4 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-medium mb-2">Valores Originales (Antes de Procesar)</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Total NC (XML) original:</span>
              <span className="ml-2 font-medium">${result.valores_pre_procesamiento.total_nc_xml.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-gray-600">Total RIPS original:</span>
              <span className="ml-2 font-medium">${result.valores_pre_procesamiento.total_rips.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Zero-equalized items */}
      {result.items_igualados_a_cero && result.items_igualados_a_cero.length > 0 && (
        <div className="mb-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
          <h3 className="font-medium mb-2 flex items-center gap-2 text-orange-800">
            <AlertTriangle size={16} />
            Items igualados a 0 ({result.items_igualados_a_cero.length})
          </h3>
          <p className="text-sm text-orange-700 mb-3">
            Los siguientes items tenian valores iguales en NC y RIPS antes de procesar,
            por lo que sus valores fueron igualados a 0.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-orange-100">
                <tr>
                  <th className="px-3 py-2 text-left">Linea NC</th>
                  <th className="px-3 py-2 text-left">Codigo RIPS</th>
                  <th className="px-3 py-2 text-left">Tipo Servicio</th>
                  <th className="px-3 py-2 text-right">Valor Original</th>
                </tr>
              </thead>
              <tbody>
                {result.items_igualados_a_cero.map((item, idx) => (
                  <tr key={idx} className="border-b border-orange-100">
                    <td className="px-3 py-2">{item.linea_nc}</td>
                    <td className="px-3 py-2">{item.codigo_rips}</td>
                    <td className="px-3 py-2">{item.tipo_servicio}</td>
                    <td className="px-3 py-2 text-right">${item.valor_original.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
```

**Step 2: Commit**

```bash
git add frontend/src/components/ResultsView.tsx
git commit -m "feat: show pre-processing values and zero-equalized items in results view"
```

---

### Task 9: Update BatchProgress to show zero-equalized items badge

**Files:**
- Modify: `frontend/src/components/BatchProcessor/BatchProgress.tsx`

**Step 1: Add badge for zero-equalized items**

In `BatchProgress.tsx`, update the folder list item (around line 288-291) to show a badge when items were zero-equalized. After the LDL badge:

```tsx
{folder.es_caso_especial && (
  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
    LDL
  </span>
)}
{detail?.items_igualados_a_cero && detail.items_igualados_a_cero > 0 && (
  <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full">
    {detail.items_igualados_a_cero} a 0
  </span>
)}
```

**Step 2: Add a counter card for zero-equalized items in the statistics section**

Update the stats grid (around lines 242-256) to be 4 columns and add a new card:

```tsx
{status && (
  <div className="grid grid-cols-4 gap-4">
    <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
      <div className="text-2xl font-bold text-green-600">{status.exitosos}</div>
      <div className="text-sm text-green-700">Exitos</div>
    </div>
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
      <div className="text-2xl font-bold text-red-600">{status.errores}</div>
      <div className="text-sm text-red-700">Errores</div>
    </div>
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
      <div className="text-2xl font-bold text-blue-600">{ldlCount}</div>
      <div className="text-sm text-blue-700">LDL</div>
    </div>
    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 text-center">
      <div className="text-2xl font-bold text-orange-600">
        {status.detalles.reduce((sum, d) => sum + (d.items_igualados_a_cero || 0), 0)}
      </div>
      <div className="text-sm text-orange-700">Items a 0</div>
    </div>
  </div>
)}
```

**Step 3: Commit**

```bash
git add frontend/src/components/BatchProcessor/BatchProgress.tsx
git commit -m "feat: add zero-equalized items badge and counter to batch progress"
```

---

### Task 10: Update batch_router to expose items_igualados_a_cero in status response

**Files:**
- Modify: `backend/app/api/batch_router.py`

**Step 1: Read and check the batch_router for the status endpoint**

The status endpoint returns `detalles` from `BatchResult`. Ensure `items_igualados_a_cero` is included in the response serialization.

Look for where `state.resultados` is converted to the response dict. The field `items_igualados_a_cero` on `BatchResult` is an `int` (default 0), so it should automatically be serialized if the response includes all dataclass fields. Check the status endpoint and add the field to the response if needed.

The detalles list should include:

```python
{
    "carpeta": r.carpeta,
    "numero_nc": r.numero_nc,
    "exitoso": r.exitoso,
    "estado": "completado" if r.exitoso else "error",
    "cuv": r.cuv,
    "error": r.error,
    "items_igualados_a_cero": r.items_igualados_a_cero
}
```

**Step 2: Commit**

```bash
git add backend/app/api/batch_router.py
git commit -m "feat: expose items_igualados_a_cero in batch status response"
```

---

### Task 11: Final integration test

**Step 1: Start the backend**

```bash
cd /Users/personal/HMD/NC_processor/backend
python -m uvicorn app.main:app --reload --port 8000
```

**Step 2: Start the frontend**

```bash
cd /Users/personal/HMD/NC_processor/frontend
npm run dev
```

**Step 3: Manual testing checklist**

- [ ] Upload NC XML and RIPS JSON -> preview values appear automatically
- [ ] If values are equal, orange warning shows
- [ ] Click "Previsualizar archivos" -> JSON and XML explorers work
- [ ] Quick nav buttons (Interoperabilidad, Items, etc.) work in XML explorer
- [ ] Process files -> results show "Valores Originales" section
- [ ] If items were equalized, orange table shows which ones
- [ ] Cholesterol checkbox still works independently
- [ ] Batch mode: non-LDL folders get automatic detection
- [ ] Batch mode: LDL folders are NOT auto-detected (use existing logic)
- [ ] Batch mode: badge shows "N a 0" for folders with equalized items
- [ ] Batch stats card shows total items equalized to 0

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete zero-equalization feature with preview and batch support"
```
