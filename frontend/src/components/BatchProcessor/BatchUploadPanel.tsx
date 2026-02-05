import { useRef, useState } from 'react'
import { FolderOpen, RefreshCw, AlertCircle } from 'lucide-react'
import { scanFolders, FolderInfo } from '../../services/batchApi'

interface BatchUploadPanelProps {
  onFoldersSelected: (folders: FolderInfo[], path: string) => void
}

export default function BatchUploadPanel({ onFoldersSelected }: BatchUploadPanelProps) {
  const folderInputRef = useRef<HTMLInputElement>(null)
  const [selectedFolderName, setSelectedFolderName] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleButtonClick = () => {
    folderInputRef.current?.click()
  }

  const handleFolderSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    setError(null)
    setLoading(true)

    try {
      // Extract folder name from webkitRelativePath
      const relativePath = files[0].webkitRelativePath
      const folderName = relativePath.split('/')[0]
      setSelectedFolderName(folderName)

      // Simulate full path (in real scenario, this would come from backend)
      const folderPath = `/uploads/${folderName}`

      // Call scanFolders API
      const result = await scanFolders(folderPath)

      // Call callback with scanned folders
      onFoldersSelected(result.carpetas, folderPath)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al escanear la carpeta'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center gap-3 mb-4">
        <FolderOpen className="text-blue-600" size={28} />
        <h2 className="text-xl font-semibold text-gray-800">Procesamiento Masivo</h2>
      </div>

      <p className="text-gray-600 mb-6">
        Seleccione una carpeta que contenga subcarpetas con los archivos de Notas Crédito,
        Facturas y RIPS. Cada subcarpeta debe contener los 3 archivos correspondientes.
      </p>

      <input
        ref={folderInputRef}
        type="file"
        {...{ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>}
        onChange={handleFolderSelect}
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
            Escaneando carpetas...
          </>
        ) : (
          <>
            <FolderOpen size={20} />
            Seleccionar Carpeta
          </>
        )}
      </button>

      {selectedFolderName && !loading && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <span className="font-medium">Carpeta seleccionada:</span> {selectedFolderName}
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
