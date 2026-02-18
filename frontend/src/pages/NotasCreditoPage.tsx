import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FileUpload from '../components/FileUpload'
import ResultsView from '../components/ResultsView'
import SisproLoginModal from '../components/SisproLoginModal'
import ValidationReview from '../components/ValidationReview'
import ValidationResults from '../components/ValidationResults'
import CorreccionPanel, { type ManualCorrection } from '../components/CorreccionPanel'
import { useValidation } from '../context/ValidationContext'
import { procesarNC, downloadFile, downloadJSON } from '../utils/api'
import { enviarNCMinisterio, xmlToBase64, analizarErrores, aplicarCorrecciones } from '../services/validationApi'
import type { ProcessNCResponse } from '../utils/api'
import type { NCValidationResponse, CambioAprobado, CorreccionResponse } from '../services/validationApi'
import { Sparkles, Home, ArrowLeft } from 'lucide-react'
import { BatchUploadPanel, BatchProgress } from '../components/BatchProcessor'
import type { FolderInfo } from '../services/batchApi'

function NotasCreditoContent() {
  const navigate = useNavigate()
  const [ncXml, setNcXml] = useState<File | null>(null)
  const [facturaXml, setFacturaXml] = useState<File | null>(null)
  const [facturaRips, setFacturaRips] = useState<File | null>(null)
  const [esCasoColesterol, setEsCasoColesterol] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ProcessNCResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Estados para el flujo de validación
  const [validationStep, setValidationStep] = useState<'none' | 'login' | 'review' | 'results'>('none')
  const [validationResult, setValidationResult] = useState<NCValidationResponse | null>(null)
  const [isSubmittingValidation, setIsSubmittingValidation] = useState(false)

  // Estados para corrección
  const [showCorreccion, setShowCorreccion] = useState(false)
  const [correccionLoading, setCorreccionLoading] = useState(false)
  const [correccionData, setCorreccionData] = useState<CorreccionResponse | null>(null)

  // Estado para auto-reenvío tras re-login (preserva correcciones)
  const [pendingResubmit, setPendingResubmit] = useState(false)

  // Estados para procesamiento masivo
  const [showBatchMode, setShowBatchMode] = useState(false)
  const [batchFolders, setBatchFolders] = useState<FolderInfo[]>([])
  const [batchId, setBatchId] = useState('')

  const { token, setToken, clearToken, isAuthenticated } = useValidation()

  const canSubmit = ncXml && facturaXml && facturaRips

  const handleSubmit = async () => {
    if (!canSubmit) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await procesarNC(ncXml, facturaXml, facturaRips, esCasoColesterol)
      setResult(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadXML = () => {
    if (result?.nc_xml_completo) {
      downloadFile(result.nc_xml_completo, 'NC_con_interoperabilidad.xml', 'application/xml')
    }
  }

  const handleDownloadJSON = () => {
    if (result?.nc_rips_json) {
      downloadJSON(result.nc_rips_json, 'NC_RIPS.json')
    }
  }

  const handleValidarCUV = () => {
    if (isAuthenticated) {
      setValidationStep('review')
    } else {
      setValidationStep('login')
    }
  }

  const handleLoginSuccess = (newToken: string) => {
    setToken(newToken)
    if (pendingResubmit) {
      // Auto-reenviar con el nuevo token (preserva correcciones)
      setPendingResubmit(false)
      setError(null)
      submitToMinisterio(newToken)
    } else {
      setValidationStep('review')
    }
  }

  const submitToMinisterio = async (tokenOverride?: string) => {
    if (!result) return

    const tokenToUse = tokenOverride || token
    if (!tokenToUse) {
      setValidationStep('login')
      return
    }

    setIsSubmittingValidation(true)
    setValidationStep('review')
    setError(null)

    try {
      const payload = {
        rips: result.nc_rips_json,
        xmlFevFile: xmlToBase64(result.nc_xml_completo)
      }

      const response = await enviarNCMinisterio(payload, tokenToUse)
      setValidationResult(response)
      setValidationStep('results')
    } catch (err: any) {
      // Detectar error 401 - Token expirado
      const errorMessage = err instanceof Error ? err.message : String(err)
      const isAuthError = err?.response?.status === 401 ||
                         errorMessage.includes('401') ||
                         errorMessage.toLowerCase().includes('unauthorized') ||
                         errorMessage.toLowerCase().includes('token expirado') ||
                         errorMessage.toLowerCase().includes('sesión expirada')

      if (isAuthError) {
        clearToken()
        setPendingResubmit(true)
        setError('Sesión expirada. Inicie sesión para reenviar automáticamente los datos corregidos.')
        setValidationStep('login')
      } else {
        setError(err instanceof Error ? err.message : 'Error al enviar validación')
        setValidationStep('review')
      }
    } finally {
      setIsSubmittingValidation(false)
    }
  }

  const handleValidationSubmit = async () => {
    await submitToMinisterio()
  }

  const handleValidationRetry = () => {
    setValidationResult(null)
    if (isAuthenticated) {
      setValidationStep('review')
    } else {
      // Token caducado: pedir login primero, luego irá a review
      setValidationStep('login')
    }
  }

  const handleValidationClose = () => {
    setValidationStep('none')
    setValidationResult(null)
  }

  const handleIniciarCorreccion = async () => {
    if (!validationResult) return

    // Mostrar panel de corrección directamente sin llamar a la IA
    // Los errores de validación se mostrarán como "requieren revisión manual"
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

      // Limpiar error previo
      setError(null)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al aplicar correcciones')
    }
  }

  const handleReset = () => {
    // Limpiar archivos
    setNcXml(null)
    setFacturaXml(null)
    setFacturaRips(null)
    setEsCasoColesterol(false)

    // Limpiar resultados y errores
    setResult(null)
    setError(null)
    setLoading(false)

    // Limpiar estado de validación
    setValidationStep('none')
    setValidationResult(null)
    setIsSubmittingValidation(false)
    setPendingResubmit(false)

    // Limpiar corrección
    setShowCorreccion(false)
    setCorreccionData(null)
    setCorreccionLoading(false)

    // Limpiar batch mode
    setShowBatchMode(false)
    setBatchFolders([])
    setBatchId('')
  }

  const handleFoldersSelected = (folders: FolderInfo[], newBatchId: string) => {
    setBatchFolders(folders)
    setBatchId(newBatchId)
  }

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header con navegación */}
        <div className="relative mb-8">
          <div className="absolute left-0 top-0 flex gap-2">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
              title="Volver al Hub"
            >
              <ArrowLeft size={18} />
              <span className="hidden sm:inline">Volver</span>
            </button>
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
              title="Volver al inicio"
            >
              <Home size={18} />
              <span className="hidden sm:inline">Inicio</span>
            </button>
          </div>

          <h1 className="text-3xl font-bold text-center mb-2">
            NC Processor
          </h1>
          <p className="text-gray-600 text-center">
            Generación de Notas Crédito con Interoperabilidad - Sector Salud
          </p>
        </div>

        {/* Toggle Mode */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setShowBatchMode(false)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                !showBatchMode
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Individual
            </button>
            <button
              onClick={() => setShowBatchMode(true)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                showBatchMode
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Masivo (Batch)
            </button>
          </div>
        </div>

        {/* Individual Mode */}
        {!showBatchMode && (
          <>
            {/* File Upload Section */}
        {!result && (
          <FileUpload
            ncXml={ncXml}
            setNcXml={setNcXml}
            facturaXml={facturaXml}
            setFacturaXml={setFacturaXml}
            facturaRips={facturaRips}
            setFacturaRips={setFacturaRips}
            esCasoColesterol={esCasoColesterol}
            setEsCasoColesterol={setEsCasoColesterol}
            loading={loading}
            canSubmit={!!canSubmit}
            onSubmit={handleSubmit}
            error={error}
          />
        )}

        {/* Results Section */}
        {result && validationStep === 'none' && (
          <ResultsView
            result={result}
            onDownloadXML={handleDownloadXML}
            onDownloadJSON={handleDownloadJSON}
            onValidarCUV={handleValidarCUV}
            isAuthenticated={isAuthenticated}
          />
        )}

        {/* Mensaje de sesión expirada (solo si no está en login) */}
        {error?.toLowerCase().includes('sesión expir') && validationStep !== 'login' && (
          <div className="mb-4 p-4 bg-yellow-50 border border-yellow-400 rounded-lg">
            <p className="text-yellow-800 font-medium">{error}</p>
            <button
              onClick={() => {
                setError(null)
                setPendingResubmit(true)
                setValidationStep('login')
              }}
              className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Iniciar sesión y reenviar
            </button>
          </div>
        )}

        {/* Validation Review Section */}
        {result && validationStep === 'review' && (
          <ValidationReview
            ripsData={result.nc_rips_json}
            xmlContent={result.nc_xml_completo}
            onSubmit={handleValidationSubmit}
            onCancel={() => setValidationStep('none')}
            isSubmitting={isSubmittingValidation}
          />
        )}

        {/* Validation Results Section */}
        {validationStep === 'results' && validationResult && !showCorreccion && (
          <ValidationResults
            result={validationResult}
            onRetry={handleValidationRetry}
            onClose={handleValidationClose}
            numeroNotaCredito={result?.numero_nota_credito}
          />
        )}

        {/* Botón para corregir archivos cuando hay errores */}
        {validationStep === 'results' && validationResult?.errores.length > 0 && !showCorreccion && (
          <div className="mt-4">
            <button
              onClick={handleIniciarCorreccion}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              <Sparkles size={18} />
              <span>Corregir Archivos</span>
            </button>
            <p className="text-sm text-gray-500 mt-2">
              Crea correcciones manuales para los errores encontrados.
            </p>
          </div>
        )}

        {/* Panel de corrección */}
        {showCorreccion && (
          <CorreccionPanel
            propuestas={correccionData?.propuestas || []}
            requierenRevision={correccionData?.requieren_revision_manual || []}
            onAplicar={handleAplicarCorrecciones}
            onCancelar={() => {
              setShowCorreccion(false)
              setCorreccionData(null)
            }}
            isLoading={correccionLoading}
            erroresOriginales={validationResult?.errores || []}
            xmlContent={result?.nc_xml_completo}
            ripsJson={result?.nc_rips_json}
          />
        )}
          </>
        )}

        {/* Batch Mode */}
        {showBatchMode && (
          <>
            <BatchUploadPanel onFoldersSelected={handleFoldersSelected} />
            {batchFolders.length > 0 && (
              <BatchProgress folders={batchFolders} batchId={batchId} />
            )}
          </>
        )}
      </div>

      {/* Login Modal */}
      <SisproLoginModal
        isOpen={validationStep === 'login'}
        onClose={() => {
          setPendingResubmit(false)
          setValidationStep('none')
        }}
        onLoginSuccess={handleLoginSuccess}
      />
    </div>
  )
}

export default function NotasCreditoPage() {
  return <NotasCreditoContent />
}
