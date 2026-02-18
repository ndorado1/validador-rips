import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import SisproLoginModal from '../components/SisproLoginModal'
import { useValidation } from '../context/ValidationContext'
import { loginSISPRO, enviarNCTotal, xmlToBase64 } from '../services/ncTotalApi'
import type { NCValidationResponse } from '../services/ncTotalApi'
import { Home, ArrowLeft, Upload, FileText, CheckCircle, XCircle, Download } from 'lucide-react'

function NCTotalContent() {
  const navigate = useNavigate()
  const [xmlFile, setXmlFile] = useState<File | null>(null)
  const [xmlContent, setXmlContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Estados para el flujo de validación
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [validationResult, setValidationResult] = useState<NCValidationResponse | null>(null)

  const { token, setToken, clearToken } = useValidation()

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validar que sea XML
    if (!file.name.endsWith('.xml')) {
      setError('El archivo debe ser un XML')
      return
    }

    try {
      const content = await file.text()
      setXmlFile(file)
      setXmlContent(content)
      setError(null)
    } catch (err) {
      setError('Error al leer el archivo')
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file) return

    if (!file.name.endsWith('.xml')) {
      setError('El archivo debe ser un XML')
      return
    }

    try {
      const content = await file.text()
      setXmlFile(file)
      setXmlContent(content)
      setError(null)
    } catch (err) {
      setError('Error al leer el archivo')
    }
  }

  const handleValidate = () => {
    if (!xmlContent) return
    if (!token) {
      setShowLoginModal(true)
    } else {
      submitToMinisterio()
    }
  }

  const handleLoginSuccess = (newToken: string) => {
    setToken(newToken)
    setShowLoginModal(false)
    setError(null)
    // Si hay un archivo cargado, reintentar envío automáticamente
    if (xmlContent) {
      submitToMinisterio(newToken)
    }
  }

  const submitToMinisterio = async (tokenOverride?: string) => {
    if (!xmlContent) return

    const tokenToUse = tokenOverride || token
    if (!tokenToUse) {
      setShowLoginModal(true)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const payload = {
        xmlFevFile: xmlToBase64(xmlContent)
      }

      const response = await enviarNCTotal(payload, tokenToUse)
      setValidationResult(response)
    } catch (err: any) {
      // Detectar error 401 - Token expirado
      const errorMessage = err instanceof Error ? err.message : String(err)
      const isAuthError = err?.response?.status === 401 ||
                         errorMessage.includes('401') ||
                         errorMessage.toLowerCase().includes('unauthorized')

      if (isAuthError) {
        clearToken()
        setError('Sesión expirada. Por favor inicie sesión nuevamente haciendo clic en "Iniciar Sesión" debajo.')
        setShowLoginModal(true)
      } else {
        setError(err instanceof Error ? err.message : 'Error al enviar validación')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setXmlFile(null)
    setXmlContent(null)
    setError(null)
    setValidationResult(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleDownloadResponse = () => {
    if (!validationResult?.raw_response) return

    // Usar raw_response que contiene la respuesta cruda del ministerio
    const dataStr = JSON.stringify(validationResult.raw_response, null, 2)
    const blob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)

    // Extraer número de NC del XML si es posible
    let filename = 'CUV.json'
    if (xmlContent) {
      const ncMatch = xmlContent.match(/<cbc:ID[^>]*>([^<]+)<\/cbc:ID>/)
      if (ncMatch) {
        filename = `CUV_${ncMatch[1].trim()}.json`
      }
    }

    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleRetry = () => {
    setValidationResult(null)
    setError(null)
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
            >
              <ArrowLeft size={18} />
              <span className="hidden sm:inline">Volver</span>
            </button>
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
            >
              <Home size={18} />
              <span className="hidden sm:inline">Inicio</span>
            </button>
          </div>

          <h1 className="text-3xl font-bold text-center mb-2">
            Nota Crédito Total
          </h1>
          <p className="text-gray-600 text-center">
            Validación directa ante el Ministerio de Salud (solo XML)
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700">{error}</p>
            {error.includes('Sesión expirada') && (
              <button
                onClick={() => setShowLoginModal(true)}
                className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Iniciar Sesión
              </button>
            )}
          </div>
        )}

        {/* File Upload Section */}
        {!validationResult && (
          <div className="bg-white rounded-xl shadow-lg border-2 border-gray-100 p-8">
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
              <FileText className="text-purple-500" />
              Cargar Archivo XML
            </h2>

            {/* Drop Zone */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className={`
                border-2 border-dashed rounded-xl p-12 text-center cursor-pointer
                transition-colors duration-200
                ${xmlFile
                  ? 'border-green-400 bg-green-50'
                  : 'border-gray-300 hover:border-purple-400 hover:bg-purple-50'
                }
              `}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xml"
                onChange={handleFileSelect}
                className="hidden"
              />

              {xmlFile ? (
                <div className="flex flex-col items-center">
                  <CheckCircle className="w-12 h-12 text-green-500 mb-3" />
                  <p className="text-lg font-medium text-gray-900">{xmlFile.name}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {(xmlFile.size / 1024).toFixed(1)} KB
                  </p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleReset()
                    }}
                    className="mt-4 text-sm text-red-600 hover:text-red-700"
                  >
                    Eliminar archivo
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <Upload className="w-12 h-12 text-gray-400 mb-3" />
                  <p className="text-lg font-medium text-gray-700">
                    Arrastra tu archivo XML aquí
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    o haz clic para seleccionar
                  </p>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-700">
                <strong>Nota:</strong> Este método solo requiere el archivo XML de la Nota Crédito.
                No es necesario cargar archivos RIPS ni factura relacionada.
              </p>
            </div>

            {/* Submit Button */}
            <button
              onClick={handleValidate}
              disabled={!xmlFile || loading}
              className={`
                w-full mt-6 py-3 px-4 rounded-lg font-medium
                transition-colors duration-200
                ${!xmlFile || loading
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-purple-600 text-white hover:bg-purple-700'
                }
              `}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Enviando al Ministerio...
                </span>
              ) : (
                'Validar con Ministerio'
              )}
            </button>
          </div>
        )}

        {/* Results Section */}
        {validationResult && (
          <div className="bg-white rounded-xl shadow-lg border-2 border-gray-100 p-8">
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
              {validationResult.success ? (
                <>
                  <CheckCircle className="text-green-500" />
                  Validación Exitosa
                </>
              ) : (
                <>
                  <XCircle className="text-red-500" />
                  Validación con Errores
                </>
              )}
            </h2>

            {/* CUV Display */}
            {validationResult.codigo_unico_validacion && (
              <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-700 font-medium mb-2">
                  Código Único de Validación (CUV):
                </p>
                <p className="text-lg font-mono text-green-900 break-all">
                  {validationResult.codigo_unico_validacion}
                </p>
              </div>
            )}

            {/* Errors List */}
            {validationResult.errores.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-medium text-red-700 mb-3">
                  Errores ({validationResult.errores.length})
                </h3>
                <div className="space-y-2">
                  {validationResult.errores.map((error, idx) => (
                    <div key={idx} className="p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="font-medium text-red-800">
                        [{error.Clase}] {error.Codigo}
                      </p>
                      <p className="text-red-700">{error.Descripcion}</p>
                      {error.Observaciones && (
                        <p className="text-sm text-red-600 mt-1">{error.Observaciones}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notifications List */}
            {validationResult.notificaciones.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-medium text-yellow-700 mb-3">
                  Notificaciones ({validationResult.notificaciones.length})
                </h3>
                <div className="space-y-2">
                  {validationResult.notificaciones.map((notif, idx) => (
                    <div key={idx} className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="font-medium text-yellow-800">
                        [{notif.Clase}] {notif.Codigo}
                      </p>
                      <p className="text-yellow-700">{notif.Descripcion}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-4 mt-6">
              {validationResult.success && (
                <button
                  onClick={handleDownloadResponse}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  <Download size={18} />
                  Descargar CUV
                </button>
              )}

              <button
                onClick={handleRetry}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                Validar otro archivo
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Login Modal */}
      <SisproLoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onLoginSuccess={handleLoginSuccess}
      />
    </div>
  )
}

export default function NCTotalPage() {
  return <NCTotalContent />
}
