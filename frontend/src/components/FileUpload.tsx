import { Loader2 } from 'lucide-react'
import FileDropZone from './FileDropZone'

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
