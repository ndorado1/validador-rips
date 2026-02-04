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
