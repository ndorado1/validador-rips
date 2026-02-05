import pytest
import tempfile
from pathlib import Path
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_batch_full_flow():
    """Test completo: scan detecta carpetas correctamente."""
    with tempfile.TemporaryDirectory() as tmpdir:
        # Crear carpetas de prueba
        parent = Path(tmpdir)

        # 3 carpetas normales: NC0001, NC0002, NC0003
        normal_folders = ["NC0001", "NC0002", "NC0003"]
        for folder_name in normal_folders:
            folder = parent / folder_name
            folder.mkdir()

            # Crear archivos requeridos para cada carpeta
            # PMD_factura.xml (contiene PMD + .xml)
            (folder / "PMD_factura.xml").write_text("<xml>factura</xml>")
            # NCxxxx.xml (contiene NC + .xml)
            (folder / f"{folder_name}.xml").write_text("<xml>nc</xml>")
            # rips.json
            (folder / "rips.json").write_text('{"rips": true}')

        # 1 carpeta LDL: NC9999_LDL
        ldl_folder = parent / "NC9999_LDL"
        ldl_folder.mkdir()
        (ldl_folder / "PMD_factura.xml").write_text("<xml>factura</xml>")
        (ldl_folder / "NC9999_LDL.xml").write_text("<xml>nc</xml>")
        (ldl_folder / "rips.json").write_text('{"rips": true}')

        # Test scan endpoint
        response = client.post("/api/batch/scan", json={"folder_path": str(parent)})
        assert response.status_code == 200
        data = response.json()

        # Verificaciones
        assert data["total"] == 4

        # Verificar que al menos una carpeta tenga es_caso_especial == True
        carpetas = data["carpetas"]
        assert len(carpetas) == 4

        # Verificar que al menos una carpeta tenga es_caso_especial == True
        especial_count = sum(1 for c in carpetas if c["es_caso_especial"] is True)
        assert especial_count >= 1, "Debe haber al menos una carpeta con es_caso_especial=True"

        # Verificar que la carpeta LDL esté marcada como caso especial
        ldl_carpeta = next((c for c in carpetas if "LDL" in c["nombre"].upper()), None)
        assert ldl_carpeta is not None, "Debe existir la carpeta NC9999_LDL"
        assert ldl_carpeta["es_caso_especial"] is True, "La carpeta LDL debe ser caso especial"

        # Verificar que cada carpeta tiene archivos factura, nc, rips
        for carpeta in carpetas:
            archivos = carpeta["archivos"]
            assert "factura" in archivos, f"Carpeta {carpeta['nombre']} debe tener archivo factura"
            assert "nota_credito" in archivos, f"Carpeta {carpeta['nombre']} debe tener archivo nota_credito"
            assert "rips" in archivos, f"Carpeta {carpeta['nombre']} debe tener archivo rips"

            # Verificar que los archivos existen
            assert Path(archivos["factura"]).exists(), f"Archivo factura debe existir"
            assert Path(archivos["nota_credito"]).exists(), f"Archivo nota_credito debe existir"
            assert Path(archivos["rips"]).exists(), f"Archivo rips debe existir"

        # Verificar que todas las carpetas esperadas están presentes
        nombres = {c["nombre"] for c in carpetas}
        nombres_esperados = {"NC0001", "NC0002", "NC0003", "NC9999_LDL"}
        assert nombres == nombres_esperados, f"Deben estar todas las carpetas esperadas: {nombres} vs {nombres_esperados}"

        # Verificar que no hay errores de scan
        assert data["errores_scan"] == [], "No debe haber errores de scan"


if __name__ == "__main__":
    test_batch_full_flow()
    print("Test de integracion paso")
