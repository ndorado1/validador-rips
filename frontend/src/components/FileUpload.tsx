import { useState, useEffect } from 'react'
import { Loader2, Eye, EyeOff, AlertTriangle } from 'lucide-react'
import FileDropZone from './FileDropZone'
import JsonExplorer from './JsonExplorer'
import XmlExplorer from './XmlExplorer'
import { previewValues } from '../utils/api'
import type { PreviewValuesResponse } from '../utils/api'

interface FileUploadProps {
  ncXml: File | null
  setNcXml: (file: File | null) => void
  facturaXml: File | null
  setFacturaXml: (file: File | null) => void
  facturaRips: File | null
  setFacturaRips: (file: File | null) => void
  esCasoColesterol: boolean
  setEsCasoColesterol: (value: boolean) => void
  loading: boolean
  canSubmit: boolean
  onSubmit: () => void
  error: string | null
}

export default function FileUpload({
  ncXml,
  setNcXml,
  facturaXml,
  setFacturaXml,
  facturaRips,
  setFacturaRips,
  esCasoColesterol,
  setEsCasoColesterol,
  loading,
  canSubmit,
  onSubmit,
  error
}: FileUploadProps) {
  const [preview, setPreview] = useState<PreviewValuesResponse | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [activePreviewTab, setActivePreviewTab] = useState<'json' | 'xml'>('json')

  // Auto-load preview when both NC XML and RIPS are selected
  useEffect(() => {
    if (ncXml && facturaRips) {
      loadPreview()
    } else {
      setPreview(null)
      setPreviewError(null)
    }
  }, [ncXml, facturaRips])

  const loadPreview = async () => {
    if (!ncXml || !facturaRips) return

    setPreviewLoading(true)
    setPreviewError(null)
    try {
      const result = await previewValues(ncXml, facturaRips)
      setPreview(result)
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Error al cargar preview')
    } finally {
      setPreviewLoading(false)
    }
  }

  const valoresIguales = preview
    ? Math.abs(preview.valores_nc_xml - preview.valores_rips) < 0.01
    : false

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <FileDropZone
          label="Nota Crédito (XML)"
          accept=".xml"
          file={ncXml}
          onFileSelect={setNcXml}
        />
        <FileDropZone
          label="Factura Original (XML)"
          accept=".xml"
          file={facturaXml}
          onFileSelect={setFacturaXml}
        />
        <FileDropZone
          label="RIPS Factura (JSON)"
          accept=".json"
          file={facturaRips}
          onFileSelect={setFacturaRips}
        />
      </div>

      {/* Pre-processing values summary */}
      {preview && (
        <div className={`mb-6 p-4 rounded-lg border ${
          valoresIguales
            ? 'bg-orange-50 border-orange-300'
            : 'bg-blue-50 border-blue-200'
        }`}>
          <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
            {valoresIguales && <AlertTriangle size={16} className="text-orange-600" />}
            Valores originales (antes de procesar)
          </h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Total NC (XML):</span>
              <span className="ml-2 font-medium">${preview.valores_nc_xml.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-gray-600">Total RIPS:</span>
              <span className="ml-2 font-medium">${preview.valores_rips.toFixed(2)}</span>
            </div>
          </div>
          {valoresIguales && (
            <div className="mt-3 p-2 bg-orange-100 rounded text-sm text-orange-800">
              <strong>Valores iguales detectados.</strong> Al procesar, los items coincidentes serán igualados a 0
              (se está descontando el valor total de la factura original).
            </div>
          )}

          {/* Preview toggle */}
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="mt-3 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
          >
            {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
            {showPreview ? 'Ocultar previsualización' : 'Previsualizar archivos'}
          </button>
        </div>
      )}

      {/* Preview loading */}
      {previewLoading && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg flex items-center gap-2 text-sm text-gray-600">
          <Loader2 className="animate-spin" size={16} />
          Cargando preview de valores...
        </div>
      )}

      {/* Preview error */}
      {previewError && (
        <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg text-sm">
          {previewError}
        </div>
      )}

      {/* File previews (JSON/XML explorers) */}
      {showPreview && preview && (
        <div className="mb-6">
          {/* Tabs */}
          <div className="flex border-b border-gray-200 mb-4">
            <button
              onClick={() => setActivePreviewTab('json')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activePreviewTab === 'json'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              JSON (RIPS)
            </button>
            <button
              onClick={() => setActivePreviewTab('xml')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activePreviewTab === 'xml'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              XML (NC - CDATA)
            </button>
          </div>

          {/* JSON Explorer (read-only) */}
          {activePreviewTab === 'json' && (
            <JsonExplorer
              data={preview.rips_json}
              onSelectField={() => {}}
            />
          )}

          {/* XML Explorer (read-only) */}
          {activePreviewTab === 'xml' && (
            <XmlExplorer
              xmlContent={preview.nc_xml_cdata}
              onSelectField={() => {}}
            />
          )}
        </div>
      )}

      <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={esCasoColesterol}
            onChange={(e) => setEsCasoColesterol(e.target.checked)}
            className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">
            Caso especial: Contiene Colesterol de Baja Densidad (903816)
          </span>
        </label>
        <p className="mt-2 text-xs text-gray-500 ml-8">
          Marque esta opción si la NC incluye el procedimiento 903816 (Colesterol de Baja Densidad).
          Esto pondrá los valores monetarios en 0.00 y el vrServicio del procedimiento en 0.
        </p>
      </div>

      <button
        onClick={onSubmit}
        disabled={!canSubmit || loading}
        className={`
          w-full py-3 px-4 rounded-lg font-medium transition-colors
          ${canSubmit && !loading
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }
        `}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="animate-spin" size={20} />
            Procesando...
          </span>
        ) : (
          'Procesar Nota Crédito'
        )}
      </button>

      {error && (
        <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-lg">
          {error}
        </div>
      )}
    </div>
  )
}
