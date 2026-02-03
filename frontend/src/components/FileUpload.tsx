import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import FileDropZone from './FileDropZone'
import ResultsView from './ResultsView'
import { procesarNC, downloadFile, downloadJSON } from '../utils/api'
import type { ProcessNCResponse } from '../utils/api'

export default function FileUpload() {
  const [ncXml, setNcXml] = useState<File | null>(null)
  const [facturaXml, setFacturaXml] = useState<File | null>(null)
  const [facturaRips, setFacturaRips] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ProcessNCResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = ncXml && facturaXml && facturaRips

  const handleSubmit = async () => {
    if (!canSubmit) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await procesarNC(ncXml, facturaXml, facturaRips)
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

      <button
        onClick={handleSubmit}
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

      {result && (
        <ResultsView
          result={result}
          onDownloadXML={handleDownloadXML}
          onDownloadJSON={handleDownloadJSON}
        />
      )}
    </div>
  )
}
