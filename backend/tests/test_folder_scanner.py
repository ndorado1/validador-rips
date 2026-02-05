import pytest
import tempfile
from pathlib import Path
from app.services.folder_scanner import FolderScanner, FolderInfo


class TestFolderScanner:
    """Tests for FolderScanner service."""

    def test_scan_folder_with_valid_structure(self):
        """Verifica escaneo básico de carpetas con estructura NC válida."""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Crear estructura de carpetas
            parent = Path(tmpdir)
            nc_folder = parent / "NC_001"
            nc_folder.mkdir()

            # Crear archivos requeridos
            (nc_folder / "factura_PMD_001.xml").write_text("<xml>factura</xml>")
            (nc_folder / "nota_NC_001.xml").write_text("<xml>nc</xml>")
            (nc_folder / "rips_001.json").write_text('{"rips": true}')

            # Escanear
            scanner = FolderScanner()
            result = scanner.scan_folder(str(parent))

            # Verificar
            assert len(result) == 1
            assert result[0].nombre == "NC_001"
            assert result[0].path == str(nc_folder)
            assert result[0].estado == "pendiente"
            assert result[0].es_caso_especial is False
            assert result[0].error is None

            # Verificar archivos detectados
            archivos = result[0].archivos
            assert archivos["factura"] == str(nc_folder / "factura_PMD_001.xml")
            assert archivos["nota_credito"] == str(nc_folder / "nota_NC_001.xml")
            assert archivos["rips"] == str(nc_folder / "rips_001.json")

    def test_scan_folder_detects_ldl_special_case(self):
        """Verifica detección de carpetas LDL (caso especial)."""
        with tempfile.TemporaryDirectory() as tmpdir:
            parent = Path(tmpdir)

            # Crear carpeta con LDL en el nombre (case insensitive)
            ldl_folder = parent / "NC_LDL_001"
            ldl_folder.mkdir()

            # Crear archivos requeridos
            (ldl_folder / "PMD_factura.xml").write_text("<xml>factura</xml>")
            (ldl_folder / "NC_nota.xml").write_text("<xml>nc</xml>")
            (ldl_folder / "datos.json").write_text('{"rips": true}')

            # Escanear
            scanner = FolderScanner()
            result = scanner.scan_folder(str(parent))

            # Verificar caso especial
            assert len(result) == 1
            assert result[0].es_caso_especial is True
            assert "LDL" in result[0].nombre.upper()

    def test_scan_folder_ignores_pdf_files(self):
        """Verifica que los archivos PDF sean ignorados."""
        with tempfile.TemporaryDirectory() as tmpdir:
            parent = Path(tmpdir)
            nc_folder = parent / "NC_002"
            nc_folder.mkdir()

            # Crear archivos requeridos
            (nc_folder / "factura_PMD.xml").write_text("<xml>factura</xml>")
            (nc_folder / "nota_NC.xml").write_text("<xml>nc</xml>")
            (nc_folder / "rips.json").write_text('{"rips": true}')

            # Crear archivos PDF que deben ser ignorados
            (nc_folder / "documento.pdf").write_text("PDF content")
            (nc_folder / "PMD_factura.pdf").write_text("PDF factura")
            (nc_folder / "NC_nota.pdf").write_text("PDF NC")

            # Escanear
            scanner = FolderScanner()
            result = scanner.scan_folder(str(parent))

            # Verificar que solo se detectaron los archivos no-PDF
            assert len(result) == 1
            archivos = result[0].archivos

            # Los XML y JSON deben estar presentes
            assert archivos["factura"].endswith(".xml")
            assert archivos["nota_credito"].endswith(".xml")
            assert archivos["rips"].endswith(".json")

            # Ningún archivo debe ser PDF
            for archivo_path in archivos.values():
                assert not archivo_path.endswith(".pdf")

    def test_scan_folder_multiple_folders(self):
        """Verifica escaneo de múltiples carpetas."""
        with tempfile.TemporaryDirectory() as tmpdir:
            parent = Path(tmpdir)

            # Crear múltiples carpetas NC
            for i in range(3):
                nc_folder = parent / f"NC_{i:03d}"
                nc_folder.mkdir()
                (nc_folder / f"PMD_{i}.xml").write_text("<xml>factura</xml>")
                (nc_folder / f"NC_{i}.xml").write_text("<xml>nc</xml>")
                (nc_folder / f"rips_{i}.json").write_text('{"rips": true}')

            # Escanear
            scanner = FolderScanner()
            result = scanner.scan_folder(str(parent))

            # Verificar
            assert len(result) == 3
            nombres = {r.nombre for r in result}
            assert nombres == {"NC_000", "NC_001", "NC_002"}

    def test_scan_folder_empty_folder(self):
        """Verifica manejo de carpetas vacías."""
        with tempfile.TemporaryDirectory() as tmpdir:
            parent = Path(tmpdir)
            nc_folder = parent / "NC_EMPTY"
            nc_folder.mkdir()

            # No crear archivos

            scanner = FolderScanner()
            result = scanner.scan_folder(str(parent))

            # Carpeta vacía no debe aparecer en resultados
            assert len(result) == 0

    def test_scan_folder_partial_files(self):
        """Verifica manejo de carpetas con archivos incompletos."""
        with tempfile.TemporaryDirectory() as tmpdir:
            parent = Path(tmpdir)
            nc_folder = parent / "NC_PARTIAL"
            nc_folder.mkdir()

            # Solo crear factura, faltan NC y RIPS
            (nc_folder / "factura_PMD.xml").write_text("<xml>factura</xml>")

            scanner = FolderScanner()
            result = scanner.scan_folder(str(parent))

            # Carpeta incompleta no debe aparecer en resultados
            assert len(result) == 0

    def test_scan_folder_ldl_variations(self):
        """Verifica detección de LDL en diferentes variaciones de mayúsculas/minúsculas."""
        with tempfile.TemporaryDirectory() as tmpdir:
            parent = Path(tmpdir)

            variations = ["NC_ldl_001", "NC_Ldl_002", "NC_LDL_003", "nc_ldl_test"]

            for var in variations:
                folder = parent / var
                folder.mkdir()
                (folder / "PMD.xml").write_text("<xml>factura</xml>")
                (folder / "NC.xml").write_text("<xml>nc</xml>")
                (folder / "rips.json").write_text('{"rips": true}')

            scanner = FolderScanner()
            result = scanner.scan_folder(str(parent))

            assert len(result) == 4
            for folder_info in result:
                assert folder_info.es_caso_especial is True
