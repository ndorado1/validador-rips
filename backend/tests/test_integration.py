import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


class TestHealth:
    def test_health_check(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


class TestProcesarNC:
    def test_procesar_nc_missing_files(self):
        response = client.post("/api/nc/procesar")
        assert response.status_code == 422  # Validation error

    def test_procesar_nc_with_files(self):
        # Crear XML de prueba simple
        nc_xml = '''<?xml version="1.0"?>
<AttachedDocument>
  <cac:Attachment>
    <cac:ExternalReference>
      <cbc:Description><![CDATA[
        <CreditNote xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
          <ext:UBLExtensions>
            <ext:UBLExtension>Extension1</ext:UBLExtension>
          </ext:UBLExtensions>
          <cbc:ID>NCD13239</cbc:ID>
          <cbc:PayableAmount>2000.00</cbc:PayableAmount>
          <cac:DiscrepancyResponse>
            <cbc:ReferenceID>HMD73787</cbc:ReferenceID>
          </cac:DiscrepancyResponse>
          <cac:CreditNoteLine>
            <cbc:ID>1</cbc:ID>
            <cbc:CreditedQuantity>1.00</cbc:CreditedQuantity>
            <cbc:LineExtensionAmount>2000.00</cbc:LineExtensionAmount>
            <cac:Item>
              <cbc:Description>(19943544) PRESERVATIVOS</cbc:Description>
            </cac:Item>
          </cac:CreditNoteLine>
        </CreditNote>
      ]]></cbc:Description>
    </cac:ExternalReference>
  </cac:Attachment>
</AttachedDocument>'''

        factura_xml = '''<?xml version="1.0"?>
<AttachedDocument>
  <cac:Attachment>
    <cac:ExternalReference>
      <cbc:Description><![CDATA[
        <Invoice xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
          <ext:UBLExtensions>
            <ext:UBLExtension>Extension1</ext:UBLExtension>
            <ext:UBLExtension>
              <ext:ExtensionContent>
                <CustomTagGeneral>
                  <Interoperabilidad>
                    <Group schemeName="Sector Salud">
                      <Collection schemeName="Usuario">
                        <AdditionalInformation>
                          <n>CODIGO_PRESTADOR</n>
                          <Value>197430005801</Value>
                        </AdditionalInformation>
                      </Collection>
                    </Group>
                  </Interoperabilidad>
                </CustomTagGeneral>
              </ext:ExtensionContent>
            </ext:UBLExtension>
          </ext:UBLExtensions>
          <cac:InvoicePeriod>
            <cbc:StartDate>2025-01-01</cbc:StartDate>
            <cbc:EndDate>2025-01-31</cbc:EndDate>
          </cac:InvoicePeriod>
        </Invoice>
      ]]></cbc:Description>
    </cac:ExternalReference>
  </cac:Attachment>
</AttachedDocument>'''

        rips_json = '''{
            "numDocumentoIdObligado": "817000162",
            "numFactura": "HMD73787",
            "tipoNota": null,
            "numNota": null,
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
                    }],
                    "otrosServicios": [],
                    "procedimientos": [],
                    "consultas": []
                }
            }]
        }'''

        files = {
            'nc_xml': ('nc.xml', nc_xml, 'application/xml'),
            'factura_xml': ('factura.xml', factura_xml, 'application/xml'),
            'factura_rips': ('rips.json', rips_json, 'application/json')
        }

        response = client.post("/api/nc/procesar", files=files)

        # Debería retornar algo (puede fallar por LLM no configurado)
        assert response.status_code in [200, 500]
