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


class TestGenerateNCRIPS:
    def test_generate_simple(self):
        rips_data = {
            "numDocumentoIdObligado": "817000162",
            "numFactura": "HMD73787",
            "usuarios": [{
                "tipoDocumentoIdentificacion": "CC",
                "numDocumentoIdentificacion": "4770399",
                "tipoUsuario": "11",
                "fechaNacimiento": "1953-02-28",
                "codSexo": "M",
                "codPaisResidencia": "170",
                "codMunicipioResidencia": "19743",
                "codZonaTerritorialResidencia": "01",
                "incapacidad": "NO",
                "consecutivo": 1,
                "codPaisOrigen": "170",
                "servicios": {
                    "medicamentos": [{
                        "codPrestador": "197430005801",
                        "codTecnologiaSalud": "19943544",
                        "nomTecnologiaSalud": "PRESERVATIVOS",
                        "vrUnitMedicamento": 500,
                        "cantidadMedicamento": 10,
                        "vrServicio": 5000
                    }]
                }
            }]
        }

        matches = [{
            'tipo_servicio': 'medicamentos',
            'codigo_rips': '19943544',
            'valor_nc': 2000,
            'cantidad_calculada': 4
        }]

        result = RIPSProcessor.generate_nc_rips(rips_data, 'NCD13239', matches)

        assert result['tipoNota'] == 'NC'
        assert result['numNota'] == 'NCD13239'
        assert len(result['usuarios']) == 1
        assert len(result['usuarios'][0]['servicios']['medicamentos']) == 1
        # Para NC, cantidad es 1 y vrUnit se recalcula
        assert result['usuarios'][0]['servicios']['medicamentos'][0]['cantidadMedicamento'] == 1
        assert result['usuarios'][0]['servicios']['medicamentos'][0]['vrServicio'] == 2000
        assert result['usuarios'][0]['servicios']['medicamentos'][0]['vrUnitMedicamento'] == 2000

    def test_calculate_total(self):
        rips_data = {
            "usuarios": [{
                "servicios": {
                    "medicamentos": [
                        {"vrServicio": 2000},
                        {"vrServicio": 500}
                    ],
                    "otrosServicios": [
                        {"vrServicio": 397}
                    ]
                }
            }]
        }

        total = RIPSProcessor.calculate_total(rips_data)
        assert total == 2897.0
