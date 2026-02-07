# Descarga Masiva de RIPS Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Permitir la descarga masiva de archivos RIPS JSON generados durante el procesamiento batch de Notas de Crédito con nombres estructurados.

**Architecture:** Durante el procesamiento batch, guardamos cada RIPS de NC generado en un directorio temporal con nombre `RIPS_{NIT}_{prefijo_nc}{numero}.json`. Al finalizar el batch, un nuevo botón en la UI permite descargar un ZIP con todos los RIPS. El ZIP se genera en memoria y la carpeta temporal se elimina automáticamente después de la descarga.

**Tech Stack:** Python (FastAPI, pathlib, zipfile, regex), TypeScript/React, REST API

---

## Task 1: Add helper method to extract NC prefix from filename

**Files:**
- Modify: `backend/app/services/batch_processor.py:76-100`

**Step 1: Add _extraer_prefijo_nc method to BatchProcessor class**

Agregar este método después del método `__init__` (línea ~100):

```python
def _extraer_prefijo_nc(self, filename: str) -> str:
    """Extrae el prefijo NC del nombre del archivo (ej: NCS, NCD).

    Busca el patrón: NC seguido de letras mayúsculas antes del número.

    Args:
        filename: Nombre del archivo XML (ej: "NC_HMD_NCS000123.xml")

    Returns:
        Prefijo encontrado (ej: "NCS") o string vacío si no se encuentra

    Examples:
        >>> self._extraer_prefijo_nc("NC_HMD_NCS000123.xml")
        'NCS'
        >>> self._extraer_prefijo_nc("nc_test_ncd456.xml")
        'NCD'
        >>> self._extraer_prefijo_nc("NC000123.xml")
        ''
    """
    import re
    match = re.search(r'NC([A-Z]+)', filename.upper())
    return match.group(1) if match else ""
```

**Step 2: Verify import re is at the top of the file**

Si no existe, agregar al principio del archivo con los otros imports (después de línea 7):

```python
import re
```

**Step 3: Commit**

```bash
git add backend/app/services/batch_processor.py
git commit -m "feat: add helper method to extract NC prefix from filename

Add _extraer_prefijo_nc method to BatchProcessor that extracts the NC
prefix (NCS, NCD, etc.) from XML filename using regex pattern.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Modify _read_folder_files to return NC filename

**Files:**
- Modify: `backend/app/services/batch_processor.py:501-550`

**Step 1: Update files dictionary to include nota_credito_filename**

En la función `_read_folder_files`, modificar el diccionario inicial (línea ~511):

```python
files = {
    "factura": None,
    "nota_credito": None,
    "nota_credito_filename": None,  # NUEVO
    "rips": None
}
```

**Step 2: Capture filename when reading NC file**

Modificar la sección que detecta el archivo NC (línea ~533):

```python
# Detect Nota Credito XML (contains NC, NCD, or NCS + .xml)
elif file_path.suffix.lower() == ".xml" and "NC" in filename_upper:
    files["nota_credito"] = file_path.read_text(encoding='utf-8')
    files["nota_credito_filename"] = file_path.name  # NUEVO
```

**Step 3: Commit**

```bash
git add backend/app/services/batch_processor.py
git commit -m "feat: return NC filename in _read_folder_files

Modify _read_folder_files to include the NC XML filename in the
returned dictionary, needed for constructing RIPS filenames.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Save RIPS JSON files during batch processing

**Files:**
- Modify: `backend/app/services/batch_processor.py:213-447`

**Step 1: Add batch_id parameter to process_folder signature**

Modificar la firma del método `process_folder` (línea ~213):

```python
async def process_folder(
    self,
    folder_path: str,
    token: str,
    es_caso_especial: bool = False,
    batch_id: Optional[str] = None  # NUEVO
) -> BatchResult:
```

**Step 2: Add code to save RIPS after generation**

Después de generar el RIPS de NC (después de línea 337, antes de `nc_completo = XMLProcessor.insert_sections(...)`):

```python
# Generate RIPS for NC
matches_for_rips = [
    {
        'tipo_servicio': m.tipo_servicio,
        'codigo_rips': m.codigo_rips,
        'valor_nc': m.valor_nc,
        'cantidad_calculada': m.cantidad_calculada
    }
    for m in matching_result.matches
]

nc_rips = RIPSProcessor.generate_nc_rips(
    rips_data,
    numero_nc,
    matches_for_rips,
    es_caso_especial,
    codigos_igualados_a_cero=codigos_igualados
)

# NUEVO: Save RIPS to temporary directory if batch_id provided
if batch_id:
    try:
        # Extract NC prefix from filename
        nc_xml_filename = files.get("nota_credito_filename", "")
        prefijo_nc = self._extraer_prefijo_nc(nc_xml_filename)

        # Get NIT from RIPS data
        nit = rips_data.get("numDocumentoIdObligado", "UNKNOWN")

        # Construct RIPS filename
        rips_filename = f"RIPS_{nit}_{prefijo_nc}{numero_nc}.json"

        # Create directory and save file
        rips_dir = Path(f"backend/temp/batch_rips/{batch_id}")
        rips_dir.mkdir(parents=True, exist_ok=True)
        rips_path = rips_dir / rips_filename

        with open(rips_path, 'w', encoding='utf-8') as f:
            json.dump(nc_rips, f, indent=2, ensure_ascii=False)

        logger.info(f"Saved RIPS file: {rips_filename}")
    except Exception as e:
        logger.warning(f"Failed to save RIPS file for {folder_name}: {e}")
        # Don't fail the processing if RIPS save fails
# FIN NUEVO

# Insert sections into NC
nc_completo = XMLProcessor.insert_sections(nc_content, interop, period)
```

**Step 3: Update process_batch to pass batch_id to process_folder**

Modificar la llamada a `process_folder` en el método `process_batch` (línea ~169):

```python
result = await self.process_folder(
    folder.path,
    token,
    folder.es_caso_especial,
    batch_id=batch_id  # NUEVO
)
```

**Step 4: Commit**

```bash
git add backend/app/services/batch_processor.py
git commit -m "feat: save RIPS JSON files during batch processing

Save each generated NC RIPS to temporary directory with structured
filename format: RIPS_{NIT}_{prefix}{number}.json.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Add download-rips endpoint to batch router

**Files:**
- Modify: `backend/app/api/batch_router.py:1-501`

**Step 1: Add import for shutil at the top**

Verificar que `shutil` ya está importado (línea 18). Si no, agregarlo:

```python
import shutil
```

**Step 2: Add the download_batch_rips endpoint**

Agregar este endpoint después del endpoint `/download/{batch_id}` (después de línea ~434):

```python
@router.get("/batch/{batch_id}/download-rips")
async def download_batch_rips(batch_id: str):
    """Genera y descarga un ZIP con todos los RIPS de NC del batch.

    Después de generar el ZIP, elimina automáticamente la carpeta temporal
    para liberar espacio.

    Args:
        batch_id: ID único del batch

    Returns:
        StreamingResponse con el archivo ZIP

    Raises:
        HTTPException 404: Si no se encuentran archivos RIPS para el batch
    """
    from fastapi.responses import StreamingResponse
    import io

    # 1. Verificar que el directorio existe
    rips_dir = Path(f"backend/temp/batch_rips/{batch_id}")
    if not rips_dir.exists():
        raise HTTPException(
            status_code=404,
            detail=f"No se encontraron archivos RIPS para el batch {batch_id}"
        )

    # Check if there are any RIPS files
    rips_files = list(rips_dir.glob("RIPS_*.json"))
    if not rips_files:
        raise HTTPException(
            status_code=404,
            detail=f"No hay archivos RIPS en el batch {batch_id}"
        )

    try:
        # 2. Crear ZIP en memoria
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            for rips_file in rips_files:
                zf.write(rips_file, rips_file.name)

        zip_buffer.seek(0)

        # 3. Eliminar carpeta después de crear el ZIP
        try:
            shutil.rmtree(rips_dir)
            logger.info(f"Cleaned up RIPS directory for batch {batch_id}")
        except Exception as e:
            logger.warning(f"Failed to cleanup RIPS directory for {batch_id}: {e}")
            # No fallar la descarga si la limpieza falla

        # 4. Retornar como descarga
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={
                "Content-Disposition": f"attachment; filename={batch_id}_RIPS.zip"
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating RIPS ZIP for batch {batch_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error generating RIPS ZIP: {str(e)}"
        )
```

**Step 3: Commit**

```bash
git add backend/app/api/batch_router.py
git commit -m "feat: add endpoint to download batch RIPS as ZIP

Add GET /batch/{batch_id}/download-rips endpoint that generates a ZIP
with all RIPS JSON files and auto-cleans the temp directory.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Add download RIPS button to frontend

**Files:**
- Modify: `frontend/src/components/BatchProcessor/BatchProgress.tsx:1-398`

**Step 1: Add FileJson icon import**

Agregar `FileJson` a los imports de lucide-react (línea ~2):

```tsx
import {
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Download,
  Play,
  FileText,
  AlertCircle,
  CheckSquare,
  XSquare,
  Clock,
  FileJson  // NUEVO
} from 'lucide-react'
```

**Step 2: Add state for RIPS download**

Agregar el estado después del estado `expandedFolders` (línea ~37):

```tsx
const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
const [downloadingRips, setDownloadingRips] = useState(false)  // NUEVO
```

**Step 3: Add handler function for RIPS download**

Agregar la función después de `toggleFolder` (línea ~55):

```tsx
// Download RIPS ZIP
const handleDownloadRips = async () => {
  if (!batchId) return

  setDownloadingRips(true)
  try {
    const response = await fetch(`/api/batch/${batchId}/download-rips`)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.detail || 'No se encontraron archivos RIPS')
    }

    // Download the file
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${batchId}_RIPS.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  } catch (error) {
    console.error('Error downloading RIPS:', error)
    alert(`Error al descargar RIPS: ${error instanceof Error ? error.message : 'Error desconocido'}`)
  } finally {
    setDownloadingRips(false)
  }
}
```

**Step 4: Modify renderActionButton to include RIPS download button**

Reemplazar el caso `if (status?.estado === 'completado' && batchId)` (línea ~187-198) con:

```tsx
if (status?.estado === 'completado' && batchId) {
  return (
    <div className="flex gap-3">
      <a
        href={downloadBatchResults(batchId)}
        download
        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
      >
        <Download size={18} />
        Descargar Resultados
      </a>
      <button
        onClick={handleDownloadRips}
        disabled={downloadingRips}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {downloadingRips ? (
          <>
            <Loader2 className="animate-spin" size={18} />
            Descargando RIPS...
          </>
        ) : (
          <>
            <FileJson size={18} />
            Descargar RIPS
          </>
        )}
      </button>
    </div>
  )
}
```

**Step 5: Commit**

```bash
git add frontend/src/components/BatchProcessor/BatchProgress.tsx
git commit -m "feat: add download RIPS button to batch results

Add new button next to 'Descargar Resultados' that downloads a ZIP
with all RIPS JSON files generated during batch processing.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Manual testing

**Files:**
- N/A (manual testing)

**Step 1: Start the backend server**

```bash
cd backend
uvicorn app.main:app --reload
```

Expected: Server starts on http://localhost:8000

**Step 2: Start the frontend dev server**

```bash
cd frontend
npm run dev
```

Expected: Frontend starts on http://localhost:5173

**Step 3: Test batch processing flow**

1. Navigate to batch processor in UI
2. Upload a ZIP with NC folders
3. Log in to SISPRO
4. Start batch processing
5. Wait for completion
6. Click "Descargar RIPS" button
7. Verify ZIP downloads with correct filename format

Expected:
- ZIP downloads with name `batch_YYYYMMDD_HHMMSS_RIPS.zip`
- ZIP contains files named `RIPS_{NIT}_{prefix}{number}.json`
- Each JSON file contains valid RIPS data
- Temporary directory `backend/temp/batch_rips/{batch_id}/` is deleted after download

**Step 4: Test with different NC prefixes**

Create test folders with different NC filename patterns:
- `NC_HMD_NCS000123.xml` → Should create `RIPS_817000162_NCS000123.json`
- `NC_HMD_NCD000456.xml` → Should create `RIPS_817000162_NCD000456.json`
- `NC_TEST_NCSABC789.xml` → Should create `RIPS_817000162_NCSABC789.json`

Expected: All prefixes are correctly extracted and included in filenames

**Step 5: Test error cases**

1. Try to download RIPS for non-existent batch_id
   Expected: 404 error with message "No se encontraron archivos RIPS"

2. Try to download RIPS before batch completes
   Expected: Directory doesn't exist yet, 404 error

3. Try to download RIPS twice (should fail second time due to auto-cleanup)
   Expected: First download succeeds, second returns 404

**Step 6: Verify cleanup**

After successful download, check that directory is deleted:

```bash
ls -la backend/temp/batch_rips/
```

Expected: The specific batch_id directory should not exist

---

## Task 7: Update memory with learnings

**Files:**
- Create/Modify: `/Users/personal/.claude/projects/-Users-personal-HMD-NC-processor/memory/MEMORY.md`

**Step 1: Document the batch RIPS download feature**

```markdown
# NC Processor Memory

## Batch Processing Features

### RIPS Download (2026-02-06)
- Durante batch processing, los RIPS generados se guardan en `backend/temp/batch_rips/{batch_id}/`
- Formato de nombre: `RIPS_{NIT}_{prefijo_nc}{numero}.json`
- Prefijo extraído del nombre del archivo XML con regex: `r'NC([A-Z]+)'`
- Botón de descarga genera ZIP en memoria y auto-limpia directorio temporal
- Endpoint: `GET /api/batch/{batch_id}/download-rips`

### Key Patterns
- Siempre pasar `batch_id` a través del flujo para poder guardar archivos temporales
- Usar `logger.warning` para errores no-críticos (cleanup, save RIPS) que no deben fallar el proceso principal
- ZIP en memoria (`io.BytesIO`) es eficiente para batches pequeños/medianos (<1000 archivos)
```

**Step 2: Commit**

```bash
git add /Users/personal/.claude/projects/-Users-personal-HMD-NC-processor/memory/MEMORY.md
git commit -m "docs: update memory with batch RIPS download learnings

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Testing Checklist

- [ ] Backend: `_extraer_prefijo_nc` extrae correctamente NCS, NCD, etc.
- [ ] Backend: `_read_folder_files` devuelve el nombre del archivo NC
- [ ] Backend: RIPS se guardan durante batch processing con nombres correctos
- [ ] Backend: Endpoint `/download-rips` retorna ZIP válido
- [ ] Backend: Directorio temporal se elimina después de descarga
- [ ] Frontend: Botón "Descargar RIPS" aparece cuando batch completa
- [ ] Frontend: Loading state funciona durante descarga
- [ ] Frontend: ZIP se descarga automáticamente
- [ ] Frontend: Error handling muestra mensajes apropiados
- [ ] Integration: Flujo completo funciona end-to-end

## Notes

- La limpieza automática significa que el usuario solo puede descargar el ZIP una vez. Si necesita re-descargar, debe re-procesar el batch.
- Los archivos RIPS guardados son idénticos a los enviados al ministerio, útiles para auditoría.
- El prefijo NC puede ser cualquier combinación de letras (NCS, NCD, NCSDIAN, etc.)
- El NIT proviene de `numDocumentoIdObligado` en el RIPS original de la factura.
