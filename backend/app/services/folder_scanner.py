"""
Folder Scanner Service for batch processing of NC (Nota Crédito) folders.

This module provides functionality to scan folders containing NC files
(Factura XML, Nota Crédito XML, and RIPS JSON) for batch processing.
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional


@dataclass
class FolderInfo:
    """Information about a scanned NC folder.

    Attributes:
        nombre: Name of the folder
        path: Full path to the folder
        archivos: Dictionary containing paths to factura, nota_credito, and rips files
        es_caso_especial: True if folder name contains "LDL" (case insensitive)
        estado: Processing state (default: "pendiente")
        error: Optional error message if something went wrong
    """
    nombre: str
    path: str
    archivos: Dict[str, str] = field(default_factory=dict)
    es_caso_especial: bool = False
    estado: str = "pendiente"
    error: Optional[str] = None


class FolderScanner:
    """Scanner for NC folder structures.

    Scans a parent folder looking for subfolders containing:
    - Factura XML: filename contains "PMD" + .xml extension
    - Nota Crédito XML: filename contains "NC" + .xml extension
    - RIPS: file with .json extension

    PDF files are ignored.
    Folders with "LDL" in the name are marked as special cases.
    """

    def scan_folder(self, parent_path: str) -> List[FolderInfo]:
        """Scan a parent folder for NC folder structures.

        Args:
            parent_path: Path to the parent folder to scan

        Returns:
            List of FolderInfo objects for valid NC folders found
        """
        parent = Path(parent_path)
        result: List[FolderInfo] = []

        if not parent.exists() or not parent.is_dir():
            return result

        for item in parent.iterdir():
            if not item.is_dir():
                continue

            folder_info = self._scan_single_folder(item)
            if folder_info:
                result.append(folder_info)

        return result

    def _scan_single_folder(self, folder_path: Path) -> Optional[FolderInfo]:
        """Scan a single folder for NC files.

        Args:
            folder_path: Path to the folder to scan

        Returns:
            FolderInfo if folder has valid structure, None otherwise
        """
        archivos: Dict[str, str] = {
            "factura": "",
            "nota_credito": "",
            "rips": ""
        }

        # Scan files in folder
        for file_path in folder_path.iterdir():
            if not file_path.is_file():
                continue

            # Ignore PDF files
            if file_path.suffix.lower() == ".pdf":
                continue

            filename_upper = file_path.name.upper()

            # Detect Factura XML (contains PMD, HMD, or MDS + .xml)
            if file_path.suffix.lower() == ".xml" and ("PMD" in filename_upper or "HMD" in filename_upper or "MDS" in filename_upper):
                archivos["factura"] = str(file_path)

            # Detect Nota Crédito XML (contains NC, NCD, or NCS + .xml)
            elif file_path.suffix.lower() == ".xml" and ("NC" in filename_upper):
                archivos["nota_credito"] = str(file_path)

            # Detect RIPS JSON
            elif file_path.suffix.lower() == ".json":
                archivos["rips"] = str(file_path)

        # Check if all required files are present
        if not all(archivos.values()):
            return None

        # Detect special case (LDL in folder name, case insensitive)
        es_caso_especial = "LDL" in folder_path.name.upper()

        return FolderInfo(
            nombre=folder_path.name,
            path=str(folder_path),
            archivos=archivos,
            es_caso_especial=es_caso_especial,
            estado="pendiente",
            error=None
        )
