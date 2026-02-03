import { useCallback } from 'react'
import { Upload } from 'lucide-react'

interface FileDropZoneProps {
  label: string
  accept: string
  file: File | null
  onFileSelect: (file: File) => void
}

export default function FileDropZone({ label, accept, file, onFileSelect }: FileDropZoneProps) {
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) {
      onFileSelect(droppedFile)
    }
  }, [onFileSelect])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      onFileSelect(selectedFile)
    }
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      className={`
        border-2 border-dashed rounded-lg p-6 text-center cursor-pointer
        transition-colors duration-200
        ${file ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'}
      `}
    >
      <input
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
        id={`file-${label}`}
      />
      <label htmlFor={`file-${label}`} className="cursor-pointer block">
        <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
        <p className="text-sm font-medium text-gray-700">{label}</p>
        {file ? (
          <p className="text-xs text-green-600 mt-1">{file.name}</p>
        ) : (
          <p className="text-xs text-gray-500 mt-1">Arrastra o haz clic para seleccionar</p>
        )}
      </label>
    </div>
  )
}
