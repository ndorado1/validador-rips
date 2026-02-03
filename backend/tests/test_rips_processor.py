import pytest
import json
from app.processors.rips_processor import RIPSProcessor


class TestParseRIPS:
    def test_parse_valid_json(self):
        data = {"numFactura": "HMD123", "usuarios": []}
        result = RIPSProcessor.parse_rips(json.dumps(data))
        assert result['numFactura'] == 'HMD123'

    def test_parse_invalid_json(self):
        with pytest.raises(json.JSONDecodeError):
            RIPSProcessor.parse_rips('invalid json')


class TestGetAllServices:
    def test_get_medicamentos(self):
        rips_data = {
            "usuarios": [{
                "servicios": {
                    "medicamentos": [{
                        "codTecnologiaSalud": "19943544",
                        "nomTecnologiaSalud": "PRESERVATIVOS",
                        "vrUnitMedicamento": 500,
                        "cantidadMedicamento": 10
                    }]
                }
            }]
        }

        services = RIPSProcessor.get_all_services(rips_data)
        assert len(services) == 1
        assert services[0].tipo == 'medicamentos'
        assert services[0].codigo == '19943544'
        assert services[0].valor_unitario == 500

    def test_get_otros_servicios(self):
        rips_data = {
            "usuarios": [{
                "servicios": {
                    "otrosServicios": [{
                        "codTecnologiaSalud": "DM-INS-099",
                        "nomTecnologiaSalud": "FRASCO",
                        "vrUnitOS": 795,
                        "cantidadOS": 1
                    }]
                }
            }]
        }

        services = RIPSProcessor.get_all_services(rips_data)
        assert len(services) == 1
        assert services[0].tipo == 'otrosServicios'

    def test_get_multiple_types(self):
        rips_data = {
            "usuarios": [{
                "servicios": {
                    "medicamentos": [{"codTecnologiaSalud": "M1", "nomTecnologiaSalud": "Med1", "vrUnitMedicamento": 100, "cantidadMedicamento": 1}],
                    "otrosServicios": [{"codTecnologiaSalud": "O1", "nomTecnologiaSalud": "Otro1", "vrUnitOS": 200, "cantidadOS": 1}],
                    "procedimientos": [],
                    "consultas": []
                }
            }]
        }

        services = RIPSProcessor.get_all_services(rips_data)
        assert len(services) == 2

    def test_empty_services(self):
        rips_data = {"usuarios": [{"servicios": {}}]}
        services = RIPSProcessor.get_all_services(rips_data)
        assert len(services) == 0
