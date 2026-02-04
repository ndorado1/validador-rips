import { useState } from 'react'
import FileUpload from './components/FileUpload'
import ResultsView from './components/ResultsView'
import SisproLoginModal from './components/SisproLoginModal'
import ValidationReview from './components/ValidationReview'
import ValidationResults from './components/ValidationResults'
import CorreccionPanel from './components/CorreccionPanel'
import { ValidationProvider, useValidation } from './context/ValidationContext'
import { procesarNC, downloadFile, downloadJSON } from './utils/api'
import { enviarNCMinisterio, xmlToBase64, analizarErrores, aplicarCorrecciones } from './services/validationApi'
import type { ProcessNCResponse } from './utils/api'
import type { NCValidationResponse, CambioAprobado, CorreccionResponse } from './services/validationApi'
import { Sparkles } from 'lucide-react'

function AppContent() {
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

  const { token, setToken, isAuthenticated } = useValidation()

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
    setValidationStep('review')
  }

  const handleValidationSubmit = async () => {
    if (!result) return

    setIsSubmittingValidation(true)
    setError(null)

    try {
      const payload = {
        rips: result.nc_rips_json,
        xmlFevFile: xmlToBase64(result.nc_xml_completo)
      }

      const response = await enviarNCMinisterio(payload, token!)
      setValidationResult(response)
      setValidationStep('results')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar validación')
      setValidationStep('none')
    } finally {
      setIsSubmittingValidation(false)
    }
  }

  const handleValidationRetry = () => {
    setValidationStep('review')
    setValidationResult(null)
  }

  const handleValidationClose = () => {
    setValidationStep('none')
    setValidationResult(null)
  }

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

      // Limpiar error previo
      setError(null)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al aplicar correcciones')
    }
  }

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-2">
          NC Processor
        </h1>
        <p className="text-gray-600 text-center mb-8">
          Generación de Notas Crédito con Interoperabilidad - Sector Salud
        </p>

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
          />
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
          />
        )}

        {/* Botón para corregir con IA cuando hay errores */}
        {validationStep === 'results' && validationResult?.errores.length > 0 && !showCorreccion && (
          <div className="mt-4">
            <button
              onClick={handleIniciarCorreccion}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              <Sparkles size={18} />
              <span>Corregir con IA</span>
            </button>
            <p className="text-sm text-gray-500 mt-2">
              El agente de IA analizará los errores y proponerá correcciones.
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
          />
        )}
      </div>

      {/* Login Modal */}
      <SisproLoginModal
        isOpen={validationStep === 'login'}
        onClose={() => setValidationStep('none')}
        onLoginSuccess={handleLoginSuccess}
      />
    </div>
  )
}

// Wrapper component to provide validation context
function App() {
  return (
    <ValidationProvider>
      <AppContent />
    </ValidationProvider>
  )
}

export default App
