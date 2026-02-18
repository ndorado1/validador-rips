import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Home, Upload, FileText, Send, CheckCircle, XCircle, AlertCircle, Eye, EyeOff, Sparkles, ChevronDown, ChevronUp, Download } from 'lucide-react'
import { useValidation } from '../context/ValidationContext'
import { aplicarCorrecciones, xmlToBase64 } from '../services/validationApi'
import type { CambioAprobado, CorreccionResponse } from '../services/validationApi'
import { enviarFevRips, fileToBase64 } from '../services/fevRipsApi'
import type { FevRipsResponse } from '../services/fevRipsApi'
import SisproLoginModal from '../components/SisproLoginModal'
import CorreccionPanel from '../components/CorreccionPanel'

interface FevRipsFileUploadProps {
  xmlFile: File | null
  ripsFile: File | null
  onXmlSelect: (file: File | null) => void
  onRipsSelect: (file: File | null) => void
  onProcess: () => void
  loading: boolean
  canSubmit: boolean
  error: string | null
}

function FevRipsFileUpload({ xmlFile, ripsFile, onXmlSelect, onRipsSelect, onProcess, loading, canSubmit, error }: FevRipsFileUploadProps) {
  const handleXmlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onXmlSelect(file)
  }

  const handleRipsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onRipsSelect(file)
  }

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Upload size={24} className="text-amber-500" />
        Cargar Archivos FEV RIPS
      </h2>

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Archivo XML FEV</label>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-amber-400 transition-colors">
            <input type="file" accept=".xml" onChange={handleXmlChange} className="hidden" id="fev-xml-upload" />
            <label htmlFor="fev-xml-upload" className="cursor-pointer">
              <FileText size={32} className="mx-auto text-gray-400 mb-2" />
              <span className="text-sm text-gray-600">
                {xmlFile ? xmlFile.name : 'Haz clic para seleccionar XML'}
              </span>
            </label>
          </div>
          {xmlFile && (
            <p className="mt-2 text-sm text-amber-600 flex items-center gap-1">
              <CheckCircle size={14} />
              Archivo seleccionado
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Archivo RIPS JSON</label>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-amber-400 transition-colors">
            <input type="file" accept=".json" onChange={handleRipsChange} className="hidden" id="fev-rips-upload" />
            <label htmlFor="fev-rips-upload" className="cursor-pointer">
              <FileText size={32} className="mx-auto text-gray-400 mb-2" />
              <span className="text-sm text-gray-600">
                {ripsFile ? ripsFile.name : 'Haz clic para seleccionar JSON'}
              </span>
            </label>
          </div>
          {ripsFile && (
            <p className="mt-2 text-sm text-amber-600 flex items-center gap-1">
              <CheckCircle size={14} />
              Archivo seleccionado
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 flex items-center gap-2">
            <XCircle size={18} />
            {error}
          </p>
        </div>
      )}

      <button
        onClick={onProcess}
        disabled={!canSubmit || loading}
        className="mt-6 w-full py-3 px-4 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
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
  xmlBase64: string | null
  onSubmit: () => void
  onCancel: () => void
  isSubmitting: boolean
}

function PayloadPreview({ ripsData, xmlBase64, onSubmit, onCancel, isSubmitting }: PayloadPreviewProps) {
  const [showRips, setShowRips] = useState(true)
  const [showXml, setShowXml] = useState(true)

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Eye size={24} className="text-amber-500" />
        Previsualización del Payload
      </h2>

      <div className="space-y-4">
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setShowRips(!showRips)}
            className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors"
          >
            <span className="font-medium text-gray-700">RIPS JSON</span>
            {showRips ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
          {showRips && ripsData && (
            <div className="p-4 bg-gray-900 overflow-auto max-h-96">
              <pre className="text-sm text-green-400">{JSON.stringify(ripsData, null, 2)}</pre>
            </div>
          )}
        </div>

        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setShowXml(!showXml)}
            className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors"
          >
            <span className="font-medium text-gray-700">XML en Base64</span>
            {showXml ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
          {showXml && xmlBase64 && (
            <div className="p-4 bg-gray-900 overflow-auto max-h-48">
              <code className="text-xs text-blue-400 break-all">{xmlBase64.substring(0, 500)}...</code>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <button onClick={onCancel} className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors">
          Volver
        </button>
        <button
          onClick={onSubmit}
          disabled={isSubmitting}
          className="flex-1 py-3 px-4 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
              Enviando...
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
  result: FevRipsResponse
  onRetry: () => void
  onClose: () => void
}

function FevRipsValidationResults({ result, onRetry, onClose }: ValidationResultsProps) {
  const hasErrors = result.errores.length > 0
  const hasNotificaciones = result.notificaciones.length > 0

  const handleDownloadResponse = () => {
    if (!result.raw_response) return
    const dataStr = JSON.stringify(result.raw_response, null, 2)
    const blob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    let filename = 'CUV_FevRips.json'
    if (result.codigo_unico_validacion) {
      const cuvShort = result.codigo_unico_validacion.substring(0, 8)
      filename = `CUV_FevRips_${cuvShort}.json`
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

  const notificacionesPorCodigo = result.notificaciones.reduce((acc, notif) => {
    const key = `${notif.Clase}-${notif.Codigo}`
    if (!acc[key]) acc[key] = { ...notif, count: 0 }
    acc[key].count++
    return acc
  }, {} as Record<string, typeof result.notificaciones[0] & { count: number }>)

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-6">
        {result.success ? (
          <CheckCircle size={32} className="text-green-500" />
        ) : (
          <XCircle size={32} className="text-red-500" />
        )}
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            {result.success ? 'Validación Exitosa' : 'Validación Fallida'}
          </h2>
          <p className="text-gray-600">
            {result.success ? 'El paquete fue validado correctamente' : 'Se encontraron errores en la validación'}
          </p>
        </div>
      </div>

      {result.codigo_unico_validacion && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm font-medium text-green-800 mb-1">Código Único de Validación (CUV)</p>
          <p className="text-lg font-mono text-green-700 break-all">{result.codigo_unico_validacion}</p>
        </div>
      )}

      {hasErrors && (
        <div className="mb-6 border border-red-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setErrorsExpanded(!errorsExpanded)}
            className="w-full px-4 py-3 bg-red-50 flex items-center justify-between hover:bg-red-100 transition-colors"
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
                <div key={index} className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="font-medium text-red-800">[{error.Clase}] {error.Codigo}</p>
                  <p className="text-red-700">{error.Descripcion}</p>
                  {error.Observaciones && <p className="text-sm text-red-600 mt-1">{error.Observaciones}</p>}
                  {error.PathFuente && (
                    <p className="text-sm text-red-700 mt-1 font-mono bg-red-100 px-2 py-1 rounded">
                      Ruta: {error.PathFuente}
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
            className="w-full px-4 py-3 bg-yellow-50 flex items-center justify-between hover:bg-yellow-100 transition-colors"
          >
            <h3 className="text-lg font-semibold text-yellow-700 flex items-center gap-2">
              <AlertCircle size={20} />
              Notificaciones ({result.notificaciones.length})
            </h3>
            {notifExpanded ? <ChevronUp size={20} className="text-yellow-600" /> : <ChevronDown size={20} className="text-yellow-600" />}
          </button>
          {notifExpanded ? (
            <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
              {result.notificaciones.map((notif, index) => (
                <div key={index} className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="font-medium text-yellow-800">[{notif.Clase}] {notif.Codigo}</p>
                  <p className="text-yellow-700">{notif.Descripcion}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 bg-yellow-50/50">
              <p className="text-sm text-yellow-700">
                {Object.values(notificacionesPorCodigo).map((notif, idx, arr) => (
                  <span key={idx}>
                    <strong>[{notif.Clase}] {notif.Codigo}</strong>: {notif.count} ocurrencias
                    {idx < arr.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </p>
              <p className="text-xs text-yellow-600 mt-1">Haz clic en el encabezado para expandir y ver todos los detalles</p>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3 flex-wrap">
        <button onClick={onClose} className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors">
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
          <button onClick={onRetry} className="flex-1 py-3 px-4 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors">
            Reintentar
          </button>
        )}
      </div>
    </div>
  )
}

function FevRipsContent() {
  const navigate = useNavigate()
  const { token, setToken, clearToken, isAuthenticated } = useValidation()

  const [xmlFile, setXmlFile] = useState<File | null>(null)
  const [ripsFile, setRipsFile] = useState<File | null>(null)
  const [ripsData, setRipsData] = useState<Record<string, unknown> | null>(null)
  const [xmlBase64, setXmlBase64] = useState<string | null>(null)
  const [xmlContent, setXmlContent] = useState<string | null>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [step, setStep] = useState<'upload' | 'preview' | 'login' | 'results'>('upload')
  const [validationResult, setValidationResult] = useState<FevRipsResponse | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [showCorreccion, setShowCorreccion] = useState(false)
  const [correccionLoading, setCorreccionLoading] = useState(false)
  const [correccionData, setCorreccionData] = useState<CorreccionResponse | null>(null)

  const canSubmit = xmlFile && ripsFile

  const handleProcess = async () => {
    if (!xmlFile || !ripsFile) return
    setLoading(true)
    setError(null)
    try {
      const ripsText = await ripsFile.text()
      const ripsParsed = JSON.parse(ripsText)
      setRipsData(ripsParsed)

      const xmlRaw = await xmlFile.text()
      setXmlContent(xmlRaw)
      const xmlBase64String = await fileToBase64(xmlFile)
      setXmlBase64(xmlBase64String)
      setStep('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al procesar archivos')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (!ripsData || !xmlBase64) return
    if (!isAuthenticated) {
      setStep('login')
      return
    }
    await submitToMinisterio()
  }

  const submitToMinisterio = async (tokenOverride?: string) => {
    if (!ripsData || !xmlBase64) return
    const tokenToUse = tokenOverride || token
    if (!tokenToUse) {
      setStep('login')
      return
    }

    setIsSubmitting(true)
    setError(null)
    try {
      const payload = { rips: ripsData, xmlFevFile: xmlBase64 }
      const response = await enviarFevRips(payload, tokenToUse)
      setValidationResult(response)
      setStep('results')
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      const isAuthError =
        (err as { response?: { status?: number } })?.response?.status === 401 ||
        errorMessage.includes('401') ||
        errorMessage.toLowerCase().includes('unauthorized') ||
        errorMessage.toLowerCase().includes('token expirado')

      if (isAuthError) {
        clearToken()
        setStep('login')
      } else {
        setError(err instanceof Error ? err.message : 'Error al enviar validación')
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

  const handleIniciarCorreccion = () => {
    if (!validationResult) return
    setShowCorreccion(true)
    setCorreccionData({
      propuestas: [],
      requieren_revision_manual: validationResult.errores.map(e => ({
        error_codigo: e.Codigo,
        error_descripcion: e.Descripcion,
        motivo: 'Requiere corrección manual'
      }))
    })
  }

  const handleAplicarCorrecciones = async (cambios: CambioAprobado[]) => {
    if (!ripsData || !xmlContent) return
    try {
      const response = await aplicarCorrecciones({
        cambios,
        xml_original: xmlContent,
        rips_json_original: ripsData
      })
      setRipsData(response.rips_json_corregido)
      setXmlContent(response.xml_corregido)
      setXmlBase64(xmlToBase64(response.xml_corregido))
      setShowCorreccion(false)
      setCorreccionData(null)
      setStep('preview')
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al aplicar correcciones')
    }
  }

  const handleReset = () => {
    setXmlFile(null)
    setRipsFile(null)
    setRipsData(null)
    setXmlBase64(null)
    setXmlContent(null)
    setError(null)
    setValidationResult(null)
    setShowCorreccion(false)
    setCorreccionData(null)
    setCorreccionLoading(false)
    setStep('upload')
  }

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="relative mb-8">
          <div className="absolute left-0 top-0 flex gap-2">
            <button onClick={() => navigate('/')} className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors" title="Volver al Hub">
              <ArrowLeft size={18} />
              <span className="hidden sm:inline">Volver</span>
            </button>
            <button onClick={handleReset} className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors" title="Volver al inicio">
              <Home size={18} />
              <span className="hidden sm:inline">Inicio</span>
            </button>
          </div>

          <h1 className="text-3xl font-bold text-center mb-2">FEV RIPS</h1>
          <p className="text-gray-600 text-center">Validación de FEV RIPS ante el Ministerio de Salud</p>
        </div>

        {step === 'upload' && (
          <FevRipsFileUpload
            xmlFile={xmlFile}
            ripsFile={ripsFile}
            onXmlSelect={setXmlFile}
            onRipsSelect={setRipsFile}
            onProcess={handleProcess}
            loading={loading}
            canSubmit={!!canSubmit}
            error={error}
          />
        )}

        {step === 'preview' && ripsData && xmlBase64 && (
          <PayloadPreview
            ripsData={ripsData}
            xmlBase64={xmlBase64}
            onSubmit={handleSubmit}
            onCancel={() => setStep('upload')}
            isSubmitting={isSubmitting}
          />
        )}

        {step === 'results' && validationResult && !showCorreccion && (
          <FevRipsValidationResults result={validationResult} onRetry={() => setStep('preview')} onClose={handleReset} />
        )}

        {step === 'results' && validationResult && validationResult.errores.length > 0 && !showCorreccion && (
          <div className="mt-4">
            <button onClick={handleIniciarCorreccion} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
              <Sparkles size={18} />
              <span>Corregir Archivos</span>
            </button>
            <p className="text-sm text-gray-500 mt-2">Crea correcciones manuales para los errores encontrados.</p>
          </div>
        )}

        {showCorreccion && (
          <CorreccionPanel
            propuestas={correccionData?.propuestas || []}
            requierenRevision={correccionData?.requieren_revision_manual || []}
            onAplicar={handleAplicarCorrecciones}
            onCancelar={() => { setShowCorreccion(false); setCorreccionData(null) }}
            isLoading={correccionLoading}
            erroresOriginales={validationResult?.errores || []}
            xmlContent={xmlContent || undefined}
            ripsJson={ripsData || undefined}
          />
        )}
      </div>

      <SisproLoginModal isOpen={step === 'login'} onClose={() => setStep('preview')} onLoginSuccess={handleLoginSuccess} />
    </div>
  )
}

export default function FevRipsPage() {
  return <FevRipsContent />
}
