import { useRef, useState } from 'react'
import { Upload, RefreshCw, AlertCircle, FileArchive } from 'lucide-react'
import { uploadAndScanZip, FolderInfo } from '../../services/batchApi'

interface BatchUploadPanelProps {
  onFoldersSelected: (folders: FolderInfo[], batchId: string) => void
}

export default function BatchUploadPanel({ onFoldersSelected }: BatchUploadPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleButtonClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    const file = files[0]
    if (!file.name.endsWith('.zip')) {
      setError('Por favor seleccione un archivo ZIP')
      return
    }

    setError(null)
    setLoading(true)
    setSelectedFileName(file.name)

    try {
      // Subir ZIP y escanear
      const result = await uploadAndScanZip(file)

      // Call callback with scanned folders
      onFoldersSelected(result.carpetas, result.batch_id)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al procesar el ZIP'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center gap-3 mb-4">
        <FileArchive className="text-blue-600" size={28} />
        <h2 className="text-xl font-semibold text-gray-800">Procesamiento Masivo</h2>
      </div>

      <p className="text-gray-600 mb-6">
        Comprima la carpeta padre (que contiene todas las subcarpetas con NC) en un archivo ZIP.
        Cada subcarpeta debe contener los 3 archivos: Factura XML (PMD), Nota Crédito XML (NC) y RIPS JSON.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        onChange={handleFileSelect}
        className="hidden"
      />

      <button
        onClick={handleButtonClick}
        disabled={loading}
        className={`
          w-full py-3 px-4 rounded-lg font-medium transition-colors
          flex items-center justify-center gap-2
          ${!loading
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }
        `}
      >
        {loading ? (
          <>
            <RefreshCw className="animate-spin" size={20} />
            Subiendo y escaneando...
          </>
        ) : (
          <>
            <Upload size={20} />
            Subir Archivo ZIP
          </>
        )}
      </button>

      {selectedFileName && !loading && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <span className="font-medium">Archivo seleccionado:</span> {selectedFileName}
          </p>
        </div>
      )}

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="text-red-600 shrink-0 mt-0.5" size={18} />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}
    </div>
  )
}
