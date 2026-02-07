# Diseño: Descarga Masiva de RIPS de Notas de Crédito

**Fecha:** 2026-02-06
**Tipo:** Nueva funcionalidad
**Contexto:** Procesamiento masivo de Notas de Crédito

## Objetivo

Permitir la descarga masiva de los archivos RIPS JSON generados durante el procesamiento batch de Notas de Crédito, con nombres de archivo estructurados que incluyan el NIT del prestador y el número completo de la NC.

## Arquitectura General

### Flujo de Datos

**Durante el procesamiento masivo:**
1. Al procesar cada carpeta, `BatchProcessor.process_folder` genera el RIPS de NC (ya existe)
2. **NUEVO:** Guardamos ese RIPS JSON en `backend/temp/batch_rips/{batch_id}/`
3. Extraemos el prefijo de NC del nombre del archivo XML (NCS, NCD, etc.) usando regex
4. Guardamos con nombre: `RIPS_{NIT}_{prefijo_nc}{numero}.json`
5. El procesamiento continúa normalmente enviando al ministerio

**Después del procesamiento:**
1. En el panel de resultados aparece un **nuevo botón "Descargar RIPS"** junto al botón "Descargar Resultados"
2. Al hacer clic, llama al endpoint `GET /api/batch/{batch_id}/download-rips`
3. El backend genera un ZIP con todos los archivos `RIPS_*.json`
4. El archivo se descarga como `{batch_id}_RIPS.zip`
5. La carpeta temporal se elimina automáticamente

## Diseño Backend

### 1. Modificaciones en `BatchProcessor.process_folder`

Después de generar el RIPS de NC (línea 331-337 actual):

```python
# 1. Extraer prefijo del nombre del archivo XML de NC
nc_xml_filename = files["nota_credito_filename"]  # Nueva clave
prefijo_nc = self._extraer_prefijo_nc(nc_xml_filename)  # Ej: "NCS", "NCD"

# 2. Construir nombre del archivo RIPS
nit = rips_data.get("numDocumentoIdObligado", "UNKNOWN")
rips_filename = f"RIPS_{nit}_{prefijo_nc}{numero_nc}.json"

# 3. Guardar en directorio temporal
rips_dir = Path(f"backend/temp/batch_rips/{batch_id}")
rips_dir.mkdir(parents=True, exist_ok=True)
rips_path = rips_dir / rips_filename

with open(rips_path, 'w', encoding='utf-8') as f:
    json.dump(nc_rips, f, indent=2, ensure_ascii=False)
```

### 2. Nueva función helper en `BatchProcessor`

```python
def _extraer_prefijo_nc(self, filename: str) -> str:
    """Extrae el prefijo NC del nombre del archivo (ej: NCS, NCD).

    Busca el patrón: NC seguido de letras mayúsculas antes del número.

    Args:
        filename: Nombre del archivo XML (ej: "NC_HMD_NCS000123.xml")

    Returns:
        Prefijo encontrado (ej: "NCS") o string vacío si no se encuentra
    """
    import re
    match = re.search(r'NC([A-Z]+)', filename.upper())
    return match.group(1) if match else ""
```

### 3. Modificación en `_read_folder_files`

Debe devolver también el nombre del archivo de NC:

```python
def _read_folder_files(self, folder: Path) -> Optional[Dict[str, str]]:
    files = {
        "factura": None,
        "nota_credito": None,
        "nota_credito_filename": None,  # NUEVO
        "rips": None
    }

    # ... dentro del loop de archivos ...
    elif file_path.suffix.lower() == ".xml" and "NC" in filename_upper:
        files["nota_credito"] = file_path.read_text(encoding='utf-8')
        files["nota_credito_filename"] = file_path.name  # NUEVO
```

### 4. Nuevo endpoint en `batch_router.py`

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
    from pathlib import Path
    import zipfile
    import io
    import shutil
    from fastapi.responses import StreamingResponse

    # 1. Verificar que el directorio existe
    rips_dir = Path(f"backend/temp/batch_rips/{batch_id}")
    if not rips_dir.exists() or not any(rips_dir.glob("RIPS_*.json")):
        raise HTTPException(
            status_code=404,
            detail="No se encontraron archivos RIPS para este batch"
        )

    # 2. Crear ZIP en memoria
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        for rips_file in rips_dir.glob("RIPS_*.json"):
            zf.write(rips_file, rips_file.name)

    zip_buffer.seek(0)

    # 3. Eliminar carpeta después de crear el ZIP
    try:
        shutil.rmtree(rips_dir)
        logger.info(f"Cleaned up RIPS directory for batch {batch_id}")
    except Exception as e:
        logger.warning(f"Failed to cleanup RIPS directory: {e}")
        # No fallar la descarga si la limpieza falla

    # 4. Retornar como descarga
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename={batch_id}_RIPS.zip"
        }
    )
```

## Diseño Frontend

### Modificaciones en el componente de resultados del batch

**Nuevo estado:**
```tsx
const [downloadingRips, setDownloadingRips] = useState(false)
```

**Nueva función handler:**
```tsx
const handleDownloadRips = async () => {
  setDownloadingRips(true)
  try {
    const response = await fetch(`/api/batch/${batchId}/download-rips`)

    if (!response.ok) {
      throw new Error('No se encontraron archivos RIPS')
    }

    // Descargar el archivo
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${batchId}_RIPS.zip`
    a.click()
    window.URL.revokeObjectURL(url)
  } catch (error) {
    alert('Error al descargar RIPS: ' + error.message)
  } finally {
    setDownloadingRips(false)
  }
}
```

**Nuevo botón (junto al botón "Descargar Resultados"):**
```tsx
<button
  onClick={handleDownloadRips}
  disabled={downloadingRips}
  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
>
  {downloadingRips ? (
    <>
      <RefreshCw className="animate-spin" size={20} />
      Descargando RIPS...
    </>
  ) : (
    <>
      <FileJson size={20} />
      Descargar RIPS
    </>
  )}
</button>
```

## Estructura de Archivos

### Directorio temporal
```
backend/temp/
└── batch_rips/
    ├── batch_20260206_123456_15/
    │   ├── RIPS_817000162_NCS000123.json
    │   ├── RIPS_817000162_NCS000124.json
    │   └── RIPS_817000162_NCD000125.json
    └── batch_20260206_234567_20/
        └── ...
```

### Formato de nombres
- **Patrón:** `RIPS_{NIT}_{prefijo_nc}{numero_nc}.json`
- **Ejemplos:**
  - `RIPS_817000162_NCS000123.json`
  - `RIPS_900123456_NCD000789.json`
  - `RIPS_817000162_NCSDIAN001.json`

### Contenido del ZIP descargado
```
batch_20260206_123456_15_RIPS.zip
├── RIPS_817000162_NCS000123.json
├── RIPS_817000162_NCS000124.json
└── RIPS_817000162_NCD000125.json
```

## Política de Limpieza

**Estrategia:** Limpieza automática al descargar

- Después de generar el ZIP y antes de retornar la respuesta, se elimina la carpeta `backend/temp/batch_rips/{batch_id}/`
- Si la limpieza falla, se registra un warning pero no se interrumpe la descarga
- Esto evita acumulación de archivos temporales
- El usuario puede re-procesar el batch si necesita descargar nuevamente

## Manejo de Errores

### Backend
- **404:** Si el batch_id no existe o no tiene archivos RIPS
- **500:** Si hay error al crear el ZIP (poco probable con archivos en memoria)
- **Warning en logs:** Si falla la limpieza de la carpeta temporal

### Frontend
- **Alert:** Si el servidor retorna error 404 o cualquier otro error
- **Estado de carga:** Botón deshabilitado mientras descarga
- **Experiencia:** Descarga automática del archivo sin navegación

## Consideraciones de Implementación

1. **Orden de implementación:**
   - Backend primero (BatchProcessor + endpoint)
   - Frontend después (botón de descarga)

2. **Testing:**
   - Probar con diferentes prefijos NC (NCS, NCD, etc.)
   - Verificar formato de nombres de archivos
   - Confirmar limpieza automática funciona

3. **Compatibilidad:**
   - No afecta el procesamiento existente
   - No afecta la descarga de resultados existente
   - Es una funcionalidad adicional independiente

4. **Rendimiento:**
   - Archivos RIPS son pequeños (~5-50KB cada uno)
   - ZIP en memoria es eficiente para batches de ~100 carpetas
   - Para batches muy grandes (1000+), considerar streaming del ZIP

## Archivos a Modificar/Crear

### Backend
- ✏️ `backend/app/services/batch_processor.py`
  - Modificar `process_folder` (guardar RIPS)
  - Modificar `_read_folder_files` (devolver nombre archivo NC)
  - Agregar `_extraer_prefijo_nc` (nueva función)
  - Agregar `batch_id` como parámetro en métodos necesarios

- ✏️ `backend/app/api/batch_router.py`
  - Agregar endpoint `GET /batch/{batch_id}/download-rips`

### Frontend
- ✏️ Componente de resultados del batch (identificar cuál es)
  - Agregar estado `downloadingRips`
  - Agregar función `handleDownloadRips`
  - Agregar botón "Descargar RIPS"

### Crear directorio
- 📁 `backend/temp/batch_rips/` (se crea automáticamente)

## Validación del Diseño

✅ Usuario aprobó todas las secciones del diseño
✅ Arquitectura validada
✅ Implementación backend validada
✅ Implementación frontend validada
✅ Política de limpieza validada
