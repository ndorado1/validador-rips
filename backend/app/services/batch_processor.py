"""
Batch Processor Service for processing multiple NC (Nota Crédito) folders.

This module provides functionality to orchestrate the batch processing of NC folders,
including token management, progress tracking, and result generation.
"""

import asyncio
import base64
import csv
import io
import json
import logging
import os
import re
import zipfile
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Callable, Dict, List, Optional, Any

from app.api.nc_router import _extract_nc_number
from app.models import NCPayload
from app.services.folder_scanner import FolderInfo
from app.services.ministerio_service import MinisterioService

logger = logging.getLogger(__name__)


@dataclass
class BatchResult:
    """Result of processing a single folder.

    Attributes:
        carpeta: Name/path of the folder
        numero_nc: NC number extracted from XML
        exitoso: True if processing was successful
        cuv: Unique validation code (CUV) from ministry (if successful)
        error: Error message (if failed)
        es_caso_especial: True if this was a special case folder
        raw_response: Raw response from ministry API
    """
    carpeta: str
    numero_nc: str
    exitoso: bool
    cuv: Optional[str] = None
    error: Optional[str] = None
    es_caso_especial: bool = False
    raw_response: Optional[Dict] = None
    items_igualados_a_cero: int = 0


@dataclass
class BatchState:
    """State of a batch processing job.

    Attributes:
        batch_id: Unique identifier for the batch
        total: Total number of folders to process
        completadas: Number of folders processed so far
        exitosos: Number of successful processed folders
        errores: Number of failed folders
        resultados: List of BatchResult objects
        en_progreso: True if batch is currently being processed
        token_sispro: SISPRO token for ministry API
    """
    batch_id: str
    total: int
    completadas: int = 0
    exitosos: int = 0
    errores: int = 0
    resultados: List[BatchResult] = field(default_factory=list)
    en_progreso: bool = False
    token_sispro: Optional[str] = None


class BatchProcessor:
    """Orchestrates the batch processing of NC folders.

    This class manages the entire lifecycle of batch processing:
    - Creating and tracking batch jobs
    - Processing folders sequentially
    - Handling token expiration and re-login
    - Generating result reports
    """

    def __init__(
        self,
        nc_service: Optional[Any] = None,
        ministerio_service: Optional[MinisterioService] = None
    ):
        """Initialize the batch processor.

        Args:
            nc_service: Optional NC service (not used, kept for compatibility)
            ministerio_service: Optional MinisterioService instance
        """
        self.ministerio_service = ministerio_service or MinisterioService()
        self._states: Dict[str, BatchState] = {}
        self.on_token_expired: Optional[Callable[[], str]] = None
        self.on_progress: Optional[Callable[[BatchState], None]] = None

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
        match = re.search(r'([A-Z]+)(?=\d)', filename.upper())
        if match:
            prefix = match.group(1)
            # Return empty if it's just 'NC' with no additional letters
            return prefix if prefix != 'NC' else ''
        return ''

    def create_batch(self, folders: List[FolderInfo], batch_id: Optional[str] = None) -> str:
        """Create a new batch job.

        Args:
            folders: List of FolderInfo objects to process
            batch_id: Optional batch ID to use (if not provided, generates one)

        Returns:
            batch_id: Unique identifier for the batch
        """
        if batch_id is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            batch_id = f"batch_{timestamp}_{len(folders)}"

        state = BatchState(
            batch_id=batch_id,
            total=len(folders),
            completadas=0,
            exitosos=0,
            errores=0,
            resultados=[],
            en_progreso=False,
            token_sispro=None
        )

        self._states[batch_id] = state
        logger.info(f"Created batch {batch_id} with {len(folders)} folders")
        return batch_id

    def get_state(self, batch_id: str) -> Optional[BatchState]:
        """Get the state of a batch job.

        Args:
            batch_id: Unique identifier for the batch

        Returns:
            BatchState if found, None otherwise
        """
        return self._states.get(batch_id)

    def _sanitize_path_component(self, component: str) -> str:
        """Sanitize a string to be safe for use in filesystem paths.

        Removes or replaces unsafe characters that could be used for path traversal.

        Args:
            component: String to sanitize (e.g., NIT, NC number, batch ID)

        Returns:
            Sanitized string safe for filesystem use, or "UNKNOWN" if empty

        Examples:
            >>> self._sanitize_path_component("../etc/passwd")
            '___etc_passwd'
            >>> self._sanitize_path_component("NCS000123")
            'NCS000123'
            >>> self._sanitize_path_component("")
            'UNKNOWN'
        """
        if not component or not str(component).strip():
            return "UNKNOWN"
        # Replace any non-alphanumeric chars (except underscore/hyphen) with underscore
        return re.sub(r'[^\w\-]', '_', str(component))

    async def process_batch(
        self,
        batch_id: str,
        folders: List[FolderInfo],
        token: str
    ) -> None:
        """Process a batch of folders.

        Processes folders sequentially to avoid overwhelming the ministry API.
        Updates statistics and calls progress callback after each folder.

        Args:
            batch_id: Unique identifier for the batch
            folders: List of FolderInfo objects to process
            token: SISPRO token for ministry API
        """
        state = self._states.get(batch_id)
        if not state:
            logger.error(f"Batch {batch_id} not found")
            return

        state.en_progreso = True
        state.token_sispro = token

        try:
            for i, folder in enumerate(folders):
                try:
                    result = await self.process_folder(
                        folder.path,
                        token,
                        folder.es_caso_especial,
                        batch_id=batch_id
                    )

                    state.resultados.append(result)
                    state.completadas += 1

                    if result.exitoso:
                        state.exitosos += 1
                    else:
                        state.errores += 1

                    # Delay entre carpetas para evitar rate limit de LLM
                    # Moonshot tiene límites de ~10-20 req/s, con 0.5s estamos seguros
                    if i < len(folders) - 1:  # No esperar después de la última
                        await asyncio.sleep(0.5)

                except Exception as e:
                    # Mark error but continue processing other folders
                    error_result = BatchResult(
                        carpeta=folder.nombre,
                        numero_nc="UNKNOWN",
                        exitoso=False,
                        error=str(e),
                        es_caso_especial=folder.es_caso_especial
                    )
                    state.resultados.append(error_result)
                    state.completadas += 1
                    state.errores += 1
                    logger.error(f"Error processing folder {folder.nombre}: {e}")

                # Call progress callback if set
                if self.on_progress:
                    try:
                        self.on_progress(state)
                    except Exception as callback_error:
                        logger.warning(f"Progress callback error: {callback_error}")

        finally:
            state.en_progreso = False
            logger.info(f"Batch {batch_id} completed: {state.exitosos} success, {state.errores} errors")

    async def process_folder(
        self,
        folder_path: str,
        token: str,
        es_caso_especial: bool = False,
        batch_id: Optional[str] = None
    ) -> BatchResult:
        """Process a single folder.

        Reads the 3 files from the folder, processes the NC, and sends to ministry.
        Handles token expiration by calling on_token_expired callback and retrying.

        Args:
            folder_path: Path to the folder containing NC files
            token: SISPRO token for ministry API
            es_caso_especial: True if this is a special case folder

        Returns:
            BatchResult with processing outcome
        """
        folder = Path(folder_path)
        folder_name = folder.name

        try:
            # Read the 3 files from the folder
            files = self._read_folder_files(folder)

            if not files:
                return BatchResult(
                    carpeta=folder_name,
                    numero_nc="UNKNOWN",
                    exitoso=False,
                    error="Could not read required files from folder",
                    es_caso_especial=es_caso_especial
                )

            # Import here to avoid circular imports
            from app.processors.xml_processor import XMLProcessor
            from app.processors.rips_processor import RIPSProcessor
            from app.services.llm_matcher import LLMMatcher

            nc_content = files["nota_credito"]
            factura_content = files["factura"]
            rips_content = files["rips"]

            # Extract NC number
            numero_nc = _extract_nc_number(nc_content)

            # Extract sections from factura
            interop = XMLProcessor.extract_interoperabilidad(factura_content)
            period = XMLProcessor.extract_invoice_period(factura_content)

            if not interop or not period:
                return BatchResult(
                    carpeta=folder_name,
                    numero_nc=numero_nc,
                    exitoso=False,
                    error="Missing Interoperabilidad or InvoicePeriod in factura",
                    es_caso_especial=es_caso_especial
                )

            # Extract NC lines
            lineas_nc = XMLProcessor.extract_nc_lines(nc_content)
            if not lineas_nc:
                return BatchResult(
                    carpeta=folder_name,
                    numero_nc=numero_nc,
                    exitoso=False,
                    error="No lines found in Nota Credito",
                    es_caso_especial=es_caso_especial
                )

            # Parse RIPS
            rips_data = RIPSProcessor.parse_rips(rips_content)
            servicios_rips = RIPSProcessor.get_all_services(rips_data)

            if not servicios_rips:
                return BatchResult(
                    carpeta=folder_name,
                    numero_nc=numero_nc,
                    exitoso=False,
                    error="No services found in RIPS",
                    es_caso_especial=es_caso_especial
                )

            # Matching
            matcher = LLMMatcher()
            matching_result = await matcher.match_services(lineas_nc, servicios_rips)

            # Detect equal values for non-LDL folders
            codigos_igualados = None
            lineas_igualadas = []
            items_igualados_count = 0
            if not es_caso_especial:
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

            # Save RIPS JSON to temporary directory (non-critical operation)
            if batch_id:
                try:
                    # Extract NC prefix from filename
                    nc_xml_filename = files.get("nota_credito_filename", "")
                    prefijo_nc = self._extraer_prefijo_nc(nc_xml_filename)

                    # Get NIT from RIPS data and sanitize all path components
                    nit = self._sanitize_path_component(rips_data.get("numDocumentoIdObligado", "UNKNOWN"))
                    prefijo_nc_sanitized = self._sanitize_path_component(prefijo_nc)
                    numero_nc_sanitized = self._sanitize_path_component(numero_nc)
                    batch_id_sanitized = self._sanitize_path_component(batch_id)

                    # Construct RIPS filename
                    if prefijo_nc_sanitized and prefijo_nc_sanitized != "UNKNOWN":
                        rips_filename = f"RIPS_{nit}_{prefijo_nc_sanitized}{numero_nc_sanitized}.json"
                    else:
                        rips_filename = f"RIPS_{nit}_{numero_nc_sanitized}.json"

                    # Create directory and save file (use sanitized batch_id)
                    rips_dir = Path(__file__).parent.parent.parent / "temp" / "batch_rips" / batch_id_sanitized
                    rips_dir.mkdir(parents=True, exist_ok=True)

                    # Save RIPS JSON file
                    rips_file_path = rips_dir / rips_filename
                    with open(rips_file_path, 'w', encoding='utf-8') as f:
                        json.dump(nc_rips, f, indent=2, ensure_ascii=False)

                    logger.info(f"Saved RIPS file: {rips_filename}")
                except (OSError, IOError, TypeError, ValueError) as e:
                    logger.warning(f"Failed to save RIPS file for {folder_name}: {e}")

            # Insert sections into NC
            nc_completo = XMLProcessor.insert_sections(nc_content, interop, period)

            # Apply per-line zero-equalization for non-LDL folders
            if lineas_igualadas:
                nc_completo = XMLProcessor.aplicar_valores_cero_por_linea(nc_completo, lineas_igualadas)

            # Apply special case if needed
            if es_caso_especial:
                nc_completo = XMLProcessor.aplicar_caso_colesterol(nc_completo)

            # Prepare payload for ministry
            nc_bytes = nc_completo.encode('utf-8')
            nc_base64 = base64.b64encode(nc_bytes).decode('utf-8')

            payload = NCPayload(
                rips=nc_rips,
                xmlFevFile=nc_base64
            )

            # Send to ministry with token expiration handling
            max_retries = 1
            retry_count = 0

            while retry_count <= max_retries:
                try:
                    response = await self.ministerio_service.enviar_nc(payload, token)

                    if response.success:
                        return BatchResult(
                            carpeta=folder_name,
                            numero_nc=numero_nc,
                            exitoso=True,
                            cuv=response.codigo_unico_validacion,
                            es_caso_especial=es_caso_especial,
                            raw_response=response.raw_response,
                            items_igualados_a_cero=items_igualados_count
                        )
                    else:
                        # Check if it's a token expiration error (401)
                        has_auth_error = any(
                            e.Clase.upper() == "RECHAZADO" and
                            ("token" in e.Descripcion.lower() or
                             "autorizacion" in e.Descripcion.lower() or
                             "401" in e.Descripcion)
                            for e in response.errores
                        )

                        if has_auth_error and retry_count < max_retries and self.on_token_expired:
                            logger.warning("Token expired, requesting new token")
                            new_token = self.on_token_expired()
                            if new_token:
                                token = new_token
                                retry_count += 1
                                continue

                        # Return error result
                        error_msg = "; ".join([
                            f"{e.Codigo}: {e.Descripcion}"
                            for e in response.errores
                        ])
                        return BatchResult(
                            carpeta=folder_name,
                            numero_nc=numero_nc,
                            exitoso=False,
                            error=error_msg,
                            es_caso_especial=es_caso_especial,
                            raw_response=response.raw_response
                        )

                except Exception as e:
                    error_str = str(e).lower()
                    is_auth_error = (
                        "401" in error_str or
                        "unauthorized" in error_str or
                        "token" in error_str
                    )

                    if is_auth_error and retry_count < max_retries and self.on_token_expired:
                        logger.warning(f"Token error during send: {e}, requesting new token")
                        new_token = self.on_token_expired()
                        if new_token:
                            token = new_token
                            retry_count += 1
                            continue

                    raise  # Re-raise if not handled

                retry_count += 1

            # Should not reach here, but just in case
            return BatchResult(
                carpeta=folder_name,
                numero_nc=numero_nc,
                exitoso=False,
                error="Max retries exceeded",
                es_caso_especial=es_caso_especial
            )

        except Exception as e:
            logger.error(f"Error processing folder {folder_name}: {e}")
            return BatchResult(
                carpeta=folder_name,
                numero_nc="UNKNOWN",
                exitoso=False,
                error=str(e),
                es_caso_especial=es_caso_especial
            )

    def generate_zip(self, batch_id: str, output_path: str) -> str:
        """Generate a ZIP file with batch results.

        Creates a ZIP containing:
        - exitosos/CUV_{numero_nc}.json (one per successful result)
        - errores/errores.csv (CSV with error details)
        - resumen.txt (batch statistics)

        Args:
            batch_id: Unique identifier for the batch
            output_path: Directory path where to save the ZIP

        Returns:
            Path to the generated ZIP file
        """
        state = self._states.get(batch_id)
        if not state:
            raise ValueError(f"Batch {batch_id} not found")

        # Create output directory if it doesn't exist
        output_dir = Path(output_path)
        output_dir.mkdir(parents=True, exist_ok=True)

        zip_filename = f"{batch_id}_resultados.zip"
        zip_path = output_dir / zip_filename

        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            # Add successful results
            exitosos_dir = "exitosos"
            for resultado in state.resultados:
                if resultado.exitoso and resultado.cuv:
                    filename = f"{exitosos_dir}/CUV_{resultado.numero_nc}.json"
                    content = json.dumps({
                        "carpeta": resultado.carpeta,
                        "numero_nc": resultado.numero_nc,
                        "cuv": resultado.cuv,
                        "es_caso_especial": resultado.es_caso_especial,
                        "raw_response": resultado.raw_response
                    }, indent=2, ensure_ascii=False)
                    zf.writestr(filename, content)

            # Add errors CSV
            errores_csv = self._generate_errors_csv(state.resultados)
            if errores_csv:
                zf.writestr("errores/errores.csv", errores_csv)

            # Add summary
            summary = self._generate_summary(state)
            zf.writestr("resumen.txt", summary)

        logger.info(f"Generated ZIP: {zip_path}")
        return str(zip_path)

    def _read_folder_files(self, folder: Path) -> Optional[Dict[str, str]]:
        """Read the 3 required files from a folder.

        Args:
            folder: Path to the folder

        Returns:
            Dictionary with 4 keys: 'factura', 'nota_credito', 'nota_credito_filename', 'rips'.
            The first 3 contain file content, 'nota_credito_filename' contains the NC filename.
            Returns None if required files cannot be read.
        """
        files = {
            "factura": None,
            "nota_credito": None,
            "nota_credito_filename": None,
            "rips": None
        }

        try:
            for file_path in folder.iterdir():
                if not file_path.is_file():
                    continue

                # Ignore PDF files
                if file_path.suffix.lower() == ".pdf":
                    continue

                filename_upper = file_path.name.upper()

                # Detect Factura XML (contains PMD, HMD, or MDS + .xml)
                if file_path.suffix.lower() == ".xml" and ("PMD" in filename_upper or "HMD" in filename_upper or "MDS" in filename_upper):
                    files["factura"] = file_path.read_text(encoding='utf-8')

                # Detect Nota Credito XML (contains NC, NCD, or NCS + .xml)
                elif file_path.suffix.lower() == ".xml" and "NC" in filename_upper:
                    files["nota_credito"] = file_path.read_text(encoding='utf-8')
                    files["nota_credito_filename"] = file_path.name  # NUEVO

                # Detect RIPS JSON
                elif file_path.suffix.lower() == ".json":
                    files["rips"] = file_path.read_text(encoding='utf-8')

            # Check if all required files are present (excluding nota_credito_filename which is derived)
            required_files = ["factura", "nota_credito", "rips"]
            if not all(files[k] for k in required_files):
                missing = [k for k in required_files if files[k] is None]
                logger.error(f"Missing files in {folder}: {missing}")
                return None

            return files

        except Exception as e:
            logger.error(f"Error reading folder {folder}: {e}")
            return None

    def _generate_errors_csv(self, resultados: List[BatchResult]) -> str:
        """Generate CSV content for error results.

        Args:
            resultados: List of BatchResult objects

        Returns:
            CSV string with columns: carpeta, numero_nc, error, detalle_completo
        """
        errores = [r for r in resultados if not r.exitoso]

        if not errores:
            return ""

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["carpeta", "numero_nc", "error", "detalle_completo"])

        for error in errores:
            # Capturar todo el detalle como JSON
            detalle_completo = ""
            if error.raw_response:
                try:
                    detalle_completo = json.dumps(error.raw_response, ensure_ascii=False, indent=2)
                except Exception as e:
                    detalle_completo = str(error.raw_response)

            writer.writerow([
                error.carpeta,
                error.numero_nc,
                error.error or "Unknown error",
                detalle_completo
            ])

        return output.getvalue()

    def _generate_summary(self, state: BatchState) -> str:
        """Generate summary text for the batch.

        Args:
            state: BatchState object

        Returns:
            Summary text with batch statistics
        """
        lines = [
            "=" * 60,
            "RESUMEN DE PROCESAMIENTO BATCH",
            "=" * 60,
            "",
            f"Batch ID: {state.batch_id}",
            f"Fecha: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            "",
            "-" * 40,
            "ESTADISTICAS",
            "-" * 40,
            f"Total carpetas: {state.total}",
            f"Completadas: {state.completadas}",
            f"Exitosas: {state.exitosos}",
            f"Errores: {state.errores}",
            "",
            "-" * 40,
            "TASA DE EXITO",
            "-" * 40,
        ]

        if state.total > 0:
            tasa = (state.exitosos / state.total) * 100
            lines.append(f"{tasa:.1f}% ({state.exitosos}/{state.total})")
        else:
            lines.append("N/A")

        lines.extend([
            "",
            "=" * 60,
            "DETALLE DE RESULTADOS",
            "=" * 60,
            ""
        ])

        for resultado in state.resultados:
            status = "EXITOSO" if resultado.exitoso else "ERROR"
            lines.append(f"[{status}] {resultado.carpeta} - NC: {resultado.numero_nc}")
            if resultado.exitoso and resultado.cuv:
                lines.append(f"         CUV: {resultado.cuv}")
                if resultado.items_igualados_a_cero > 0:
                    lines.append(f"         Items igualados a 0: {resultado.items_igualados_a_cero}")
            elif resultado.error:
                lines.append(f"         Error: {resultado.error}")

        lines.extend([
            "",
            "=" * 60,
            "Fin del resumen",
            "=" * 60
        ])

        return "\n".join(lines)
