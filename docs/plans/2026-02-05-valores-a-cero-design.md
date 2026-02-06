# Deteccion Automatica de Valores Iguales e Igualacion a 0

## Contexto

El caso especial "-LDL" (colesterol) no es unico. Cuando los valores del RIPS y del XML NC son iguales ANTES de procesar (item por item, despues del matching LLM), ambos deben ser puestos a 0 porque significa que se desconto el valor total de la factura original.

## Decisiones de Diseno

1. **Comparacion item por item** despues del matching LLM (no sumatoria total)
2. **Automatico**: si valores coinciden, se aplica sin intervencion del usuario
3. **Coexistencia**: checkbox colesterol se mantiene; deteccion automatica es adicional
4. **Batch**: deteccion automatica solo para carpetas NO-LDL; carpetas LDL mantienen su logica
5. **Preview**: mostrar valores originales ANTES de procesar, con exploradores JSON/XML en modo lectura

## Archivos a Modificar

### Backend
- `xml_processor.py` - Nuevo metodo `aplicar_valores_cero_por_linea()`
- `rips_processor.py` - Modificar procesadores para aceptar items igualados
- `nc_router.py` - Deteccion post-matching, nuevo endpoint `/preview-values`
- `schemas.py` - Nuevos modelos de respuesta
- `batch_processor.py` - Deteccion automatica para carpetas no-LDL

### Frontend
- `api.ts` - Nuevo endpoint, tipos actualizados
- `FileUpload.tsx` - Seccion de previsualizacion con sumatorias y exploradores
- `ResultsView.tsx` - Mostrar sumatorias pre-procesamiento e items igualados
- `BatchProgress.tsx` - Badge para carpetas con items igualados

## Campos Monetarios Afectados

### XML (por linea igualada)
- `LineExtensionAmount` -> 0.00
- `PriceAmount` -> 0.00
- `CreditedQuantity` -> 0.00
- `BaseQuantity` -> 0.00
- Recalcular `LegalMonetaryTotal` sumando lineas resultantes

### RIPS (por tipo de servicio)
- Medicamentos: `vrUnitMedicamento` -> 0, `vrServicio` -> 0
- OtrosServicios: `vrUnitOS` -> 0, `vrServicio` -> 0
- Procedimientos: `vrServicio` -> 0
- Consultas: `vrServicio` -> 0
