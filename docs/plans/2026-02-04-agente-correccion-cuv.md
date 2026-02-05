# Agente de Corrección CUV - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implementar un agente de IA (kimi-k2.5) que analice errores de validación CUV y proponga correcciones específicas que el usuario pueda aprobar/rechazar antes de aplicar.

**Architecture:** Backend service que consulta Kimi API con errores+archivos, devuelve propuestas estructuradas. Frontend muestra formulario guiado con cada error y campos editables pre-llenados. Cambios aprobados se aplican a objetos en memoria.

**Tech Stack:** FastAPI, React+TypeScript, Kimi API (kimi-k2.5), pydantic

---

## Task 1: Crear Schema PropuestaCorreccion

**Files:**
- Create: `backend/app/models/correccion_schemas.py`
- Modify: `backend/app/models/__init__.py`

**Step 1: Write the schema**

```python
from pydantic import BaseModel
from typing import List, Optional, Any

class PropuestaCorreccion(BaseModel):
    error_codigo: str
    error_descripcion: str
    campo: str
    ruta_json: Optional[str] = None
    ruta_xml: Optional[str] = None
    valor_actual: Any
    valor_propuesto: Any
    justificacion: str

class CorreccionRequest(BaseModel):
    errores: List[dict]  # ValidationError como dicts
    xml_content: str
    rips_json: dict

class CorreccionResponse(BaseModel):
    propuestas: List[PropuestaCorreccion]
    requieren_revision_manual: List[dict]  # Errores que el agente no pudo entender

class CambioAprobado(BaseModel):
    ruta_json: str
    valor_nuevo: Any

class AplicarCorreccionRequest(BaseModel):
    cambios: List[CambioAprobado]
    xml_original: str
    rips_json_original: dict

class AplicarCorreccionResponse(BaseModel):
    xml_corregido: str
    rips_json_corregido: dict
    cambios_aplicados: int
```

**Step 2: Export from models/__init__.py**

Add to `backend/app/models/__init__.py`:
```python
from .correccion_schemas import (
    PropuestaCorreccion,
    CorreccionRequest,
    CorreccionResponse,
    CambioAprobado,
    AplicarCorreccionRequest,
    AplicarCorreccionResponse,
)
```

**Step 3: Commit**

```bash
git add backend/app/models/
git commit -m "feat: add correction schemas for AI agent"
```

---

## Task 2: Crear Servicio CorreccionAgent

**Files:**
- Create: `backend/app/services/correccion_agent.py`

**Step 1: Write the service**

```python
import json
import os
from typing import List, Dict, Any
from openai import AsyncOpenAI

from app.models import (
    PropuestaCorreccion,
    CorreccionRequest,
    CorreccionResponse,
    ValidationError
)
from app.config import settings


class CorreccionAgent:
    """Agente de IA para proponer correcciones a errores de validación CUV."""

    def __init__(self):
        self.client = AsyncOpenAI(
            api_key=os.getenv("KIMI_API_KEY"),
            base_url="https://api.moonshot.cn/v1"
        )
        self.model = "kimi-k2.5"

    async def analizar_errores(
        self,
        errores: List[ValidationError],
        xml_content: str,
        rips_json: dict
    ) -> CorreccionResponse:
        """
        Analiza errores y propone correcciones usando Kimi.
        """
        # Construir prompt
        prompt = self._construir_prompt(errores, xml_content, rips_json)

        # Llamar a Kimi
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": "Eres un experto en validación RIPS del Ministerio de Salud de Colombia."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.1,  # Baja creatividad para respuestas consistentes
            response_format={"type": "json_object"}
        )

        # Parsear respuesta
        content = response.choices[0].message.content
        resultado = json.loads(content)

        return self._parsear_resultado(resultado, errores)

    def _construir_prompt(
        self,
        errores: List[ValidationError],
        xml_content: str,
        rips_json: dict
    ) -> str:
        """Construye el prompt para el agente."""

        errores_str = "\n".join([
            f"- Código: {e.Codigo}, Clase: {e.Clase}\n"
            f"  Descripción: {e.Descripcion}\n"
            f"  Observaciones: {e.Observaciones or 'N/A'}\n"
            f"  Path: {e.PathFuente or 'N/A'}"
            for e in errores
        ])

        # Truncar XML si es muy largo
        xml_truncado = xml_content[:5000] + "..." if len(xml_content) > 5000 else xml_content

        return f"""Analiza los siguientes errores de validación CUV del Ministerio de Salud y propone correcciones específicas.

ERRORES DE VALIDACIÓN:
{errores_str}

RIPS JSON ACTUAL:
```json
{json.dumps(rips_json, indent=2, ensure_ascii=False)[:3000]}
```

XML ACTUAL (parcial):
```xml
{xml_truncado}
```

Para cada error que puedas corregir automáticamente, indica:
1. error_codigo: El código del error (ej: RVC005)
2. campo: Nombre del campo a modificar
3. ruta_json: Ruta en notación punto al campo en el JSON (ej: usuarios[0].tipoUsuario)
4. ruta_xml: XPath o descripción de dónde está en el XML
5. valor_actual: Valor actual del campo
6. valor_propuesto: Valor corregido propuesto
7. justificacion: Breve explicación de por qué este cambio soluciona el error

Para errores que NO puedas corregir automáticamente (requieren decisión humana o información adicional), inclúyelos en la lista "requieren_revision_manual".

Responde EXACTAMENTE en este formato JSON:
{{
  "propuestas": [
    {{
      "error_codigo": "RVC005",
      "error_descripcion": "El tipo de usuario no coincide",
      "campo": "tipoUsuario",
      "ruta_json": "usuarios[0].tipoUsuario",
      "ruta_xml": "//tipoUsuario",
      "valor_actual": "04",
      "valor_propuesto": "10",
      "justificacion": "El tipo de usuario debe coincidir con la cobertura informada en la factura"
    }}
  ],
  "requieren_revision_manual": [
    {{
      "codigo": "RVG08",
      "descripcion": "El valor no coincide",
      "razon": "Requiere verificar el cálculo manualmente"
    }}
  ]
}}"""

    def _parsear_resultado(
        self,
        resultado: dict,
        errores_originales: List[ValidationError]
    ) -> CorreccionResponse:
        """Parsea el resultado de Kimi al formato CorreccionResponse."""

        propuestas = []
        for p in resultado.get("propuestas", []):
            propuestas.append(PropuestaCorreccion(
                error_codigo=p.get("error_codigo", ""),
                error_descripcion=p.get("error_descripcion", ""),
                campo=p.get("campo", ""),
                ruta_json=p.get("ruta_json"),
                ruta_xml=p.get("ruta_xml"),
                valor_actual=p.get("valor_actual"),
                valor_propuesto=p.get("valor_propuesto"),
                justificacion=p.get("justificacion", "")
            ))

        requieren_revision = resultado.get("requieren_revision_manual", [])

        return CorreccionResponse(
            propuestas=propuestas,
            requieren_revision_manual=requieren_revision
        )
```

**Step 2: Commit**

```bash
git add backend/app/services/correccion_agent.py
git commit -m "feat: create CorreccionAgent service with Kimi integration"
```

---

## Task 3: Crear Router de Corrección

**Files:**
- Create: `backend/app/api/correccion_router.py`
- Modify: `backend/app/main.py`

**Step 1: Write the router**

```python
from fastapi import APIRouter, HTTPException
from typing import List

from app.models import (
    CorreccionRequest,
    CorreccionResponse,
    AplicarCorreccionRequest,
    AplicarCorreccionResponse,
    ValidationError,
    PropuestaCorreccion
)
from app.services.correccion_agent import CorreccionAgent

router = APIRouter()


@router.post("/analizar", response_model=CorreccionResponse)
async def analizar_errores(request: CorreccionRequest):
    """
    Analiza errores de validación y propone correcciones usando IA.
    """
    try:
        # Convertir errores dict a ValidationError
        errores = [
            ValidationError(
                Clase=e.get("Clase", ""),
                Codigo=e.get("Codigo", ""),
                Descripcion=e.get("Descripcion", ""),
                Fuente=e.get("Fuente", ""),
                Observaciones=e.get("Observaciones"),
                PathFuente=e.get("PathFuente")
            )
            for e in request.errores
        ]

        agent = CorreccionAgent()
        resultado = await agent.analizar_errores(
            errores=errores,
            xml_content=request.xml_content,
            rips_json=request.rips_json
        )

        return resultado

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al analizar: {str(e)}")


@router.post("/aplicar", response_model=AplicarCorreccionResponse)
async def aplicar_correcciones(request: AplicarCorreccionRequest):
    """
    Aplica las correcciones aprobadas a los archivos.
    """
    try:
        import copy

        # Copiar objetos originales
        rips_corregido = copy.deepcopy(request.rips_json_original)
        cambios_aplicados = 0

        # Aplicar cada cambio
        for cambio in request.cambios:
            if _aplicar_cambio_json(rips_corregido, cambio.ruta_json, cambio.valor_nuevo):
                cambios_aplicados += 1

        # TODO: Aplicar cambios al XML si es necesario
        xml_corregido = request.xml_original

        return AplicarCorreccionResponse(
            xml_corregido=xml_corregido,
            rips_json_corregido=rips_corregido,
            cambios_aplicados=cambios_aplicados
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al aplicar: {str(e)}")


def _aplicar_cambio_json(obj: dict, ruta: str, valor_nuevo: any) -> bool:
    """
    Aplica un cambio a un objeto JSON dada una ruta en notación punto.
    Soporta índices de array: usuarios[0].tipoUsuario
    """
    import re

    try:
        # Parsear ruta: usuarios[0].tipoUsuario -> ['usuarios', '0', 'tipoUsuario']
        partes = re.split(r'\.|\[(\d+)\]', ruta)
        partes = [p for p in partes if p is not None and p != '']

        # Navegar hasta el padre del último campo
        actual = obj
        for parte in partes[:-1]:
            if parte.isdigit():
                actual = actual[int(parte)]
            else:
                actual = actual[parte]

        # Aplicar el cambio
        ultimo_campo = partes[-1]
        if ultimo_campo.isdigit():
            actual[int(ultimo_campo)] = valor_nuevo
        else:
            actual[ultimo_campo] = valor_nuevo

        return True

    except (KeyError, IndexError, TypeError):
        return False
```

**Step 2: Register router in main.py**

Add to `backend/app/main.py`:
```python
from app.api import correccion_router

# Add after validation_router
app.include_router(correccion_router.router, prefix="/api/correccion", tags=["Corrección"])
```

**Step 3: Commit**

```bash
git add backend/app/api/correccion_router.py backend/app/main.py
git commit -m "feat: add correction router with analyze and apply endpoints"
```

---

## Task 4: Crear API Client Frontend

**Files:**
- Modify: `frontend/src/services/validationApi.ts`

**Step 1: Add interfaces and functions**

Add to `frontend/src/services/validationApi.ts`:

```typescript
export interface PropuestaCorreccion {
  error_codigo: string
  error_descripcion: string
  campo: string
  ruta_json?: string
  ruta_xml?: string
  valor_actual: any
  valor_propuesto: any
  justificacion: string
}

export interface CorreccionResponse {
  propuestas: PropuestaCorreccion[]
  requieren_revision_manual: Array<{
    codigo: string
    descripcion: string
    razon: string
  }>
}

export interface CambioAprobado {
  ruta_json: string
  valor_nuevo: any
}

export interface AplicarCorreccionRequest {
  cambios: CambioAprobado[]
  xml_original: string
  rips_json_original: Record<string, unknown>
}

export interface AplicarCorreccionResponse {
  xml_corregido: string
  rips_json_corregido: Record<string, unknown>
  cambios_aplicados: number
}

export async function analizarErrores(
  errores: ValidationError[],
  xmlContent: string,
  ripsJson: Record<string, unknown>
): Promise<CorreccionResponse> {
  const response = await axios.post<CorreccionResponse>(
    `${VALIDATION_API_URL}/correccion/analizar`,
    {
      errores,
      xml_content: xmlContent,
      rips_json: ripsJson
    }
  )
  return response.data
}

export async function aplicarCorrecciones(
  request: AplicarCorreccionRequest
): Promise<AplicarCorreccionResponse> {
  const response = await axios.post<AplicarCorreccionResponse>(
    `${VALIDATION_API_URL}/correccion/aplicar`,
    request
  )
  return response.data
}
```

**Step 2: Commit**

```bash
git add frontend/src/services/validationApi.ts
git commit -m "feat: add correction API client functions"
```

---

## Task 5: Crear Componente CorreccionPanel

**Files:**
- Create: `frontend/src/components/CorreccionPanel.tsx`

**Step 1: Write the component**

```typescript
import { useState } from 'react'
import { Check, X, AlertCircle, Loader2, Sparkles } from 'lucide-react'
import type { PropuestaCorreccion, CambioAprobado } from '../services/validationApi'

interface CorreccionPanelProps {
  propuestas: PropuestaCorreccion[]
  requierenRevision: Array<{ codigo: string; descripcion: string; razon: string }>
  onAplicar: (cambios: CambioAprobado[]) => void
  onCancelar: () => void
  isLoading?: boolean
}

export default function CorreccionPanel({
  propuestas,
  requierenRevision,
  onAplicar,
  onCancelar,
  isLoading = false
}: CorreccionPanelProps) {
  const [decisiones, setDecisiones] = useState<Record<number, 'aprobado' | 'rechazado' | null>>(
    () => Object.fromEntries(propuestas.map((_, i) => [i, null]))
  )
  const [valoresEditados, setValoresEditados] = useState<Record<number, any>>(
    () => Object.fromEntries(propuestas.map((p, i) => [i, p.valor_propuesto]))
  )

  const handleAprobar = (index: number) => {
    setDecisiones(prev => ({ ...prev, [index]: 'aprobado' }))
  }

  const handleRechazar = (index: number) => {
    setDecisiones(prev => ({ ...prev, [index]: 'rechazado' }))
  }

  const handleValorChange = (index: number, valor: any) => {
    setValoresEditados(prev => ({ ...prev, [index]: valor }))
  }

  const handleAplicar = () => {
    const cambios: CambioAprobado[] = []

    propuestas.forEach((propuesta, index) => {
      if (decisiones[index] === 'aprobado' && propuesta.ruta_json) {
        cambios.push({
          ruta_json: propuesta.ruta_json,
          valor_nuevo: valoresEditados[index]
        })
      }
    })

    onAplicar(cambios)
  }

  const aprobadosCount = Object.values(decisiones).filter(d => d === 'aprobado').length
  const rechazadosCount = Object.values(decisiones).filter(d => d === 'rechazado').length
  const pendientesCount = propuestas.length - aprobadosCount - rechazadosCount

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8 text-center">
        <Loader2 className="mx-auto animate-spin text-blue-600 mb-4" size={48} />
        <h3 className="text-lg font-medium text-gray-800">Analizando errores con IA...</h3>
        <p className="text-gray-600 mt-2">Esto puede tomar unos segundos</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center gap-3 mb-4">
        <Sparkles className="text-purple-600" size={24} />
        <h2 className="text-xl font-semibold">Corrección con IA</h2>
      </div>

      <p className="text-gray-600 mb-6">
        Revisa las propuestas de corrección generadas por el agente de IA.
        Puedes aprobar, rechazar o modificar cada propuesta antes de aplicar.
      </p>

      {/* Resumen */}
      <div className="flex gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="text-center">
          <span className="text-2xl font-bold text-green-600">{aprobadosCount}</span>
          <p className="text-sm text-gray-600">Aprobados</p>
        </div>
        <div className="text-center">
          <span className="text-2xl font-bold text-red-600">{rechazadosCount}</span>
          <p className="text-sm text-gray-600">Rechazados</p>
        </div>
        <div className="text-center">
          <span className="text-2xl font-bold text-yellow-600">{pendientesCount}</span>
          <p className="text-sm text-gray-600">Pendientes</p>
        </div>
      </div>

      {/* Propuestas */}
      <div className="space-y-4 mb-6">
        {propuestas.map((propuesta, index) => (
          <div
            key={index}
            className={`border rounded-lg p-4 ${
              decisiones[index] === 'aprobado'
                ? 'border-green-300 bg-green-50'
                : decisiones[index] === 'rechazado'
                ? 'border-red-300 bg-red-50 opacity-60'
                : 'border-gray-200'
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <span className="inline-block px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded mb-2">
                  {propuesta.error_codigo}
                </span>
                <p className="text-sm text-gray-700">{propuesta.error_descripcion}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAprobar(index)}
                  className={`p-2 rounded ${
                    decisiones[index] === 'aprobado'
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 hover:bg-green-100'
                  }`}
                  title="Aprobar"
                >
                  <Check size={18} />
                </button>
                <button
                  onClick={() => handleRechazar(index)}
                  className={`p-2 rounded ${
                    decisiones[index] === 'rechazado'
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-100 hover:bg-red-100'
                  }`}
                  title="Rechazar"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-3">
              <div>
                <label className="text-xs text-gray-500">Campo</label>
                <p className="text-sm font-medium">{propuesta.campo}</p>
                {propuesta.ruta_json && (
                  <p className="text-xs text-gray-400">{propuesta.ruta_json}</p>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-500">Justificación</label>
                <p className="text-sm text-gray-600">{propuesta.justificacion}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500">Valor actual</label>
                <div className="p-2 bg-gray-100 rounded text-sm font-mono">
                  {String(propuesta.valor_actual)}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500">Valor propuesto</label>
                <input
                  type="text"
                  value={String(valoresEditados[index])}
                  onChange={(e) => handleValorChange(index, e.target.value)}
                  disabled={decisiones[index] === 'rechazado'}
                  className="w-full p-2 border rounded text-sm font-mono disabled:bg-gray-100"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Requieren revisión manual */}
      {requierenRevision.length > 0 && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="text-yellow-600" size={20} />
            <h3 className="font-medium text-yellow-800">Requieren revisión manual</h3>
          </div>
          <p className="text-sm text-yellow-700 mb-2">
            Estos errores no pudieron ser analizados automáticamente:
          </p>
          <ul className="list-disc list-inside text-sm text-yellow-700">
            {requierenRevision.map((item, i) => (
              <li key={i}>
                <strong>{item.codigo}:</strong> {item.descripcion}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Botones */}
      <div className="flex gap-3">
        <button
          onClick={onCancelar}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          onClick={handleAplicar}
          disabled={aprobadosCount === 0}
          className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300"
        >
          Aplicar {aprobadosCount > 0 && `(${aprobadosCount})`} cambios
        </button>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/CorreccionPanel.tsx
git commit -m "feat: create CorreccionPanel component for AI correction workflow"
```

---

## Task 6: Integrar en App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`

**Step 1: Add state and handlers**

Add imports:
```typescript
import CorreccionPanel from './components/CorreccionPanel'
import { analizarErrores, aplicarCorrecciones } from './services/validationApi'
import type { PropuestaCorreccion, CorreccionResponse } from './services/validationApi'
```

Add state:
```typescript
// Estados para corrección
const [showCorreccion, setShowCorreccion] = useState(false)
const [correccionLoading, setCorreccionLoading] = useState(false)
const [correccionData, setCorreccionData] = useState<CorreccionResponse | null>(null)
```

Add handlers:
```typescript
const handleIniciarCorreccion = async () => {
  if (!validationResult) return

  setCorreccionLoading(true)
  setShowCorreccion(true)

  try {
    const response = await analizarErrores(
      validationResult.errores,
      result!.nc_xml_completo,
      result!.nc_rips_json
    )
    setCorreccionData(response)
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Error al analizar')
    setShowCorreccion(false)
  } finally {
    setCorreccionLoading(false)
  }
}

const handleAplicarCorrecciones = async (cambios: CambioAprobado[]) => {
  if (!result) return

  try {
    const response = await aplicarCorrecciones({
      cambios,
      xml_original: result.nc_xml_completo,
      rips_json_original: result.nc_rips_json
    })

    // Actualizar resultado con archivos corregidos
    setResult({
      ...result,
      nc_xml_completo: response.xml_corregido,
      nc_rips_json: response.rips_json_corregido
    })

    // Volver a pantalla de validación
    setShowCorreccion(false)
    setCorreccionData(null)

    // Opcional: reenviar automáticamente a validación
    // handleValidationSubmit()

  } catch (err) {
    setError(err instanceof Error ? err.message : 'Error al aplicar correcciones')
  }
}
```

**Step 2: Add UI rendering**

Add button in ValidationResults when there are errors:
```typescript
{!result.success && (
  <button
    onClick={handleIniciarCorreccion}
    className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
  >
    <Sparkles size={18} />
    <span>Corregir con IA</span>
  </button>
)}
```

Add rendering for correction panel:
```typescript
{showCorreccion && correccionData && (
  <CorreccionPanel
    propuestas={correccionData.propuestas}
    requierenRevision={correccionData.requieren_revision_manual}
    onAplicar={handleAplicarCorrecciones}
    onCancelar={() => setShowCorreccion(false)}
    isLoading={correccionLoading}
  />
)}
```

**Step 3: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: integrate correction panel into main app flow"
```

---

## Task 7: Agregar Variable de Entorno

**Files:**
- Modify: `backend/.env.example` (or create if doesn't exist)
- Modify: `backend/app/config.py`

**Step 1: Add to config.py**

```python
class Settings(BaseSettings):
    # ... existing settings ...

    # Kimi API
    kimi_api_key: str = ""
    kimi_model: str = "kimi-k2.5"
    kimi_base_url: str = "https://api.moonshot.cn/v1"
```

**Step 2: Add to .env**

```
KIMI_API_KEY=your_api_key_here
```

**Step 3: Commit**

```bash
git add backend/app/config.py backend/.env
git commit -m "feat: add Kimi API configuration"
```

---

## Task 8: Testing Manual

**Test scenarios:**

1. **Validación con errores RECHAZADO**
   - Subir NC con errores conocidos
   - Enviar a validación
   - Clicar "Corregir con IA"
   - Verificar que el agente propone cambios
   - Aprobar algunos cambios
   - Aplicar y verificar que se actualizan los archivos

2. **Validación exitosa**
   - Subir NC válida
   - Verificar que NO aparece botón "Corregir con IA"

3. **Solo notificaciones**
   - Subir NC con solo notificaciones (no errores)
   - Verificar que aparece CUV y NO aparece botón de corrección

---

## Summary

This plan implements:

1. **Backend**: Schemas, CorreccionAgent service (Kimi integration), router with analyze/apply endpoints
2. **Frontend**: API client, CorreccionPanel component, integration in App.tsx
3. **Flow**: User sees errors → clicks "Corregir con IA" → agent analyzes → user approves/rejects proposals → changes applied → can re-validate

**Key files created/modified:**
- `backend/app/models/correccion_schemas.py`
- `backend/app/services/correccion_agent.py`
- `backend/app/api/correccion_router.py`
- `frontend/src/services/validationApi.ts`
- `frontend/src/components/CorreccionPanel.tsx`
- `frontend/src/App.tsx`
