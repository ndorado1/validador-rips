import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Home, Upload, FileText, Send, CheckCircle, XCircle, AlertCircle, Eye, EyeOff, ChevronDown, ChevronUp, Download } from 'lucide-react'
import { useValidation } from '../context/ValidationContext'
import { enviarCapitaFinal } from '../services/capitaFinalApi'
import type { CapitaFinalResponse } from '../services/capitaFinalApi'
import SisproLoginModal from '../components/SisproLoginModal'

interface CapitaFinalUploadProps {
  ripsFile: File | null
  onRipsSelect: (file: File | null) => void
  onProcess: () => void
  loading: boolean
  canSubmit: boolean
  error: string | null
  fileInputRef: React.RefObject<HTMLInputElement>
}

function CapitaFinalUpload({
  ripsFile,
  onRipsSelect,
  onProcess,
  loading,
  canSubmit,
  error,
  fileInputRef
}: CapitaFinalUploadProps) {
  const handleRipsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.name.endsWith('.json')) {
        onRipsSelect(null)
        alert('El archivo debe ser un JSON de RIPS')
        return
      }
      onRipsSelect(file)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) {
      if (!file.name.endsWith('.json')) {
        alert('El archivo debe ser un JSON de RIPS')
        return
      }
      onRipsSelect(file)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8 transition-all duration-200">
      <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
        <Upload size={24} className="text-cyan-500" />
        Cargar Archivo RIPS JSON (Capita Final)
      </h2>

      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-xl p-12 text-center cursor-pointer
          transition-all duration-200
          ${ripsFile
            ? 'border-cyan-500 bg-cyan-50/50'
            : 'border-gray-300 hover:border-cyan-400 hover:bg-cyan-50/30'
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleRipsChange}
          className="hidden"
          id="rips-upload"
        />

        {ripsFile ? (
          <div className="flex flex-col items-center">
            <CheckCircle className="w-14 h-14 text-cyan-500 mb-4" />
            <p className="text-lg font-semibold text-gray-900">{ripsFile.name}</p>
            <p className="text-sm text-gray-500 mt-1">
              {(ripsFile.size / 1024).toFixed(1)} KB
            </p>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onRipsSelect(null)
                if (fileInputRef.current) fileInputRef.current.value = ''
              }}
              className="mt-4 px-3 py-1 text-sm bg-red-50 text-red-600 hover:bg-red-100 rounded-md transition-colors"
            >
              Eliminar archivo
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <FileText className="w-14 h-14 text-gray-400 mb-4" />
            <p className="text-lg font-medium text-gray-700">
              Arrastra tu archivo RIPS JSON aquí
            </p>
            <p className="text-sm text-gray-500 mt-1">
              o haz clic para seleccionar
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 flex items-center gap-2 text-sm font-medium">
            <XCircle size={18} />
            {error}
          </p>
        </div>
      )}

      <div className="mt-6 p-4 bg-blue-50/70 border border-blue-100 rounded-lg">
        <p className="text-sm text-blue-800 leading-relaxed">
          <strong>Nota:</strong> Capita Final solo requiere el archivo RIPS JSON.
          No lleva archivo XML asociado. En el envío al Ministerio, la sección de XML se configurará automáticamente como una cadena vacía (<code>""</code>).
        </p>
      </div>

      <button
        onClick={onProcess}
        disabled={!canSubmit || loading}
        className="mt-6 w-full py-3 px-4 bg-cyan-500 hover:bg-cyan-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
            Procesando...
          </>
        ) : (
          <>
            <Eye size={20} />
            Previsualizar Payload
          </>
        )}
      </button>
    </div>
  )
}

interface PayloadPreviewProps {
  ripsData: Record<string, unknown> | null
  onSubmit: () => void
  onCancel: () => void
  isSubmitting: boolean
}

function PayloadPreview({ ripsData, onSubmit, onCancel, isSubmitting }: PayloadPreviewProps) {
  const [showPayload, setShowPayload] = useState(true)

  // El payload estructurado tal como se envía al ministerio
  const fullPayload = {
    rips: ripsData,
    xmlFevFile: ""
  }

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
      <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
        <Eye size={24} className="text-cyan-500" />
        Previsualización del Payload a Enviar
      </h2>

      <div className="space-y-4">
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setShowPayload(!showPayload)}
            className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors"
          >
            <span className="font-semibold text-gray-700">JSON Payload</span>
            {showPayload ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
          {showPayload && (
            <div className="p-4 bg-gray-950 overflow-auto max-h-96 rounded-b-lg">
              <pre className="text-sm font-mono text-cyan-400">
                {JSON.stringify(fullPayload, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 flex gap-4">
        <button
          onClick={onCancel}
          className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors"
        >
          Volver
        </button>
        <button
          onClick={onSubmit}
          disabled={isSubmitting}
          className="flex-1 py-3 px-4 bg-cyan-500 hover:bg-cyan-600 disabled:bg-gray-300 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
              Validando...
            </>
          ) : (
            <>
              <Send size={20} />
              Enviar a Validar
            </>
          )}
        </button>
      </div>
    </div>
  )
}

interface ValidationResultsProps {
  result: CapitaFinalResponse
  onRetry: () => void
  onClose: () => void
}

function CapitaFinalResults({ result, onRetry, onClose }: ValidationResultsProps) {
  const hasErrors = result.errores.length > 0
  const hasNotificaciones = result.notificaciones.length > 0

  const handleDownloadResponse = () => {
    if (!result.raw_response) return

    const dataStr = JSON.stringify(result.raw_response, null, 2)
    const blob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)

    let filename = 'CUV_CapitaFinal.json'
    if (result.codigo_unico_validacion) {
      const cuvShort = result.codigo_unico_validacion.substring(0, 8)
      filename = `CUV_CapitaFinal_${cuvShort}.json`
    }

    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const [errorsExpanded, setErrorsExpanded] = useState(true)
  const [notifExpanded, setNotifExpanded] = useState(true)

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
      <div className="flex items-center gap-3 mb-6">
        {result.success ? (
          <CheckCircle size={36} className="text-green-500" />
        ) : (
          <XCircle size={36} className="text-red-500" />
        )}
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {result.success ? 'Validación Exitosa' : 'Validación Fallida'}
          </h2>
          <p className="text-gray-600 mt-1">
            {result.success
              ? 'El paquete de Capita Final fue validado correctamente'
              : 'Se encontraron errores de negocio en la validación'}
          </p>
        </div>
      </div>

      {result.codigo_unico_validacion && (
        <div className="mb-6 p-5 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm font-semibold text-green-800 mb-1">
            Código Único de Validación (CUV):
          </p>
          <p className="text-lg font-mono text-green-900 break-all select-all font-semibold">
            {result.codigo_unico_validacion}
          </p>
        </div>
      )}

      {hasErrors && (
        <div className="mb-6 border border-red-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setErrorsExpanded(!errorsExpanded)}
            className="w-full px-4 py-3 bg-red-50 flex items-center justify-between hover:bg-red-100/70 transition-colors"
          >
            <h3 className="text-lg font-semibold text-red-700 flex items-center gap-2">
              <AlertCircle size={20} />
              Errores ({result.errores.length})
            </h3>
            {errorsExpanded ? <ChevronUp size={20} className="text-red-600" /> : <ChevronDown size={20} className="text-red-600" />}
          </button>
          {errorsExpanded && (
            <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
              {result.errores.map((error, index) => (
                <div key={index} className="p-3 bg-red-50 border border-red-100 rounded-lg">
                  <p className="font-semibold text-red-800">
                    [{error.Clase}] {error.Codigo}
                  </p>
                  <p className="text-red-700 mt-1">{error.Descripcion}</p>
                  {error.Observaciones && (
                    <p className="text-sm text-red-600 mt-1 italic">
                      Observaciones: {error.Observaciones}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {hasNotificaciones && (
        <div className="mb-6 border border-yellow-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setNotifExpanded(!notifExpanded)}
            className="w-full px-4 py-3 bg-yellow-50 flex items-center justify-between hover:bg-yellow-100/70 transition-colors"
          >
            <h3 className="text-lg font-semibold text-yellow-700 flex items-center gap-2">
              <AlertCircle size={20} />
              Notificaciones ({result.notificaciones.length})
            </h3>
            {notifExpanded ? <ChevronUp size={20} className="text-yellow-600" /> : <ChevronDown size={20} className="text-yellow-600" />}
          </button>
          {notifExpanded && (
            <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
              {result.notificaciones.map((notif, index) => (
                <div key={index} className="p-3 bg-yellow-50 border border-yellow-100 rounded-lg">
                  <p className="font-semibold text-yellow-800">
                    [{notif.Clase}] {notif.Codigo}
                  </p>
                  <p className="text-yellow-700 mt-1">{notif.Descripcion}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-8 flex gap-4 flex-wrap">
        <button
          onClick={onClose}
          className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors"
        >
          Cerrar
        </button>
        {result.success && result.raw_response && (
          <button
            onClick={handleDownloadResponse}
            className="flex-1 py-3 px-4 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <Download size={18} />
            Descargar CUV
          </button>
        )}
        {!result.success && (
          <button
            onClick={onRetry}
            className="flex-1 py-3 px-4 bg-cyan-500 hover:bg-cyan-600 text-white font-medium rounded-lg transition-colors"
          >
            Reintentar
          </button>
        )}
      </div>
    </div>
  )
}

function CapitaFinalContent() {
  const navigate = useNavigate()
  const { token, setToken, clearToken, isAuthenticated } = useValidation()

  const [ripsFile, setRipsFile] = useState<File | null>(null)
  const [ripsData, setRipsData] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [step, setStep] = useState<'upload' | 'preview' | 'login' | 'results'>('upload')
  const [validationResult, setValidationResult] = useState<CapitaFinalResponse | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const canSubmit = ripsFile !== null

  const handleProcess = async () => {
    if (!ripsFile) return

    setLoading(true)
    setError(null)

    try {
      const text = await ripsFile.text()
      const parsedJson = JSON.parse(text)
      setRipsData(parsedJson)
      setStep('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al procesar el archivo RIPS JSON')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (!ripsData) return

    if (!isAuthenticated) {
      setStep('login')
      return
    }

    await submitToMinisterio()
  }

  const submitToMinisterio = async (tokenOverride?: string) => {
    if (!ripsData) return

    const tokenToUse = tokenOverride || token
    if (!tokenToUse) {
      setStep('login')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const payload = {
        rips: ripsData
      }

      const response = await enviarCapitaFinal(payload, tokenToUse)
      setValidationResult(response)
      setStep('results')
    } catch (err: any) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      const isAuthError = err?.response?.status === 401 ||
                         errorMessage.includes('401') ||
                         errorMessage.toLowerCase().includes('unauthorized') ||
                         errorMessage.toLowerCase().includes('token expirado')

      if (isAuthError) {
        clearToken()
        setStep('login')
      } else {
        setError(err instanceof Error ? err.message : 'Error al enviar la validación')
        setStep('upload')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleLoginSuccess = (newToken: string) => {
    setToken(newToken)
    setStep('preview')
    submitToMinisterio(newToken)
  }

  const handleReset = () => {
    setRipsFile(null)
    setRipsData(null)
    setError(null)
    setValidationResult(null)
    setStep('upload')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="min-h-screen py-8 px-4 bg-gray-50/50">
      <div className="max-w-4xl mx-auto">
        <div className="relative mb-8">
          <div className="absolute left-0 top-0 flex gap-2">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 px-3 py-2 bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-lg shadow-sm transition-colors"
              title="Volver al Hub"
            >
              <ArrowLeft size={18} />
              <span className="hidden sm:inline">Volver</span>
            </button>
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-3 py-2 bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-lg shadow-sm transition-colors"
              title="Volver al inicio"
            >
              <Home size={18} />
              <span className="hidden sm:inline">Inicio</span>
            </button>
          </div>

          <h1 className="text-3xl font-extrabold text-center text-gray-900 tracking-tight">
            Capita Final
          </h1>
          <p className="text-gray-500 text-center mt-2">
            Validación de Capita Final ante el Ministerio de Salud
          </p>
        </div>

        {step === 'upload' && (
          <CapitaFinalUpload
            ripsFile={ripsFile}
            onRipsSelect={setRipsFile}
            onProcess={handleProcess}
            loading={loading}
            canSubmit={canSubmit}
            error={error}
            fileInputRef={fileInputRef}
          />
        )}

        {step === 'preview' && ripsData && (
          <PayloadPreview
            ripsData={ripsData}
            onSubmit={handleSubmit}
            onCancel={() => setStep('upload')}
            isSubmitting={isSubmitting}
          />
        )}

        {step === 'results' && validationResult && (
          <CapitaFinalResults
            result={validationResult}
            onRetry={() => setStep('preview')}
            onClose={handleReset}
          />
        )}
      </div>

      <SisproLoginModal
        isOpen={step === 'login'}
        onClose={() => setStep('preview')}
        onLoginSuccess={handleLoginSuccess}
      />
    </div>
  )
}

export default function CapitaFinalPage() {
  return <CapitaFinalContent />
}
