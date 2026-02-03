import json
from typing import List, Dict, Any, Optional
from app.models import ServicioRIPS


class RIPSProcessor:
    """Procesador de archivos RIPS JSON."""

    @staticmethod
    def parse_rips(rips_json: str) -> Dict[str, Any]:
        """Parsea el JSON RIPS."""
        return json.loads(rips_json)

    @staticmethod
    def get_all_services(rips_data: Dict[str, Any]) -> List[ServicioRIPS]:
        """Extrae todos los servicios del RIPS en una lista plana."""
        services = []

        usuarios = rips_data.get('usuarios', [])
        for usuario in usuarios:
            servicios = usuario.get('servicios', {})

            # Medicamentos
            for med in servicios.get('medicamentos', []):
                services.append(ServicioRIPS(
                    tipo='medicamentos',
                    codigo=med.get('codTecnologiaSalud', ''),
                    nombre=med.get('nomTecnologiaSalud', ''),
                    valor_unitario=float(med.get('vrUnitMedicamento', 0)),
                    cantidad_original=float(med.get('cantidadMedicamento', 0)),
                    datos_completos=med
                ))

            # Otros Servicios
            for os in servicios.get('otrosServicios', []):
                services.append(ServicioRIPS(
                    tipo='otrosServicios',
                    codigo=os.get('codTecnologiaSalud', ''),
                    nombre=os.get('nomTecnologiaSalud', ''),
                    valor_unitario=float(os.get('vrUnitOS', 0)),
                    cantidad_original=float(os.get('cantidadOS', 0)),
                    datos_completos=os
                ))

            # Procedimientos
            for proc in servicios.get('procedimientos', []):
                services.append(ServicioRIPS(
                    tipo='procedimientos',
                    codigo=proc.get('codProcedimiento', ''),
                    nombre=proc.get('descripcion', ''),
                    valor_unitario=float(proc.get('vrServicio', 0)),
                    cantidad_original=float(proc.get('cantidad', 0)),
                    datos_completos=proc
                ))

            # Consultas
            for cons in servicios.get('consultas', []):
                services.append(ServicioRIPS(
                    tipo='consultas',
                    codigo=cons.get('codConsulta', ''),
                    nombre=cons.get('descripcion', ''),
                    valor_unitario=float(cons.get('vrServicio', 0)),
                    cantidad_original=1.0,
                    datos_completos=cons
                ))

        return services
