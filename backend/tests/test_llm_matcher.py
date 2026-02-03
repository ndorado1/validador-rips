import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.services.llm_matcher import LLMMatcher
from app.models import LineaNC, ServicioRIPS, Confianza


class TestMatchByCode:
    def test_match_by_code_success(self):
        matcher = LLMMatcher()

        lineas = [
            LineaNC(id=1, cantidad=1, valor=2000, descripcion="(19943544) PRESERVATIVOS", codigo_extraido="19943544")
        ]

        servicios = [
            ServicioRIPS(tipo="medicamentos", codigo="19943544", nombre="PRESERVATIVOS", valor_unitario=500, cantidad_original=10, datos_completos={})
        ]

        matches, unmatched = matcher._match_by_code(lineas, servicios)

        assert len(matches) == 1
        assert matches[0].codigo_rips == "19943544"
        assert matches[0].cantidad_calculada == 4.0
        assert matches[0].confianza == Confianza.ALTA
        assert len(unmatched) == 0

    def test_match_by_code_no_code(self):
        matcher = LLMMatcher()

        lineas = [
            LineaNC(id=1, cantidad=1, valor=2000, descripcion="PRESERVATIVOS", codigo_extraido=None)
        ]

        servicios = [
            ServicioRIPS(tipo="medicamentos", codigo="19943544", nombre="PRESERVATIVOS", valor_unitario=500, cantidad_original=10, datos_completos={})
        ]

        matches, unmatched = matcher._match_by_code(lineas, servicios)

        assert len(matches) == 0
        assert len(unmatched) == 1

    def test_match_by_code_not_found(self):
        matcher = LLMMatcher()

        lineas = [
            LineaNC(id=1, cantidad=1, valor=2000, descripcion="(99999) UNKNOWN", codigo_extraido="99999")
        ]

        servicios = [
            ServicioRIPS(tipo="medicamentos", codigo="19943544", nombre="PRESERVATIVOS", valor_unitario=500, cantidad_original=10, datos_completos={})
        ]

        matches, unmatched = matcher._match_by_code(lineas, servicios)

        assert len(matches) == 0
        assert len(unmatched) == 1


class TestFallbackMatches:
    def test_fallback_similarity(self):
        matcher = LLMMatcher()

        lineas = [
            LineaNC(id=1, cantidad=1, valor=795, descripcion="FRASCO RECOLECCION ORINA", codigo_extraido=None)
        ]

        servicios = [
            ServicioRIPS(tipo="otrosServicios", codigo="DM-INS-099", nombre="FRASCO PARA RECOLECCION DE ORINA", valor_unitario=795, cantidad_original=1, datos_completos={})
        ]

        matches = matcher._fallback_matches(lineas, servicios)

        assert len(matches) == 1
        assert matches[0].codigo_rips == "DM-INS-099"
        assert matches[0].confianza == Confianza.BAJA
