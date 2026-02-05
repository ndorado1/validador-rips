import { useState } from 'react'
import { Send, FileJson, FileCode, AlertTriangle, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { xmlToBase64 } from '../services/validationApi'

interface ValidationReviewProps {
  ripsData: Record<string, unknown>
  xmlContent: string
  onSubmit: () => void
  onCancel: () => void
  isSubmitting?: boolean
}

export default function ValidationReview({
  ripsData,
  xmlContent,
  onSubmit,
  onCancel,
  isSubmitting = false
}: ValidationReviewProps) {
  const [confirmed, setConfirmed] = useState(false)
  const [showXml, setShowXml] = useState(false)
  const [showRips, setShowRips] = useState(true)

  // Calcular tamaño aproximado del payload
  const xmlBase64Length = Math.ceil(xmlContent.length * 4 / 3)
  const payloadSizeKB = (JSON.stringify(ripsData).length + xmlBase64Length) / 1024

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4">Revisar Payload para Validación CUV</h2>

      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-800">
          <strong>Información:</strong> Revise los datos antes de enviar al Ministerio de Salud.
          Una vez enviado, no podrá modificarse.
        </p>
      </div>

      {/* Resumen del payload */}
      <div className="mb-4 grid grid-cols-2 gap-4">
        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <FileJson size={16} />
            <span>Tamaño estimado del payload:</span>
          </div>
          <p className="text-lg font-medium">{payloadSizeKB.toFixed(2)} KB</p>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <FileCode size={16} />
            <span>XML codificado en Base64:</span>
          </div>
          <p className="text-lg font-medium">{xmlBase64Length.toLocaleString()} chars</p>
        </div>
      </div>

      {/* Sección RIPS JSON */}
      <div className="mb-4 border rounded-lg overflow-hidden">
        <button
          onClick={() => setShowRips(!showRips)}
          className="w-full px-4 py-3 bg-gray-100 flex items-center justify-between hover:bg-gray-200 transition-colors"
        >
          <div className="flex items-center gap-2">
            <FileJson size={18} className="text-blue-600" />
            <span className="font-medium">Datos RIPS (JSON)</span>
          </div>
          {showRips ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        {showRips && (
          <div className="p-4 bg-gray-900 overflow-auto max-h-96">
            <pre className="text-sm text-green-400 font-mono">
              {JSON.stringify(ripsData, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Sección XML Base64 */}
      <div className="mb-6 border rounded-lg overflow-hidden">
        <button
          onClick={() => setShowXml(!showXml)}
          className="w-full px-4 py-3 bg-gray-100 flex items-center justify-between hover:bg-gray-200 transition-colors"
        >
          <div className="flex items-center gap-2">
            <FileCode size={18} className="text-purple-600" />
            <span className="font-medium">XML en Base64 (truncado)</span>
          </div>
          {showXml ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        {showXml && (
          <div className="p-4 bg-gray-900 overflow-auto max-h-48">
            <pre className="text-sm text-purple-400 font-mono break-all">
              {xmlToBase64(xmlContent).substring(0, 200)}...
            </pre>
            <p className="text-xs text-gray-500 mt-2">
              Mostrando primeros 200 caracteres de {xmlToBase64(xmlContent).length} total
            </p>
          </div>
        )}
      </div>

      {/* Advertencia */}
      <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3">
        <AlertTriangle className="text-yellow-600 flex-shrink-0 mt-0.5" size={20} />
        <div>
          <p className="text-sm text-yellow-800 font-medium">Importante</p>
          <p className="text-sm text-yellow-700">
            Al enviar estos datos al Ministerio de Salud, usted confirma que:
          </p>
          <ul className="text-sm text-yellow-700 list-disc list-inside mt-1">
            <li>Los datos son correctos y completos</li>
            <li>Tiene autorización para realizar esta validación</li>
            <li>Entiende que el proceso puede tardar varios minutos</li>
          </ul>
        </div>
      </div>

      {/* Checkbox de confirmación */}
      <div className="mb-6">
        <label className="flex items-start gap-3 cursor-pointer">
          <div className="relative flex items-center">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 border-gray-300"
            />
            {confirmed && (
              <Check className="absolute left-0.5 top-0.5 text-white pointer-events-none" size={16} />
            )}
          </div>
          <span className="text-sm text-gray-700">
            Confirmo que los datos mostrados son correctos y deseo enviarlos al Ministerio de Salud
          </span>
        </label>
      </div>

      {/* Botones de acción */}
      <div className="flex gap-4">
        <button
          onClick={onCancel}
          disabled={isSubmitting}
          className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          onClick={onSubmit}
          disabled={!confirmed || isSubmitting}
          className="flex-1 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" size={18} />
              Enviando...
            </>
          ) : (
            <>
              <Send size={18} />
              Enviar a Ministerio
            </>
          )}
        </button>
      </div>
    </div>
  )
}

import { Loader2 } from 'lucide-react'
