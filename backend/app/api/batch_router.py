"""
Batch API Router for processing multiple NC (Nota Crédito) folders.

This module provides REST API endpoints and WebSocket support for batch processing
of NC folders, including folder scanning, batch job management, progress tracking,
and result downloads.
"""

import asyncio
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any

import tempfile
import zipfile
import shutil

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.services.folder_scanner import FolderScanner, FolderInfo
from app.services.batch_processor import BatchProcessor, BatchState, BatchResult

router = APIRouter()
logger = logging.getLogger(__name__)

# Global state for batch processors
_batch_processors: Dict[str, BatchProcessor] = {}
_batch_states: Dict[str, BatchState] = {}

# WebSocket connections per batch
_websocket_connections: Dict[str, List[WebSocket]] = {}


# ============= Pydantic Models =============

class CarpetaInfo(BaseModel):
    """Information about a scanned folder."""
    nombre: str
    path: str
    archivos: Dict[str, str]
    es_caso_especial: bool
    estado: str


class ScanResponse(BaseModel):
    """Response model for folder scanning."""
    total: int
    carpetas: List[CarpetaInfo]
    errores_scan: List[str]
    batch_id: str
    errores_scan: List[str]


class BatchStartRequest(BaseModel):
    """Request model for starting a batch job."""
    batch_id: str = Field(..., description="Batch ID from upload-and-scan")
    carpetas: List[str] = Field(..., description="List of folder names to process")
    sispro_token: str = Field(..., description="SISPRO JWT token for ministry API")


class BatchStartResponse(BaseModel):
    """Response model for batch start."""
    batch_id: str
    estado: str
    total: int


class BatchDetalle(BaseModel):
    """Detail of a single folder processing result."""
    carpeta: str
    numero_nc: str
    exitoso: bool
    estado: str  # 'completado', 'error', 'pendiente'
    cuv: Optional[str] = None
    error: Optional[str] = None
    items_igualados_a_cero: Optional[int] = None


class BatchStatusResponse(BaseModel):
    """Response model for batch status."""
    batch_id: str
    estado: str
    progreso: int  # Porcentaje 0-100
    completadas: int  # Número de carpetas procesadas
    total: int
    exitosos: int
    errores: int
    rips_guardados: int = 0
    detalles: List[BatchDetalle]


# ============= Helper Functions =============

def _get_or_create_processor(batch_id: str) -> BatchProcessor:
    """Get or create a BatchProcessor for the given batch_id."""
    if batch_id not in _batch_processors:
        processor = BatchProcessor()
        processor.on_progress = lambda state: _on_progress_update(batch_id, state)
        _batch_processors[batch_id] = processor
    return _batch_processors[batch_id]


def _on_progress_update(batch_id: str, state: BatchState) -> None:
    """Handle progress updates and notify WebSocket clients."""
    _batch_states[batch_id] = state

    # Get the latest result
    if state.resultados:
        latest_result = state.resultados[-1]
        message = {
            "tipo": "progreso",
            "carpeta": latest_result.carpeta,
            "exitoso": latest_result.exitoso,
            "cuv": latest_result.cuv,
            "progreso": state.completadas,
            "total": state.total,
            "exitosos": state.exitosos,
            "errores": state.errores,
            "rips_guardados": state.rips_guardados
        }
        asyncio.create_task(_broadcast_to_batch(batch_id, message))

    # Check if completed
    if state.completadas >= state.total and not state.en_progreso:
        asyncio.create_task(_broadcast_to_batch(batch_id, {"tipo": "completado"}))


async def _broadcast_to_batch(batch_id: str, message: Dict[str, Any]) -> None:
    """Broadcast a message to all WebSocket connections for a batch."""
    if batch_id not in _websocket_connections:
        return

    disconnected = []
    for ws in _websocket_connections[batch_id]:
        try:
            await ws.send_json(message)
        except Exception as e:
            logger.warning(f"Failed to send WebSocket message: {e}")
            disconnected.append(ws)

    # Remove disconnected clients
    for ws in disconnected:
        if ws in _websocket_connections[batch_id]:
            _websocket_connections[batch_id].remove(ws)


# ============= API Endpoints =============

# Store uploaded ZIP paths by batch_id
_uploaded_zip_paths: Dict[str, str] = {}


@router.post("/upload-and-scan", response_model=ScanResponse)
async def upload_and_scan_zip(zip_file: UploadFile = File(...)) -> ScanResponse:
    """Upload a ZIP file and scan for NC folder structures.

    Uploads a ZIP containing NC folders, extracts it to a temp location,
    and returns information about all valid NC folders found.

    Args:
        zip_file: ZIP file containing the NC folder structure

    Returns:
        ScanResponse with total count, folder details, and batch_id
    """
    scanner = FolderScanner()
    errores: List[str] = []

    # Validate file is a ZIP
    if not zip_file.filename or not zip_file.filename.endswith('.zip'):
        raise HTTPException(status_code=400, detail="File must be a ZIP archive")

    # Create temp directory for extraction
    batch_id = f"batch_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    temp_dir = Path(tempfile.gettempdir()) / batch_id
    extract_dir = temp_dir / "extracted"

    try:
        # Save uploaded file
        temp_dir.mkdir(parents=True, exist_ok=True)
        zip_path = temp_dir / zip_file.filename

        with zip_path.open("wb") as buffer:
            shutil.copyfileobj(zip_file.file, buffer)

        logger.info(f"ZIP saved to {zip_path}")

        # Extract ZIP
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_dir)

        logger.info(f"ZIP extracted to {extract_dir}")

        # Find the parent folder (usually there's one main folder inside)
        parent_folder = extract_dir
        # Filter out __MACOSX and other system folders
        subdirs = [d for d in extract_dir.iterdir() if d.is_dir() and not d.name.startswith('__') and not d.name.startswith('.')]

        # If there's exactly one subdirectory, use it as the parent
        if len(subdirs) == 1:
            parent_folder = subdirs[0]
            logger.info(f"Using single subdirectory as parent: {parent_folder}")
        elif len(subdirs) > 1:
            logger.info(f"Multiple subdirectories found, using: {parent_folder}")
            logger.info(f"Subdirs: {[d.name for d in subdirs]}")

        # Scan for NC folders
        folders = scanner.scan_folder(str(parent_folder))

        if not folders:
            errores.append("No se encontraron carpetas válidas con los 3 archivos requeridos")

        carpetas = [
            CarpetaInfo(
                nombre=f.nombre,
                path=f.path,
                archivos={
                    "factura": Path(f.archivos["factura"]).name if f.archivos.get("factura") else "",
                    "nc": Path(f.archivos["nota_credito"]).name if f.archivos.get("nota_credito") else "",
                    "rips": Path(f.archivos["rips"]).name if f.archivos.get("rips") else ""
                },
                es_caso_especial=f.es_caso_especial,
                estado=f.estado
            )
            for f in folders
        ]

        # Store the extracted path for later processing
        _uploaded_zip_paths[batch_id] = str(parent_folder)

        return ScanResponse(
            total=len(carpetas),
            carpetas=carpetas,
            errores_scan=errores,
            batch_id=batch_id
        )

    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid ZIP file")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing ZIP: {e}")
        raise HTTPException(status_code=500, detail=f"Error processing ZIP: {str(e)}")
    finally:
        zip_file.file.close()


@router.post("/start", response_model=BatchStartResponse)
async def start_batch(request: BatchStartRequest) -> BatchStartResponse:
    """Start a batch processing job.

    Creates a new batch job and starts processing the specified folders
    in the background using asyncio.create_task.

    Args:
        request: BatchStartRequest with batch_id from upload-and-scan, carpetas list, and sispro_token

    Returns:
        BatchStartResponse with batch_id, estado, and total count
    """
    try:
        # Get the extracted folder path from the upload-and-scan step
        if request.batch_id not in _uploaded_zip_paths:
            raise HTTPException(status_code=404, detail=f"Batch ID not found: {request.batch_id}. Please upload and scan first.")

        folder_path = Path(_uploaded_zip_paths[request.batch_id])
        if not folder_path.exists():
            raise HTTPException(status_code=404, detail=f"Extracted folder not found: {folder_path}")

        # Scan all folders first to get FolderInfo objects
        scanner = FolderScanner()
        all_folders = scanner.scan_folder(str(folder_path))

        # Filter to only requested folders
        folder_map = {f.nombre: f for f in all_folders}
        selected_folders: List[FolderInfo] = []
        not_found: List[str] = []

        for carpeta_name in request.carpetas:
            if carpeta_name in folder_map:
                selected_folders.append(folder_map[carpeta_name])
            else:
                not_found.append(carpeta_name)

        if not selected_folders:
            raise HTTPException(
                status_code=400,
                detail=f"No valid folders found. Missing: {', '.join(not_found)}"
            )

        # Create batch processor and batch (use the same batch_id from upload-and-scan)
        processor = BatchProcessor()
        batch_id = processor.create_batch(selected_folders, batch_id=request.batch_id)

        # Store processor and set up progress callback
        processor.on_progress = lambda state: _on_progress_update(batch_id, state)
        _batch_processors[batch_id] = processor

        # Start processing in background
        async def process():
            try:
                await processor.process_batch(batch_id, selected_folders, request.sispro_token)
            except Exception as e:
                logger.error(f"Batch {batch_id} failed: {e}")
                state = processor.get_state(batch_id)
                if state:
                    state.en_progreso = False

        asyncio.create_task(process())

        return BatchStartResponse(
            batch_id=batch_id,
            estado="iniciado",
            total=len(selected_folders)
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting batch: {e}")
        raise HTTPException(status_code=500, detail=f"Error starting batch: {str(e)}")


@router.get("/status/{batch_id}", response_model=BatchStatusResponse)
async def get_batch_status(batch_id: str) -> BatchStatusResponse:
    """Get the status of a batch processing job.

    Returns current progress, success/error counts, and detailed results
    for each processed folder.

    Args:
        batch_id: Unique identifier for the batch job

    Returns:
        BatchStatusResponse with current state and details
    """
    processor = _batch_processors.get(batch_id)
    if not processor:
        raise HTTPException(status_code=404, detail=f"Batch not found: {batch_id}")

    state = processor.get_state(batch_id)
    if not state:
        raise HTTPException(status_code=404, detail=f"Batch state not found: {batch_id}")

    # Calculate progress percentage
    progreso = int((state.completadas / state.total) * 100) if state.total > 0 else 0

    # Determine estado
    if state.en_progreso:
        estado = "procesando"
    elif state.completadas >= state.total:
        estado = "completado"
    else:
        estado = "iniciado"

    # Build detalles
    detalles = [
        BatchDetalle(
            carpeta=r.carpeta,
            numero_nc=r.numero_nc,
            exitoso=r.exitoso,
            estado='completado' if r.exitoso else 'error',
            cuv=r.cuv,
            error=r.error,
            items_igualados_a_cero=r.items_igualados_a_cero if r.items_igualados_a_cero > 0 else None
        )
        for r in state.resultados
    ]

    # Count RIPS files saved
    rips_guardados = sum(1 for r in state.resultados if r.rips_guardado)

    return BatchStatusResponse(
        batch_id=batch_id,
        estado=estado,
        progreso=progreso,
        completadas=state.completadas,
        total=state.total,
        exitosos=state.exitosos,
        errores=state.errores,
        rips_guardados=rips_guardados,
        detalles=detalles
    )


@router.get("/download/{batch_id}")
async def download_results(batch_id: str) -> FileResponse:
    """Download batch results as a ZIP file.

    Generates and returns a ZIP file containing:
    - exitosos/CUV_{numero_nc}.json files for successful results
    - errores/errores.csv for failed results
    - resumen.txt with batch statistics

    Args:
        batch_id: Unique identifier for the batch job

    Returns:
        FileResponse with the ZIP file
    """
    processor = _batch_processors.get(batch_id)
    if not processor:
        raise HTTPException(status_code=404, detail=f"Batch not found: {batch_id}")

    state = processor.get_state(batch_id)
    if not state:
        raise HTTPException(status_code=404, detail=f"Batch state not found: {batch_id}")

    if state.en_progreso:
        raise HTTPException(status_code=400, detail="Batch is still in progress")

    try:
        # Create temp directory for ZIP if needed
        temp_dir = Path("/tmp/nc_processor/batches")
        temp_dir.mkdir(parents=True, exist_ok=True)

        # Generate ZIP file
        zip_path = processor.generate_zip(batch_id, str(temp_dir))

        if not os.path.exists(zip_path):
            raise HTTPException(status_code=500, detail="Failed to generate ZIP file")

        filename = f"{batch_id}_resultados.zip"

        return FileResponse(
            path=zip_path,
            filename=filename,
            media_type="application/zip"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating ZIP for batch {batch_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error generating ZIP: {str(e)}")


@router.get("/download-rips/{batch_id}")
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
    import re

    # SECURITY: Sanitize batch_id to prevent path traversal attacks
    # Note: We don't validate against _batch_processors because RIPS files
    # persist on disk and should be downloadable even after server restarts.
    sanitized_batch_id = re.sub(r'[^\w\-]', '_', str(batch_id))

    # Construct path with sanitized ID using absolute path
    # From batch_router.py: parent = api/, parent.parent = app/, parent.parent.parent = backend/
    # We need one more parent to get to project root
    project_root = Path(__file__).parent.parent.parent.parent
    rips_dir = project_root / "backend" / "temp" / "batch_rips" / sanitized_batch_id

    # Verify the resolved path is still within the expected directory (defense in depth)
    try:
        rips_dir_resolved = rips_dir.resolve()
        expected_base = (project_root / "backend" / "temp" / "batch_rips").resolve()
        if not str(rips_dir_resolved).startswith(str(expected_base)):
            raise HTTPException(status_code=403, detail="Invalid batch ID")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid batch ID format")

    # Check directory exists (use resolved path)
    if not rips_dir_resolved.exists():
        raise HTTPException(
            status_code=404,
            detail=f"No se encontraron archivos RIPS para el batch {batch_id}"
        )

    # Check if there are any RIPS files (use resolved path)
    rips_files = list(rips_dir_resolved.glob("RIPS_*.json"))
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

        # 3. Eliminar carpeta después de crear el ZIP (use resolved path)
        try:
            shutil.rmtree(rips_dir_resolved)
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


# ============= WebSocket Endpoint =============

@router.websocket("/ws/{batch_id}")
async def websocket_batch(websocket: WebSocket, batch_id: str):
    """WebSocket endpoint for real-time batch progress updates.

    Connect to receive real-time progress messages during batch processing:
    - Progress messages: {"tipo": "progreso", "carpeta": "...", "exitoso": true, "cuv": "..."}
    - Completion message: {"tipo": "completado"}

    Args:
        websocket: WebSocket connection
        batch_id: Unique identifier for the batch job
    """
    # Accept connection
    await websocket.accept()

    # Register connection
    if batch_id not in _websocket_connections:
        _websocket_connections[batch_id] = []
    _websocket_connections[batch_id].append(websocket)

    try:
        # Send current state immediately if available
        processor = _batch_processors.get(batch_id)
        if processor:
            state = processor.get_state(batch_id)
            if state:
                progreso = int((state.completadas / state.total) * 100) if state.total > 0 else 0
                await websocket.send_json({
                    "tipo": "estado",
                    "estado": "completado" if state.completadas >= state.total and not state.en_progreso else "procesando",
                    "progreso": progreso,
                    "total": state.total,
                    "completadas": state.completadas,
                    "exitosos": state.exitosos,
                    "errores": state.errores
                })

        # Keep connection alive and handle client messages
        while True:
            try:
                # Wait for messages from client (ping/keepalive)
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                # Echo back or handle commands
                if data == "ping":
                    await websocket.send_json({"tipo": "pong"})
            except asyncio.TimeoutError:
                # Send keepalive
                await websocket.send_json({"tipo": "ping"})
            except WebSocketDisconnect:
                break

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for batch {batch_id}")
    except Exception as e:
        logger.warning(f"WebSocket error for batch {batch_id}: {e}")
    finally:
        # Unregister connection
        if batch_id in _websocket_connections:
            if websocket in _websocket_connections[batch_id]:
                _websocket_connections[batch_id].remove(websocket)
            if not _websocket_connections[batch_id]:
                del _websocket_connections[batch_id]
