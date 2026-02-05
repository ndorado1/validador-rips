# Batch Processing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implementar procesamiento masivo de 170 carpetas con Notas Crédito, manteniendo toda la lógica existente.

**Architecture:** Backend-led con UI de monitoreo. Escanea carpetas, detecta casos especiales por patrón "LDL", procesa secuencialmente con re-login automático, genera ZIP de resultados.

**Tech Stack:** FastAPI (Python), React + TypeScript, WebSocket para progreso en tiempo real.

---

## Task 1: Backend - Folder Scanner Service

**Files:**
- Create: `backend/app/services/folder_scanner.py`
- Test: `backend/tests/test_folder_scanner.py`

**Step 1: Write the failing test**

```python
# backend/tests/test_folder_scanner.py
import pytest
import tempfile
import os
from pathlib import Path
from app.services.folder_scanner import FolderScanner, FolderInfo


def test_scan_folder_with_valid_structure():
    """Test scanning a folder with valid NC structure."""
    with tempfile.TemporaryDirectory() as tmpdir:
        # Create test folder structure
        nc_folder = Path(tmpdir) / "NC001234"
        nc_folder.mkdir()

        # Create files
        (nc_folder / "PMD_factura.xml").write_text("<factura/>")
        (nc_folder / "NC001234.xml").write_text("<nc/>")
        (nc_folder / "rips.json").write_text('{"rips": true}')

        scanner = FolderScanner()
        result = scanner.scan_folder(tmpdir)

        assert len(result) == 1
        assert result[0].nombre == "NC001234"
        assert result[0].es_caso_especial is False
        assert result[0].archivos["factura"] == "PMD_factura.xml"
        assert result[0].archivos["nc"] == "NC001234.xml"
        assert result[0].archivos["rips"] == "rips.json"


def test_scan_folder_detects_ldl_special_case():
    """Test that folders with 'LDL' in name are marked as special."""
    with tempfile.TemporaryDirectory() as tmpdir:
        nc_folder = Path(tmpdir) / "NC005678_LDL"
        nc_folder.mkdir()

        (nc_folder / "PMD_factura.xml").write_text("<factura/>")
        (nc_folder / "NC005678.xml").write_text("<nc/>")
        (nc_folder / "rips.json").write_text('{"rips": true}')

        scanner = FolderScanner()
        result = scanner.scan_folder(tmpdir)

        assert len(result) == 1
        assert result[0].es_caso_especial is True


def test_scan_folder_ignores_pdf_files():
    """Test that PDF files are ignored."""
    with tempfile.TemporaryDirectory() as tmpdir:
        nc_folder = Path(tmpdir) / "NC001234"
        nc_folder.mkdir()

        (nc_folder / "PMD_factura.xml").write_text("<factura/>")
        (nc_folder / "PMD_factura.pdf").write_text("pdf content")
        (nc_folder / "NC001234.xml").write_text("<nc/>")
        (nc_folder / "rips.json").write_text('{"rips": true}')

        scanner = FolderScanner()
        result = scanner.scan_folder(tmpdir)

        assert len(result) == 1
        assert result[0].archivos["factura"] == "PMD_factura.xml"
```

**Step 2: Run test to verify it fails**

```bash
cd /Users/personal/HMD/NC_processor/backend
python -m pytest tests/test_folder_scanner.py -v
```

Expected: FAIL with "ModuleNotFoundError: No module named 'app.services.folder_scanner'"

**Step 3: Write minimal implementation**

```python
# backend/app/services/folder_scanner.py
import os
from pathlib import Path
from dataclasses import dataclass
from typing import List, Dict, Optional


@dataclass
class FolderInfo:
    nombre: str
    path: str
    archivos: Dict[str, str]
    es_caso_especial: bool
    estado: str = "pendiente"
    error: Optional[str] = None


class FolderScanner:
    """Escanea carpetas buscando estructura de NC válida."""

    def scan_folder(self, parent_path: str) -> List[FolderInfo]:
        """Escanea carpeta padre buscando subcarpetas con NC."""
        resultados = []
        parent = Path(parent_path)

        if not parent.exists():
            return resultados

        for item in parent.iterdir():
            if not item.is_dir():
                continue

            folder_info = self._process_folder(item)
            if folder_info:
                resultados.append(folder_info)

        return sorted(resultados, key=lambda x: x.nombre)

    def _process_folder(self, folder_path: Path) -> Optional[FolderInfo]:
        """Procesa una carpeta individual buscando archivos."""
        archivos = {"factura": None, "nc": None, "rips": None}
        errores = []

        for file in folder_path.iterdir():
            if not file.is_file():
                continue

            name = file.name.upper()

            # Ignorar PDFs
            if file.suffix.lower() == ".pdf":
                continue

            # Detectar factura (contiene PMD)
            if "PMD" in name and file.suffix.lower() == ".xml":
                archivos["factura"] = file.name

            # Detectar nota crédito (contiene NC)
            elif "NC" in name and file.suffix.lower() == ".xml":
                archivos["nc"] = file.name

            # Detectar RIPS (único JSON)
            elif file.suffix.lower() == ".json":
                archivos["rips"] = file.name

        # Validar que tenemos los 3 archivos
        if all(archivos.values()):
            es_especial = "LDL" in folder_path.name.upper()
            return FolderInfo(
                nombre=folder_path.name,
                path=str(folder_path),
                archivos=archivos,
                es_caso_especial=es_especial
            )

        return None

    def validate_folder(self, folder_path: str) -> Dict[str, any]:
        """Valida una carpeta específica y retorna detalles."""
        folder = Path(folder_path)
        if not folder.exists():
            return {"valido": False, "error": "Carpeta no existe"}

        info = self._process_folder(folder)
        if info:
            return {"valido": True, "info": info}

        return {"valido": False, "error": "Estructura incompleta (faltan archivos)"}
```

**Step 4: Run test to verify it passes**

```bash
cd /Users/personal/HMD/NC_processor/backend
python -m pytest tests/test_folder_scanner.py -v
```

Expected: PASS (3 tests)

**Step 5: Commit**

```bash
cd /Users/personal/HMD/NC_processor
git add backend/app/services/folder_scanner.py backend/tests/test_folder_scanner.py
git commit -m "feat: add folder scanner service for batch processing"
```

---

## Task 2: Backend - Batch Processor Service

**Files:**
- Create: `backend/app/services/batch_processor.py`
- Modify: `backend/app/services/__init__.py`

**Step 1: Write the failing test**

```python
# backend/tests/test_batch_processor.py
import pytest
import tempfile
from pathlib import Path
from unittest.mock import Mock, AsyncMock
from app.services.batch_processor import BatchProcessor, BatchResult
from app.services.folder_scanner import FolderScanner


@pytest.mark.asyncio
async def test_process_single_folder_success():
    """Test processing a single folder successfully."""
    with tempfile.TemporaryDirectory() as tmpdir:
        # Setup test folder
        nc_folder = Path(tmpdir) / "NC001234"
        nc_folder.mkdir()
        (nc_folder / "PMD_factura.xml").write_text("<Invoice>...</Invoice>")
        (nc_folder / "NC001234.xml").write_text("<CreditNote>...</CreditNote>")
        (nc_folder / "rips.json").write_text('{"rips": {"factura": []}}')

        # Mock dependencies
        mock_nc_processor = Mock()
        mock_nc_processor.procesar_nc.return_value = Mock(
            success=True,
            nc_xml_completo="<xml/>",
            nc_rips_json={"rips": {}},
            numero_nota_credito="NC001234"
        )

        mock_ministerio = Mock()
        mock_ministerio.enviar_nc.return_value = Mock(
            success=True,
            result_state=True,
            codigo_unico_validacion="a1b2c3d4e5f6",
            raw_response={"ResultState": True}
        )

        processor = BatchProcessor(mock_nc_processor, mock_ministerio)
        result = await processor.process_folder(str(nc_folder), "token123", False)

        assert result.exitoso is True
        assert result.numero_nc == "NC001234"
        assert result.cuv == "a1b2c3d4e5f6"


@pytest.mark.asyncio
async def test_process_folder_handles_token_expiry():
    """Test that token expiry triggers re-login and retry."""
    with tempfile.TemporaryDirectory() as tmpdir:
        nc_folder = Path(tmpdir) / "NC001234"
        nc_folder.mkdir()
        (nc_folder / "PMD_factura.xml").write_text("<Invoice/>")
        (nc_folder / "NC001234.xml").write_text("<CreditNote/>")
        (nc_folder / "rips.json").write_text('{}')

        mock_nc_processor = Mock()
        mock_nc_processor.procesar_nc.return_value = Mock(
            success=True,
            nc_xml_completo="<xml/>",
            nc_rips_json={},
            numero_nota_credito="NC001234"
        )

        mock_ministerio = Mock()
        # First call fails with 401, second succeeds
        mock_ministerio.enviar_nc.side_effect = [
            Exception("401 Unauthorized"),
            Mock(success=True, result_state=True, codigo_unico_validacion="CUV123", raw_response={})
        ]

        processor = BatchProcessor(mock_nc_processor, mock_ministerio)
        processor.on_token_expired = AsyncMock(return_value="new_token")

        result = await processor.process_folder(str(nc_folder), "token123", False)

        assert result.exitoso is True
        assert processor.on_token_expired.called
```

**Step 2: Run test to verify it fails**

```bash
cd /Users/personal/HMD/NC_processor/backend
python -m pytest tests/test_batch_processor.py -v
```

Expected: FAIL with "ModuleNotFoundError"

**Step 3: Write minimal implementation**

```python
# backend/app/services/batch_processor.py
import os
import json
import asyncio
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Callable, Any
from datetime import datetime
import logging

from app.services.folder_scanner import FolderInfo
from app.processors.xml_processor import XMLProcessor
from app.processors.rips_processor import RIPSProcessor

logger = logging.getLogger(__name__)


@dataclass
class BatchResult:
    """Resultado de procesamiento de una carpeta."""
    carpeta: str
    numero_nc: str
    exitoso: bool
    cuv: Optional[str] = None
    error: Optional[str] = None
    es_caso_especial: bool = False
    raw_response: Optional[Dict] = None


@dataclass
class BatchState:
    """Estado completo del batch."""
    batch_id: str
    total: int
    completadas: int = 0
    exitosos: int = 0
    errores: int = 0
    resultados: List[BatchResult] = field(default_factory=list)
    en_progreso: bool = False
    token_sispro: Optional[str] = None


class BatchProcessor:
    """Orquesta el procesamiento masivo de NC."""

    def __init__(
        self,
        nc_service=None,
        ministerio_service=None
    ):
        self.nc_service = nc_service
        self.ministerio_service = ministerio_service
        self.on_token_expired: Optional[Callable[[], Any]] = None
        self.on_progress: Optional[Callable[[BatchResult], Any]] = None
        self._states: Dict[str, BatchState] = {}

    def create_batch(self, folders: List[FolderInfo]) -> str:
        """Crea un nuevo batch y retorna su ID."""
        batch_id = f"batch_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        self._states[batch_id] = BatchState(
            batch_id=batch_id,
            total=len(folders),
            resultados=[
                BatchResult(
                    carpeta=f.nombre,
                    numero_nc="",
                    exitoso=False,
                    es_caso_especial=f.es_caso_especial
                )
                for f in folders
            ]
        )
        return batch_id

    def get_state(self, batch_id: str) -> Optional[BatchState]:
        """Obtiene el estado de un batch."""
        return self._states.get(batch_id)

    async def process_batch(
        self,
        batch_id: str,
        folders: List[FolderInfo],
        token: str
    ):
        """Procesa todas las carpetas del batch secuencialmente."""
        state = self._states.get(batch_id)
        if not state:
            raise ValueError(f"Batch {batch_id} no encontrado")

        state.en_progreso = True
        state.token_sispro = token

        for i, folder in enumerate(folders):
            try:
                result = await self.process_folder(
                    folder.path,
                    state.token_sispro,
                    folder.es_caso_especial
                )
                result.es_caso_especial = folder.es_caso_especial

                # Actualizar estado
                state.resultados[i] = result
                state.completadas += 1

                if result.exitoso:
                    state.exitosos += 1
                else:
                    state.errores += 1

                # Notificar progreso
                if self.on_progress:
                    await self.on_progress(result)

            except Exception as e:
                logger.error(f"Error procesando {folder.nombre}: {e}")
                state.resultados[i].error = str(e)
                state.completadas += 1
                state.errores += 1

        state.en_progreso = False

    async def process_folder(
        self,
        folder_path: str,
        token: str,
        es_caso_especial: bool
    ) -> BatchResult:
        """Procesa una carpeta individual."""
        folder = Path(folder_path)
        nombre_carpeta = folder.name

        try:
            # Leer archivos
            archivos = self._read_folder_files(folder)

            # Procesar NC (reutilizar lógica existente)
            from app.api.nc_router import procesar_nc_logic

            resultado_nc = await procesar_nc_logic(
                nc_xml_content=archivos["nc"],
                factura_xml_content=archivos["factura"],
                rips_content=archivos["rips"],
                es_caso_colesterol=es_caso_especial
            )

            if not resultado_nc.success:
                return BatchResult(
                    carpeta=nombre_carpeta,
                    numero_nc=resultado_nc.numero_nota_credito or "",
                    exitoso=False,
                    error="Error procesando NC",
                    es_caso_especial=es_caso_especial
                )

            # Enviar a ministerio
            try:
                from app.services.validationApi import xmlToBase64

                payload = {
                    "rips": resultado_nc.nc_rips_json,
                    "xmlFevFile": xmlToBase64(resultado_nc.nc_xml_completo)
                }

                ministerio_result = await self.ministerio_service.enviar_nc(
                    payload, token
                )

                return BatchResult(
                    carpeta=nombre_carpeta,
                    numero_nc=resultado_nc.numero_nota_credito,
                    exitoso=ministerio_result.success,
                    cuv=ministerio_result.codigo_unico_validacion,
                    es_caso_especial=es_caso_especial,
                    raw_response=ministerio_result.raw_response
                )

            except Exception as e:
                error_msg = str(e)

                # Detectar token expirado
                if "401" in error_msg or "unauthorized" in error_msg.lower():
                    if self.on_token_expired:
                        new_token = await self.on_token_expired()
                        if new_token:
                            # Reintentar con nuevo token
                            return await self.process_folder(
                                folder_path, new_token, es_caso_especial
                            )

                return BatchResult(
                    carpeta=nombre_carpeta,
                    numero_nc=resultado_nc.numero_nota_credito,
                    exitoso=False,
                    error=f"Error ministerio: {error_msg}",
                    es_caso_especial=es_caso_especial
                )

        except Exception as e:
            logger.error(f"Error en process_folder: {e}")
            return BatchResult(
                carpeta=nombre_carpeta,
                numero_nc="",
                exitoso=False,
                error=str(e),
                es_caso_especial=es_caso_especial
            )

    def _read_folder_files(self, folder: Path) -> Dict[str, str]:
        """Lee los 3 archivos de una carpeta."""
        archivos = {}

        for file in folder.iterdir():
            if not file.is_file():
                continue

            name = file.name.upper()

            if file.suffix.lower() == ".pdf":
                continue

            if "PMD" in name and file.suffix.lower() == ".xml":
                archivos["factura"] = file.read_text(encoding='utf-8')
            elif "NC" in name and file.suffix.lower() == ".xml":
                archivos["nc"] = file.read_text(encoding='utf-8')
            elif file.suffix.lower() == ".json":
                archivos["rips"] = file.read_text(encoding='utf-8')

        if len(archivos) != 3:
            raise ValueError(f"Carpeta {folder.name} no tiene los 3 archivos requeridos")

        return archivos

    def generate_zip(self, batch_id: str, output_path: str) -> str:
        """Genera ZIP con resultados del batch."""
        import zipfile

        state = self._states.get(batch_id)
        if not state:
            raise ValueError(f"Batch {batch_id} no encontrado")

        zip_path = os.path.join(output_path, f"{batch_id}_resultados.zip")

        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            # Agregar JSONs exitosos
            for result in state.resultados:
                if result.exitoso and result.raw_response:
                    filename = f"exitosos/CUV_{result.numero_nc}.json"
                    content = json.dumps(result.raw_response, indent=2)
                    zf.writestr(filename, content)

            # Agregar CSV de errores
            errores_csv = self._generate_errors_csv(state.resultados)
            zf.writestr("errores/errores.csv", errores_csv)

            # Agregar resumen
            resumen = self._generate_summary(state)
            zf.writestr("resumen.txt", resumen)

        return zip_path

    def _generate_errors_csv(self, resultados: List[BatchResult]) -> str:
        """Genera CSV con errores."""
        lines = ["carpeta,numero_nc,error"]
        for r in resultados:
            if not r.exitoso:
                error = (r.error or "").replace('"', '""')
                lines.append(f'"{r.carpeta}","{r.numero_nc}","{error}"')
        return "\n".join(lines)

    def _generate_summary(self, state: BatchState) -> str:
        """Genera resumen del batch."""
        lines = [
            "RESUMEN DE PROCESAMIENTO BATCH",
            "=" * 40,
            f"Batch ID: {state.batch_id}",
            f"Fecha: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            "",
            "ESTADÍSTICAS:",
            f"  Total carpetas: {state.total}",
            f"  Exitosos: {state.exitosos}",
            f"  Errores: {state.errores}",
            f"  Tasa de éxito: {(state.exitosos/state.total*100):.1f}%"
        ]
        return "\n".join(lines)
```

**Step 4: Run test to verify it passes**

```bash
cd /Users/personal/HMD/NC_processor/backend
python -m pytest tests/test_batch_processor.py -v
```

Expected: PASS (2 tests)

**Step 5: Commit**

```bash
cd /Users/personal/HMD/NC_processor
git add backend/app/services/batch_processor.py backend/tests/test_batch_processor.py
git commit -m "feat: add batch processor service with re-login support"
```

---

## Task 3: Backend - Batch API Router

**Files:**
- Create: `backend/app/api/batch_router.py`
- Modify: `backend/app/main.py:29`
- Modify: `backend/app/api/__init__.py`

**Step 1: Create the router**

```python
# backend/app/api/batch_router.py
import os
import asyncio
from typing import List, Optional
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from app.services.folder_scanner import FolderScanner, FolderInfo
from app.services.batch_processor import BatchProcessor, BatchState
from app.services.ministerio_service import MinisterioService

router = APIRouter()

# Estado global de batches (en producción usar Redis)
_batch_processors: dict = {}


class ScanRequest(BaseModel):
    folder_path: str


class ScanResponse(BaseModel):
    total: int
    carpetas: List[dict]
    errores_scan: List[str]


class BatchStartRequest(BaseModel):
    folder_path: str
    carpetas: List[str]  # Nombres de carpetas a procesar
    sispro_token: str


class BatchStartResponse(BaseModel):
    batch_id: str
    estado: str
    total: int


class BatchStatusResponse(BaseModel):
    batch_id: str
    estado: str  # pendiente, procesando, completado
    progreso: int
    total: int
    exitosos: int
    errores: int
    detalles: List[dict]


@router.post("/scan", response_model=ScanResponse)
async def scan_folders(request: ScanRequest):
    """Escanea carpeta padre buscando estructuras de NC."""
    if not os.path.exists(request.folder_path):
        raise HTTPException(status_code=400, detail="Carpeta no existe")

    scanner = FolderScanner()
    carpetas = scanner.scan_folder(request.folder_path)

    return ScanResponse(
        total=len(carpetas),
        carpetas=[
            {
                "nombre": c.nombre,
                "path": c.path,
                "archivos": c.archivos,
                "es_caso_especial": c.es_caso_especial
            }
            for c in carpetas
        ],
        errores_scan=[]
    )


@router.post("/start", response_model=BatchStartResponse)
async def start_batch(request: BatchStartRequest):
    """Inicia un batch de procesamiento."""
    # Crear processor
    ministerio = MinisterioService()
    processor = BatchProcessor(ministerio_service=ministerio)

    # Escanear carpetas seleccionadas
    scanner = FolderScanner()
    todas_carpetas = scanner.scan_folder(request.folder_path)
    carpetas_filtradas = [
        c for c in todas_carpetas
        if c.nombre in request.carpetas
    ]

    if not carpetas_filtradas:
        raise HTTPException(status_code=400, detail="No se encontraron carpetas válidas")

    # Crear batch
    batch_id = processor.create_batch(carpetas_filtradas)
    _batch_processors[batch_id] = processor

    # Iniciar procesamiento en background
    asyncio.create_task(
        processor.process_batch(batch_id, carpetas_filtradas, request.sispro_token)
    )

    return BatchStartResponse(
        batch_id=batch_id,
        estado="iniciado",
        total=len(carpetas_filtradas)
    )


@router.get("/status/{batch_id}", response_model=BatchStatusResponse)
async def get_batch_status(batch_id: str):
    """Obtiene estado de un batch en progreso."""
    processor = _batch_processors.get(batch_id)
    if not processor:
        raise HTTPException(status_code=404, detail="Batch no encontrado")

    state = processor.get_state(batch_id)
    if not state:
        raise HTTPException(status_code=404, detail="Estado no encontrado")

    estado_str = "completado" if not state.en_progreso and state.completadas > 0 else (
        "procesando" if state.en_progreso else "pendiente"
    )

    return BatchStatusResponse(
        batch_id=batch_id,
        estado=estado_str,
        progreso=state.completadas,
        total=state.total,
        exitosos=state.exitosos,
        errores=state.errores,
        detalles=[
            {
                "carpeta": r.carpeta,
                "estado": "EXITOSO" if r.exitoso else "ERROR",
                "cuv": r.cuv,
                "error": r.error,
                "es_caso_especial": r.es_caso_especial
            }
            for r in state.resultados
        ]
    )


@router.get("/download/{batch_id}")
async def download_batch_results(batch_id: str):
    """Descarga ZIP con resultados del batch."""
    from fastapi.responses import FileResponse

    processor = _batch_processors.get(batch_id)
    if not processor:
        raise HTTPException(status_code=404, detail="Batch no encontrado")

    state = processor.get_state(batch_id)
    if not state:
        raise HTTPException(status_code=404, detail="Estado no encontrado")

    if state.en_progreso:
        raise HTTPException(status_code=400, detail="Batch aún en progreso")

    # Generar ZIP temporal
    import tempfile
    temp_dir = tempfile.gettempdir()
    zip_path = processor.generate_zip(batch_id, temp_dir)

    return FileResponse(
        zip_path,
        media_type="application/zip",
        filename=f"{batch_id}_resultados.zip"
    )


@router.websocket("/ws/{batch_id}")
async def websocket_batch(websocket: WebSocket, batch_id: str):
    """WebSocket para progreso en tiempo real."""
    await websocket.accept()

    processor = _batch_processors.get(batch_id)
    if not processor:
        await websocket.close(code=4004, reason="Batch no encontrado")
        return

    async def on_progress(result):
        await websocket.send_json({
            "tipo": "progreso",
            "carpeta": result.carpeta,
            "exitoso": result.exitoso,
            "cuv": result.cuv,
            "error": result.error
        })

    processor.on_progress = on_progress

    try:
        # Mantener conexión abierta hasta que termine
        state = processor.get_state(batch_id)
        while state and state.en_progreso:
            await asyncio.sleep(1)
            state = processor.get_state(batch_id)

        # Enviar mensaje de completado
        await websocket.send_json({"tipo": "completado"})

    except WebSocketDisconnect:
        pass
```

**Step 2: Update main.py to include router**

```python
# backend/app/main.py:5
from app.api import nc_router, validation_router, correccion_router, batch_router

# backend/app/main.py:30
app.include_router(batch_router.router, prefix="/api/batch", tags=["Batch Processing"])
```

**Step 3: Update api __init__.py**

```python
# backend/app/api/__init__.py
from app.api import nc_router, validation_router, correccion_router, batch_router
```

**Step 4: Test the endpoints**

```bash
cd /Users/personal/HMD/NC_processor/backend
python -c "from app.api.batch_router import router; print('Router OK')"
```

Expected: "Router OK"

**Step 5: Commit**

```bash
cd /Users/personal/HMD/NC_processor
git add backend/app/api/batch_router.py backend/app/main.py backend/app/api/__init__.py
git commit -m "feat: add batch API router with WebSocket support"
```

---

## Task 4: Frontend - Batch Service API

**Files:**
- Create: `frontend/src/services/batchApi.ts`

**Step 1: Write the service**

```typescript
// frontend/src/services/batchApi.ts
import axios from 'axios'

const BATCH_API_URL = '/api/batch'

export interface FolderInfo {
  nombre: string
  path: string
  archivos: {
    factura: string
    nc: string
    rips: string
  }
  es_caso_especial: boolean
}

export interface ScanResponse {
  total: number
  carpetas: FolderInfo[]
  errores_scan: string[]
}

export interface BatchStartRequest {
  folder_path: string
  carpetas: string[]
  sispro_token: string
}

export interface BatchStartResponse {
  batch_id: string
  estado: string
  total: number
}

export interface BatchStatusResponse {
  batch_id: string
  estado: string
  progreso: number
  total: number
  exitosos: number
  errores: number
  detalles: Array<{
    carpeta: string
    estado: string
    cuv?: string
    error?: string
    es_caso_especial: boolean
  }>
}

export async function scanFolders(folderPath: string): Promise<ScanResponse> {
  const response = await axios.post<ScanResponse>(`${BATCH_API_URL}/scan`, {
    folder_path: folderPath
  })
  return response.data
}

export async function startBatch(request: BatchStartRequest): Promise<BatchStartResponse> {
  const response = await axios.post<BatchStartResponse>(`${BATCH_API_URL}/start`, request)
  return response.data
}

export async function getBatchStatus(batchId: string): Promise<BatchStatusResponse> {
  const response = await axios.get<BatchStatusResponse>(`${BATCH_API_URL}/status/${batchId}`)
  return response.data
}

export function downloadBatchResults(batchId: string): string {
  return `${BATCH_API_URL}/download/${batchId}`
}

export function createBatchWebSocket(batchId: string): WebSocket {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${wsProtocol}//${window.location.host}${BATCH_API_URL}/ws/${batchId}`
  return new WebSocket(wsUrl)
}
```

**Step 2: Test compilation**

```bash
cd /Users/personal/HMD/NC_processor/frontend
npx tsc --noEmit src/services/batchApi.ts
```

Expected: No errors

**Step 3: Commit**

```bash
cd /Users/personal/HMD/NC_processor
git add frontend/src/services/batchApi.ts
git commit -m "feat: add batch API service for frontend"
```

---

## Task 5: Frontend - Batch Processing Panel Component

**Files:**
- Create: `frontend/src/components/BatchProcessor/BatchUploadPanel.tsx`
- Create: `frontend/src/components/BatchProcessor/index.ts`

**Step 1: Write the component**

```tsx
// frontend/src/components/BatchProcessor/BatchUploadPanel.tsx
import { useState, useRef } from 'react'
import { FolderOpen, RefreshCw, AlertCircle } from 'lucide-react'
import { scanFolders, type FolderInfo } from '../../services/batchApi'

interface BatchUploadPanelProps {
  onFoldersSelected: (folders: FolderInfo[], path: string) => void
}

export default function BatchUploadPanel({ onFoldersSelected }: BatchUploadPanelProps) {
  const [folderPath, setFolderPath] = useState('')
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSelectFolder = () => {
    // Usar un input de tipo file con webkitdirectory
    inputRef.current?.click()
  }

  const handleFolderChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    // Obtener path de la carpeta padre
    const firstFile = files[0]
    const path = firstFile.webkitRelativePath.split('/')[0]

    // En un entorno real, necesitaríamos una API del sistema de archivos
    // Por ahora, simulamos con el path
    setFolderPath(path)
    setError(null)

    // Escanear
    setScanning(true)
    try {
      // Nota: En producción, el path vendría de una API de sistema de archivos
      // o de un file picker nativo. Aquí usamos un mock.
      const result = await scanFolders(`/uploads/${path}`)
      onFoldersSelected(result.carpetas, `/uploads/${path}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error escaneando carpetas')
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
        <FolderOpen className="text-blue-600" />
        Procesamiento Masivo
      </h2>

      <p className="text-gray-600 mb-4">
        Selecciona la carpeta padre que contiene las subcarpetas con los archivos
        (Factura XML, Nota Crédito XML, RIPS JSON).
      </p>

      <div className="flex gap-3">
        <input
          ref={inputRef}
          type="file"
          webkitdirectory=""
          directory=""
          multiple
          className="hidden"
          onChange={handleFolderChange}
        />
        <button
          onClick={handleSelectFolder}
          disabled={scanning}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {scanning ? (
            <RefreshCw className="animate-spin" size={18} />
          ) : (
            <FolderOpen size={18} />
          )}
          {scanning ? 'Escaneando...' : 'Seleccionar Carpeta'}
        </button>
      </div>

      {folderPath && (
        <p className="mt-3 text-sm text-gray-600">
          Carpeta seleccionada: <code className="bg-gray-100 px-2 py-1 rounded">{folderPath}</code>
        </p>
      )}

      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle size={18} />
          {error}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Create index file**

```typescript
// frontend/src/components/BatchProcessor/index.ts
export { default as BatchUploadPanel } from './BatchUploadPanel'
```

**Step 3: Test compilation**

```bash
cd /Users/personal/HMD/NC_processor/frontend
npx tsc --noEmit src/components/BatchProcessor/BatchUploadPanel.tsx
```

Expected: No errors

**Step 4: Commit**

```bash
cd /Users/personal/HMD/NC_processor
git add frontend/src/components/BatchProcessor/
git commit -m "feat: add batch upload panel component"
```

---

## Task 6: Frontend - Batch Progress Component

**Files:**
- Create: `frontend/src/components/BatchProcessor/BatchProgress.tsx`

**Step 1: Write the component**

```tsx
// frontend/src/components/BatchProcessor/BatchProgress.tsx
import { useState, useEffect, useCallback } from 'react'
import { Play, Pause, Download, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import type { FolderInfo, BatchStatusResponse } from '../../services/batchApi'
import { startBatch, getBatchStatus, downloadBatchResults, createBatchWebSocket } from '../../services/batchApi'
import SisproLoginModal from '../SisproLoginModal'

interface BatchProgressProps {
  folders: FolderInfo[]
  folderPath: string
}

export default function BatchProgress({ folders, folderPath }: BatchProgressProps) {
  const [batchId, setBatchId] = useState<string | null>(null)
  const [status, setStatus] = useState<BatchStatusResponse | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())

  const toggleFolder = (nombre: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(nombre)) {
        next.delete(nombre)
      } else {
        next.add(nombre)
      }
      return next
    })
  }

  const handleLoginSuccess = async (newToken: string) => {
    setToken(newToken)
    setShowLogin(false)
    await startProcessing(newToken)
  }

  const startProcessing = async (authToken: string) => {
    try {
      const result = await startBatch({
        folder_path: folderPath,
        carpetas: folders.map(f => f.nombre),
        sispro_token: authToken
      })

      setBatchId(result.batch_id)
      setIsRunning(true)

      // Conectar WebSocket
      const ws = createBatchWebSocket(result.batch_id)
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        if (data.tipo === 'progreso') {
          // Actualizar estado en tiempo real
          fetchStatus(result.batch_id)
        } else if (data.tipo === 'completado') {
          setIsRunning(false)
          ws.close()
        }
      }
    } catch (err) {
      alert('Error iniciando batch: ' + (err instanceof Error ? err.message : 'Error desconocido'))
    }
  }

  const fetchStatus = useCallback(async (id: string) => {
    try {
      const newStatus = await getBatchStatus(id)
      setStatus(newStatus)
    } catch (err) {
      console.error('Error fetching status:', err)
    }
  }, [])

  useEffect(() => {
    if (batchId && isRunning) {
      const interval = setInterval(() => fetchStatus(batchId), 2000)
      return () => clearInterval(interval)
    }
  }, [batchId, isRunning, fetchStatus])

  const progress = status
    ? Math.round((status.progreso / status.total) * 100)
    : 0

  const ldlCount = folders.filter(f => f.es_caso_especial).length

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mt-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold">Progreso del Batch</h3>
          <p className="text-sm text-gray-600">
            {folders.length} carpetas • {ldlCount} casos especiales (LDL)
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!token ? (
            <button
              onClick={() => setShowLogin(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <Play size={18} />
              Iniciar
            </button>
          ) : isRunning ? (
            <span className="flex items-center gap-2 text-blue-600">
              <Loader2 className="animate-spin" size={18} />
              Procesando...
            </span>
          ) : status?.estado === 'completado' ? (
            <a
              href={downloadBatchResults(batchId!)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              <Download size={18} />
              Descargar Resultados
            </a>
          ) : (
            <button
              onClick={() => startProcessing(token)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <Play size={18} />
              Iniciar
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex justify-between text-sm mb-1">
          <span>{status?.progreso || 0} / {folders.length}</span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="p-3 bg-green-50 rounded-lg text-center">
          <p className="text-2xl font-bold text-green-600">{status?.exitosos || 0}</p>
          <p className="text-sm text-green-700">Éxitos</p>
        </div>
        <div className="p-3 bg-red-50 rounded-lg text-center">
          <p className="text-2xl font-bold text-red-600">{status?.errores || 0}</p>
          <p className="text-sm text-red-700">Errores</p>
        </div>
        <div className="p-3 bg-blue-50 rounded-lg text-center">
          <p className="text-2xl font-bold text-blue-600">{ldlCount}</p>
          <p className="text-sm text-blue-700">LDL</p>
        </div>
      </div>

      {/* Folder List */}
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-4 py-2 font-medium text-sm">
          Detalles por carpeta
        </div>
        <div className="max-h-96 overflow-y-auto">
          {folders.map((folder, idx) => {
            const detail = status?.detalles?.find(d => d.carpeta === folder.nombre)
            const isExpanded = expandedFolders.has(folder.nombre)

            return (
              <div key={folder.nombre} className="border-t">
                <button
                  onClick={() => toggleFolder(folder.nombre)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{folder.nombre}</span>
                    {folder.es_caso_especial && (
                      <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded">
                        LDL
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {detail?.estado === 'EXITOSO' && (
                      <CheckCircle className="text-green-600" size={18} />
                    )}
                    {detail?.estado === 'ERROR' && (
                      <XCircle className="text-red-600" size={18} />
                    )}
                    {!detail && <span className="text-gray-400 text-sm">Pendiente</span>}
                    <span className="text-gray-400">{isExpanded ? '▼' : '▶'}</span>
                  </div>
                </button>

                {isExpanded && detail && (
                  <div className="px-4 py-3 bg-gray-50 text-sm">
                    <p><strong>Archivos:</strong> {folder.archivos.factura}, {folder.archivos.nc}, {folder.archivos.rips}</p>
                    {detail.cuv && (
                      <p><strong>CUV:</strong> <code className="bg-white px-1 rounded">{detail.cuv.substring(0, 16)}...</code></p>
                    )}
                    {detail.error && (
                      <p className="text-red-600"><strong>Error:</strong> {detail.error}</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Login Modal */}
      <SisproLoginModal
        isOpen={showLogin}
        onClose={() => setShowLogin(false)}
        onLoginSuccess={handleLoginSuccess}
      />
    </div>
  )
}
```

**Step 2: Update index.ts**

```typescript
// frontend/src/components/BatchProcessor/index.ts
export { default as BatchUploadPanel } from './BatchUploadPanel'
export { default as BatchProgress } from './BatchProgress'
```

**Step 3: Test compilation**

```bash
cd /Users/personal/HMD/NC_processor/frontend
npx tsc --noEmit src/components/BatchProcessor/BatchProgress.tsx
```

Expected: No errors

**Step 4: Commit**

```bash
cd /Users/personal/HMD/NC_processor
git add frontend/src/components/BatchProcessor/
git commit -m "feat: add batch progress component with WebSocket support"
```

---

## Task 7: Frontend - Integrate Batch Processing in App.tsx

**Files:**
- Modify: `frontend/src/App.tsx:1-20`
- Modify: `frontend/src/App.tsx:180-210`

**Step 1: Add imports and state**

```typescript
// frontend/src/App.tsx:1
import { useState } from 'react'
import FileUpload from './components/FileUpload'
import ResultsView from './components/ResultsView'
import SisproLoginModal from './components/SisproLoginModal'
import ValidationReview from './components/ValidationReview'
import ValidationResults from './components/ValidationResults'
import CorreccionPanel, { type ManualCorrection } from './components/CorreccionPanel'
import { BatchUploadPanel, BatchProgress } from './components/BatchProcessor'
import { ValidationProvider, useValidation } from './context/ValidationContext'
import { procesarNC, downloadFile, downloadJSON } from './utils/api'
import { enviarNCMinisterio, xmlToBase64, analizarErrores, aplicarCorrecciones } from './services/validationApi'
import type { ProcessNCResponse } from './utils/api'
import type { NCValidationResponse, CambioAprobado, CorreccionResponse } from './services/validationApi'
import type { FolderInfo } from './services/batchApi'
import { Sparkles, Home } from 'lucide-react'
```

**Step 2: Add batch state**

```typescript
// frontend/src/App.tsx:30 (inside AppContent function)
  // Estados para procesamiento masivo
  const [showBatchMode, setShowBatchMode] = useState(false)
  const [batchFolders, setBatchFolders] = useState<FolderInfo[]>([])
  const [batchPath, setBatchPath] = useState('')
```

**Step 3: Add batch handlers**

```typescript
// frontend/src/App.tsx:180 (after handleReset)
  const handleFoldersSelected = (folders: FolderInfo[], path: string) => {
    setBatchFolders(folders)
    setBatchPath(path)
  }
```

**Step 4: Add UI for batch mode toggle**

```tsx
// frontend/src/App.tsx:200 (inside return, after header)
        {/* Toggle Mode */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setShowBatchMode(false)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                !showBatchMode
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Individual
            </button>
            <button
              onClick={() => setShowBatchMode(true)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                showBatchMode
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Masivo (Batch)
            </button>
          </div>
        </div>

        {/* Batch Mode */}
        {showBatchMode && (
          <>
            <BatchUploadPanel onFoldersSelected={handleFoldersSelected} />
            {batchFolders.length > 0 && (
              <BatchProgress folders={batchFolders} folderPath={batchPath} />
            )}
          </>
        )}

        {/* Individual Mode */}
        {!showBatchMode && (
          <>
            {/* File Upload Section */}
            {!result && (
              <FileUpload
                ...
              />
            )}
            ...
          </>
        )}
```

**Step 5: Test compilation**

```bash
cd /Users/personal/HMD/NC_processor/frontend
npx tsc --noEmit src/App.tsx
```

Expected: No errors

**Step 6: Commit**

```bash
cd /Users/personal/HMD/NC_processor
git add frontend/src/App.tsx
git commit -m "feat: integrate batch processing in main app with mode toggle"
```

---

## Task 8: Testing - End-to-End Test

**Files:**
- Create: `backend/tests/test_batch_integration.py`

**Step 1: Write integration test**

```python
# backend/tests/test_batch_integration.py
import pytest
import tempfile
from pathlib import Path
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_batch_full_flow():
    """Test completo: scan -> start -> status -> download."""
    with tempfile.TemporaryDirectory() as tmpdir:
        # Crear estructura de carpetas
        for i in range(3):
            folder = Path(tmpdir) / f"NC{i:04d}"
            folder.mkdir()
            (folder / f"PMD_factura_{i}.xml").write_text("<Invoice/>")
            (folder / f"NC{i:04d}.xml").write_text("<CreditNote/>")
            (folder / "rips.json").write_text('{"rips": {}}')

        # Crear una carpeta LDL
        ldl_folder = Path(tmpdir) / "NC9999_LDL"
        ldl_folder.mkdir()
        (ldl_folder / "PMD_factura.xml").write_text("<Invoice/>")
        (ldl_folder / "NC9999.xml").write_text("<CreditNote/>")
        (ldl_folder / "rips.json").write_text('{"rips": {}}')

        # 1. Scan
        response = client.post("/api/batch/scan", json={"folder_path": tmpdir})
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 4
        assert any(c["es_caso_especial"] for c in data["carpetas"])

        print(f"✓ Scan encontró {data['total']} carpetas")


if __name__ == "__main__":
    test_batch_full_flow()
    print("✓ Test de integración pasó")
```

**Step 2: Run test**

```bash
cd /Users/personal/HMD/NC_processor/backend
python tests/test_batch_integration.py
```

Expected: "✓ Test de integración pasó"

**Step 3: Commit**

```bash
cd /Users/personal/HMD/NC_processor
git add backend/tests/test_batch_integration.py
git commit -m "test: add batch integration test"
```

---

## Summary

Plan completo con 8 tareas para implementar procesamiento masivo:

| Task | Componente | Descripción |
|------|------------|-------------|
| 1 | `folder_scanner.py` | Escanea carpetas, detecta LDL |
| 2 | `batch_processor.py` | Orquesta procesamiento con re-login |
| 3 | `batch_router.py` | API REST + WebSocket |
| 4 | `batchApi.ts` | Cliente HTTP frontend |
| 5 | `BatchUploadPanel.tsx` | Selección de carpeta |
| 6 | `BatchProgress.tsx` | Monitoreo con lista expandible |
| 7 | `App.tsx` | Integración con toggle modo |
| 8 | `test_batch_integration.py` | Test E2E |

**Características implementadas:**
- ✅ Detección automática de casos especiales (LDL)
- ✅ Identificación por patrones (PMD, NC)
- ✅ Re-login automático si expira token
- ✅ Lista expandible de carpetas
- ✅ Progreso en tiempo real (WebSocket)
- ✅ Descarga ZIP con resultados
- ✅ Reporte CSV de errores

**Plan guardado en:** `docs/plans/2026-02-04-batch-processing-implementation.md`

---

**¿Listo para ejecutar este plan?**

Tengo dos opciones:

1. **Subagent-Driven (esta sesión)** - Ejecuto cada tarea con subagentes, reviso entre tareas, iteración rápida

2. **Parallel Session (sesión separada)** - Abres nueva sesión en el worktree y usas `superpowers:executing-plans` para ejecución batch con checkpoints

¿Cuál prefieres?