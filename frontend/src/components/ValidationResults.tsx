import { useState } from 'react'
import { CheckCircle, XCircle, AlertTriangle, Copy, RefreshCw, FileCheck, Download, Key } from 'lucide-react'
import type { NCValidationResponse, ValidationError } from '../services/validationApi'
import { formatValidationErrors } from '../services/validationApi'

interface ValidationResultsProps {
  result: NCValidationResponse
  onRetry: () => void
  onClose: () => void
  numeroNotaCredito?: string
}

export default function ValidationResults({ result, onRetry, onClose, numeroNotaCredito }: ValidationResultsProps) {
  const [copied, setCopied] = useState(false)
  const [cuvCopied, setCuvCopied] = useState(false)

  const handleCopyErrors = () => {
    const allErrors = [...result.errores, ...result.notificaciones]
    const text = formatValidationErrors(allErrors)
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleCopyCUV = () => {
    if (result.codigo_unico_validacion) {
      navigator.clipboard.writeText(result.codigo_unico_validacion)
      setCuvCopied(true)
      setTimeout(() => setCuvCopied(false), 2000)
    }
  }

  const handleDownloadResponse = () => {
    if (result.raw_response) {
      const content = JSON.stringify(result.raw_response, null, 2)
      const blob = new Blob([content], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const ncNumber = numeroNotaCredito || result.codigo_unico_validacion?.substring(0, 8) || 'respuesta'
      a.download = `CUV_${ncNumber}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
  }

  const hasErrors = result.errores.length > 0
  const hasNotifications = result.notificaciones.length > 0
  // El CUV puede venir cuando result_state es true o cuando no hay errores
  const hasCUV = (result.result_state === true || result.result_state === 'true') && result.codigo_unico_validacion

  // Debug: mostrar en consola qué llegó
  console.log('Validation result:', result)
  console.log('Has CUV:', hasCUV, 'result_state:', result.result_state, 'cuv:', result.codigo_unico_validacion)

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4">Resultado de Validación CUV</h2>

      {/* Estado general */}
      <div className={`p-4 rounded-lg mb-6 ${result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
        <div className="flex items-center gap-3">
          {result.success ? (
            <CheckCircle className="text-green-600" size={28} />
          ) : (
            <XCircle className="text-red-600" size={28} />
          )}
          <div className="flex-1">
            <p className={`font-medium ${result.success ? 'text-green-800' : 'text-red-800'}`}>
              {result.success ? 'Validación Exitosa' : 'Validación con Errores'}
            </p>
          </div>
        </div>
      </div>

      {/* Código Único de Validación (CUV) */}
      {hasCUV && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Key className="text-blue-600" size={20} />
            <h3 className="font-medium text-blue-800">Código Único de Validación (CUV)</h3>
          </div>
          <p className="text-xs text-blue-600 mb-2">
            Este código de 96 caracteres hexadecimales certifica la validación exitosa ante el Ministerio.
          </p>
          <div className="flex gap-2">
            <code className="flex-1 p-2 bg-white rounded border border-blue-200 text-sm font-mono break-all text-blue-900">
              {result.codigo_unico_validacion}
            </code>
            <button
              onClick={handleCopyCUV}
              className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center gap-1"
            >
              {cuvCopied ? <CheckCircle size={16} /> : <Copy size={16} />}
              {cuvCopied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        </div>
      )}

      {/* Errores */}
      {hasErrors && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <XCircle className="text-red-600" size={20} />
            <h3 className="font-medium text-red-800">
              Errores ({result.errores.length})
            </h3>
          </div>
          <div className="space-y-3">
            {result.errores.map((error, idx) => (
              <ErrorCard key={`error-${idx}`} error={error} type="error" />
            ))}
          </div>
        </div>
      )}

      {/* Notificaciones (solo mostrar cuando hay errores, no en validación exitosa) */}
      {hasNotifications && !result.success && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="text-orange-500" size={20} />
            <h3 className="font-medium text-orange-800">
              Notificaciones ({result.notificaciones.length}) - No afectan la radicación
            </h3>
          </div>
          <div className="space-y-3">
            {result.notificaciones.map((notif, idx) => (
              <ErrorCard key={`notif-${idx}`} error={notif} type="warning" />
            ))}
          </div>
        </div>
      )}

      {/* Sin errores ni notificaciones */}
      {!hasErrors && !hasNotifications && (
        <div className="mb-6 p-6 bg-green-50 border border-green-200 rounded-lg text-center">
          <FileCheck className="mx-auto text-green-600 mb-2" size={48} />
          <p className="text-green-800 font-medium">Sin errores ni notificaciones</p>
          <p className="text-sm text-green-600 mt-1">
            La validación se completó exitosamente sin observaciones.
          </p>
        </div>
      )}

      {/* Botones de acción */}
      <div className="flex flex-wrap gap-3">
        {(hasErrors || hasNotifications) && (
          <button
            onClick={handleCopyErrors}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {copied ? (
              <>
                <CheckCircle size={18} className="text-green-600" />
                <span>Copiado</span>
              </>
            ) : (
              <>
                <Copy size={18} />
                <span>Copiar errores</span>
              </>
            )}
          </button>
        )}

        {hasCUV && (
          <button
            onClick={handleDownloadResponse}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Download size={18} />
            <span>Descargar Respuesta JSON</span>
          </button>
        )}

        {!result.success && (
          <button
            onClick={onRetry}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RefreshCw size={18} />
            <span>Reintentar</span>
          </button>
        )}

        <button
          onClick={onClose}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Cerrar
        </button>
      </div>
    </div>
  )
}

interface ErrorCardProps {
  error: ValidationError
  type: 'error' | 'warning'
}

function ErrorCard({ error, type }: ErrorCardProps) {
  const [expanded, setExpanded] = useState(false)

  // El tipo viene del Clase del error: RECHAZADO = error (rojo), NOTIFICACION = warning (naranja)
  const isError = type === 'error'

  const bgColor = isError ? 'bg-red-50' : 'bg-orange-50'
  const borderColor = isError ? 'border-red-200' : 'border-orange-200'
  const textColor = isError ? 'text-red-800' : 'text-orange-800'
  const codeColor = isError ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
  const badgeColor = isError ? 'bg-red-600 text-white' : 'bg-orange-500 text-white'

  return (
    <div className={`p-4 ${bgColor} ${borderColor} border rounded-lg`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-2 py-1 text-xs font-medium rounded ${codeColor}`}>
              {error.Clase}
            </span>
            <span className={`text-sm font-mono ${textColor}`}>
              {error.Codigo}
            </span>
          </div>
          <p className={`text-sm ${textColor} font-medium`}>
            {error.Descripcion}
          </p>
          <p className="text-xs text-gray-600 mt-1">
            Fuente: {error.Fuente}
          </p>
        </div>
        {(error.Observaciones || error.PathFuente) && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-gray-500 hover:text-gray-700 ml-2"
          >
            {expanded ? 'Menos' : 'Más'}
          </button>
        )}
      </div>

      {expanded && (error.Observaciones || error.PathFuente) && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          {error.Observaciones && (
            <div className="mb-2">
              <p className="text-xs text-gray-500 font-medium">Observaciones:</p>
              <p className="text-sm text-gray-700">{error.Observaciones}</p>
            </div>
          )}
          {error.PathFuente && (
            <div>
              <p className="text-xs text-gray-500 font-medium">Path:</p>
              <p className="text-sm text-gray-700 font-mono">{error.PathFuente}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
