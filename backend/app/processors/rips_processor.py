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

    @staticmethod
    def generate_nc_rips(
        rips_data: Dict[str, Any],
        num_nota: str,
        matches: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Genera el RIPS filtrado para la Nota Crédito."""
        # Copiar estructura base
        nc_rips = {
            "numDocumentoIdObligado": rips_data.get("numDocumentoIdObligado", ""),
            "numFactura": rips_data.get("numFactura", ""),
            "tipoNota": "NC",
            "numNota": num_nota,
            "usuarios": []
        }

        # Agrupar matches por tipo de servicio
        services_by_type: Dict[str, List[Dict]] = {}
        for match in matches:
            tipo = match['tipo_servicio']
            if tipo not in services_by_type:
                services_by_type[tipo] = []
            services_by_type[tipo].append(match)

        # Procesar usuarios
        usuarios = rips_data.get('usuarios', [])
        for usuario in usuarios:
            nc_usuario = {
                "tipoDocumentoIdentificacion": usuario.get("tipoDocumentoIdentificacion"),
                "numDocumentoIdentificacion": usuario.get("numDocumentoIdentificacion"),
                "tipoUsuario": usuario.get("tipoUsuario"),
                "fechaNacimiento": usuario.get("fechaNacimiento"),
                "codSexo": usuario.get("codSexo"),
                "codPaisResidencia": usuario.get("codPaisResidencia"),
                "codMunicipioResidencia": usuario.get("codMunicipioResidencia"),
                "codZonaTerritorialResidencia": usuario.get("codZonaTerritorialResidencia"),
                "incapacidad": usuario.get("incapacidad"),
                "consecutivo": usuario.get("consecutivo"),
                "codPaisOrigen": usuario.get("codPaisOrigen"),
                "servicios": {}
            }

            servicios_originales = usuario.get('servicios', {})

            # Procesar cada tipo de servicio
            for tipo, tipo_matches in services_by_type.items():
                if tipo == 'medicamentos':
                    nc_usuario['servicios']['medicamentos'] = RIPSProcessor._process_medicamentos(
                        servicios_originales.get('medicamentos', []),
                        tipo_matches
                    )
                elif tipo == 'otrosServicios':
                    nc_usuario['servicios']['otrosServicios'] = RIPSProcessor._process_otros_servicios(
                        servicios_originales.get('otrosServicios', []),
                        tipo_matches
                    )
                elif tipo == 'procedimientos':
                    nc_usuario['servicios']['procedimientos'] = RIPSProcessor._process_procedimientos(
                        servicios_originales.get('procedimientos', []),
                        tipo_matches
                    )
                elif tipo == 'consultas':
                    nc_usuario['servicios']['consultas'] = RIPSProcessor._process_consultas(
                        servicios_originales.get('consultas', []),
                        tipo_matches
                    )

            # Solo agregar usuario si tiene servicios
            if any(nc_usuario['servicios'].values()):
                nc_rips['usuarios'].append(nc_usuario)

        return nc_rips

    @staticmethod
    def _process_medicamentos(meds_originales: List[Dict], matches: List[Dict]) -> List[Dict]:
        """Procesa medicamentos para la NC."""
        result = []
        for match in matches:
            codigo = match['codigo_rips']
            for med in meds_originales:
                if med.get('codTecnologiaSalud') == codigo:
                    # Crear copia con valores ajustados
                    med_nc = {k: v for k, v in med.items() if k not in ['numAutorizacion', 'idMIPRES', 'fechaDispensAdmon', 'codDiagnosticoPrincipal', 'codDiagnosticoRelacionado', 'tipoMedicamento', 'concentracionMedicamento', 'unidadMedida', 'formaFarmaceutica', 'unidadMinDispensa', 'diasTratamiento', 'tipoDocumentoIdentificacion', 'numDocumentoIdentificacion', 'conceptoRecaudo', 'valorPagoModerador', 'numFEVPagoModerador']}
                    med_nc['cantidadMedicamento'] = match['cantidad_calculada']
                    med_nc['vrServicio'] = match['valor_nc']
                    med_nc['consecutivo'] = len(result) + 1
                    result.append(med_nc)
                    break
        return result

    @staticmethod
    def _process_otros_servicios(os_originales: List[Dict], matches: List[Dict]) -> List[Dict]:
        """Procesa otros servicios para la NC."""
        result = []
        for match in matches:
            codigo = match['codigo_rips']
            for os in os_originales:
                if os.get('codTecnologiaSalud') == codigo:
                    os_nc = {k: v for k, v in os.items() if k not in ['numAutorizacion', 'idMIPRES', 'fechaSuministroTecnologia', 'tipoOS', 'tipoDocumentoIdentificacion', 'numDocumentoIdentificacion', 'conceptoRecaudo', 'valorPagoModerador', 'numFEVPagoModerador']}
                    os_nc['cantidadOS'] = match['cantidad_calculada']
                    os_nc['vrServicio'] = match['valor_nc']
                    os_nc['consecutivo'] = len(result) + 1
                    result.append(os_nc)
                    break
        return result

    @staticmethod
    def _process_procedimientos(proc_originales: List[Dict], matches: List[Dict]) -> List[Dict]:
        """Procesa procedimientos para la NC."""
        result = []
        for match in matches:
            codigo = match['codigo_rips']
            for proc in proc_originales:
                if proc.get('codProcedimiento') == codigo:
                    proc_nc = {k: v for k, v in proc.items()}
                    proc_nc['cantidad'] = match['cantidad_calculada']
                    proc_nc['vrServicio'] = match['valor_nc']
                    proc_nc['consecutivo'] = len(result) + 1
                    result.append(proc_nc)
                    break
        return result

    @staticmethod
    def _process_consultas(cons_originales: List[Dict], matches: List[Dict]) -> List[Dict]:
        """Procesa consultas para la NC."""
        result = []
        for match in matches:
            codigo = match['codigo_rips']
            for cons in cons_originales:
                if cons.get('codConsulta') == codigo:
                    cons_nc = {k: v for k, v in cons.items()}
                    cons_nc['vrServicio'] = match['valor_nc']
                    cons_nc['consecutivo'] = len(result) + 1
                    result.append(cons_nc)
                    break
        return result

    @staticmethod
    def calculate_total(rips_data: Dict[str, Any]) -> float:
        """Calcula el total de vrServicio en el RIPS."""
        total = 0.0
        for usuario in rips_data.get('usuarios', []):
            servicios = usuario.get('servicios', {})
            for tipo, lista in servicios.items():
                for servicio in lista:
                    total += float(servicio.get('vrServicio', 0))
        return total
