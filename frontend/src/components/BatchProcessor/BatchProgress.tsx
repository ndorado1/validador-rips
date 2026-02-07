import { useState, useEffect, useCallback } from 'react'
import {
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Download,
  Play,
  FileText,
  AlertCircle,
  CheckSquare,
  XSquare,
  Clock,
  FileJson
} from 'lucide-react'
import SisproLoginModal from '../SisproLoginModal'
import {
  startBatch,
  getBatchStatus,
  downloadBatchResults,
  createBatchWebSocket,
  type FolderInfo,
  type BatchStatusResponse
} from '../../services/batchApi'

interface BatchProgressProps {
  folders: FolderInfo[]
  batchId: string
}

export default function BatchProgress({ folders, batchId: initialBatchId }: BatchProgressProps) {
  const [batchId, setBatchId] = useState<string | null>(initialBatchId)
  const [status, setStatus] = useState<BatchStatusResponse | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [downloadingRips, setDownloadingRips] = useState(false)

  // Calcular estadísticas
  const ldlCount = folders.filter(f => f.es_caso_especial).length
  const totalFolders = folders.length

  // El progreso ya viene como porcentaje (0-100) del backend
  const progressPercentage = status?.progreso ?? 0

  // Toggle expandir carpeta
  const toggleFolder = (nombre: string) => {
    const newExpanded = new Set(expandedFolders)
    if (newExpanded.has(nombre)) {
      newExpanded.delete(nombre)
    } else {
      newExpanded.add(nombre)
    }
    setExpandedFolders(newExpanded)
  }

  // Download RIPS ZIP
  const handleDownloadRips = async () => {
    if (!batchId) return

    setDownloadingRips(true)
    try {
      const response = await fetch(`/api/batch/${batchId}/download-rips`)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'No se encontraron archivos RIPS')
      }

      // Download the file
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${batchId}_RIPS.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error downloading RIPS:', error)
      alert(`Error al descargar RIPS: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    } finally {
      setDownloadingRips(false)
    }
  }

  // Iniciar procesamiento
  const startProcessing = useCallback(async (authToken: string) => {
    try {
      setIsRunning(true)
      const response = await startBatch({
        batch_id: initialBatchId,
        carpetas: folders.map(f => f.nombre),
        sispro_token: authToken
      })
      // Actualizar el batch_id con el de la respuesta (puede ser diferente)
      setBatchId(response.batch_id)
    } catch (error) {
      console.error('Error starting batch:', error)
      setIsRunning(false)
    }
  }, [initialBatchId, folders])

  // Manejar login exitoso
  const handleLoginSuccess = (newToken: string) => {
    setToken(newToken)
    startProcessing(newToken)
  }

  // Fetch status del batch
  const fetchStatus = useCallback(async (id: string) => {
    try {
      const newStatus = await getBatchStatus(id)
      setStatus(newStatus)

      // Si el batch terminó, dejar de hacer polling
      if (newStatus.estado === 'completado' || newStatus.estado === 'error') {
        setIsRunning(false)
      }
    } catch (error) {
      console.error('Error fetching status:', error)
    }
  }, [])

  // Polling de status cada 2 segundos (solo cuando está corriendo)
  useEffect(() => {
    if (!batchId || !isRunning) return

    // Fetch inicial
    fetchStatus(batchId)

    // Set up polling
    const interval = setInterval(() => {
      fetchStatus(batchId)
    }, 2000)

    return () => clearInterval(interval)
  }, [batchId, isRunning, fetchStatus])

  // WebSocket para updates en tiempo real (solo cuando está corriendo)
  useEffect(() => {
    if (!batchId || !isRunning) return

    const websocket = createBatchWebSocket(batchId)

    websocket.onopen = () => {
      console.log('WebSocket connected')
    }

    websocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'status_update') {
          setStatus(data.status)
          if (data.status.estado === 'completado' || data.status.estado === 'error') {
            setIsRunning(false)
          }
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error)
      }
    }

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error)
    }

    websocket.onclose = () => {
      console.log('WebSocket closed')
    }

    return () => {
      websocket.close()
    }
  }, [batchId, isRunning])

  // Determinar estado de una carpeta
  const getFolderStatus = (folderName: string) => {
    if (!status) return 'pending'
    const detail = status.detalles.find(d => d.carpeta === folderName)
    if (!detail) return 'pending'
    return detail.estado
  }

  // Obtener detalle de una carpeta
  const getFolderDetail = (folderName: string) => {
    if (!status) return null
    return status.detalles.find(d => d.carpeta === folderName)
  }

  // Renderizar botón dinámico
  const renderActionButton = () => {
    if (!token) {
      return (
        <button
          onClick={() => setShowLogin(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Play size={18} />
          Iniciar
        </button>
      )
    }

    if (isRunning) {
      return (
        <button
          disabled
          className="flex items-center gap-2 px-4 py-2 bg-gray-400 text-white rounded-lg cursor-not-allowed"
        >
          <Loader2 className="animate-spin" size={18} />
          Procesando...
        </button>
      )
    }

    if (status?.estado === 'completado' && batchId) {
      return (
        <div className="flex gap-3">
          <a
            href={downloadBatchResults(batchId)}
            download
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Download size={18} />
            Descargar Resultados
          </a>
          <button
            onClick={handleDownloadRips}
            disabled={downloadingRips}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloadingRips ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                Descargando RIPS...
              </>
            ) : (
              <>
                <FileJson size={18} />
                Descargar RIPS
              </>
            )}
          </button>
        </div>
      )
    }

    return (
      <button
        onClick={() => setShowLogin(true)}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        <Play size={18} />
        Iniciar
      </button>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
      {/* Header con estadísticas */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Progreso del Batch</h2>
          <p className="text-sm text-gray-500 mt-1">
            {totalFolders} carpetas • {ldlCount} casos especiales (LDL)
          </p>
        </div>
        {renderActionButton()}
      </div>

      {/* Barra de progreso */}
      {status && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-gray-600">
            <span>{status.completadas} / {status.total}</span>
            <span>{progressPercentage}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="bg-blue-600 h-3 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(progressPercentage, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Estadísticas en cards */}
      {status && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{status.exitosos}</div>
            <div className="text-sm text-green-700">Éxitos</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-red-600">{status.errores}</div>
            <div className="text-sm text-red-700">Errores</div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{ldlCount}</div>
            <div className="text-sm text-blue-700">LDL</div>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-orange-600">
              {status.detalles.reduce((sum, d) => sum + (d.items_igualados_a_cero || 0), 0)}
            </div>
            <div className="text-sm text-orange-700">Items a 0</div>
          </div>
        </div>
      )}

      {/* Lista expandible de carpetas */}
      <div className="border border-gray-200 rounded-lg">
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
          <h3 className="font-medium text-gray-700">Detalles por carpeta</h3>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {folders.map((folder) => {
            const isExpanded = expandedFolders.has(folder.nombre)
            const folderStatus = getFolderStatus(folder.nombre)
            const detail = getFolderDetail(folder.nombre)

            return (
              <div
                key={folder.nombre}
                className="border-b border-gray-100 last:border-b-0"
              >
                <button
                  onClick={() => toggleFolder(folder.nombre)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {folderStatus === 'completado' ? (
                      <CheckCircle className="text-green-500" size={20} />
                    ) : folderStatus === 'error' ? (
                      <XCircle className="text-red-500" size={20} />
                    ) : (
                      <Clock className="text-gray-400" size={20} />
                    )}
                    <span className="font-medium text-gray-700">{folder.nombre}</span>
                    {folder.es_caso_especial && (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                        LDL
                      </span>
                    )}
                    {detail?.items_igualados_a_cero && detail.items_igualados_a_cero > 0 && (
                      <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full">
                        {detail.items_igualados_a_cero} a 0
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">
                      {folderStatus === 'completado'
                        ? 'Completado'
                        : folderStatus === 'error'
                        ? 'Error'
                        : 'Pendiente'}
                    </span>
                    {isExpanded ? (
                      <ChevronDown className="text-gray-400" size={18} />
                    ) : (
                      <ChevronRight className="text-gray-400" size={18} />
                    )}
                  </div>
                </button>

                {/* Detalles expandibles */}
                {isExpanded && (
                  <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
                    {/* Lista de archivos */}
                    <div className="mb-3">
                      <h4 className="text-sm font-medium text-gray-600 mb-2 flex items-center gap-2">
                        <FileText size={14} />
                        Archivos
                      </h4>
                      <div className="space-y-1 text-sm text-gray-600">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400">Factura:</span>
                          <span className="truncate">{folder.archivos.factura}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400">NC:</span>
                          <span className="truncate">{folder.archivos.nc}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400">RIPS:</span>
                          <span className="truncate">{folder.archivos.rips}</span>
                        </div>
                      </div>
                    </div>

                    {/* Resultado del procesamiento */}
                    {detail && (
                      <div className="border-t border-gray-200 pt-3">
                        <h4 className="text-sm font-medium text-gray-600 mb-2 flex items-center gap-2">
                          {detail.estado === 'completado' ? (
                            <CheckSquare size={14} className="text-green-500" />
                          ) : detail.estado === 'error' ? (
                            <XSquare size={14} className="text-red-500" />
                          ) : (
                            <Clock size={14} className="text-gray-400" />
                          )}
                          Resultado
                        </h4>
                        {detail.estado === 'completado' && detail.cuv && (
                          <div className="text-sm">
                            <span className="text-gray-500">CUV:</span>
                            <span className="ml-2 font-mono text-green-600">
                              {detail.cuv.length > 20
                                ? `${detail.cuv.substring(0, 20)}...`
                                : detail.cuv}
                            </span>
                          </div>
                        )}
                        {detail.estado === 'error' && detail.error && (
                          <div className="flex items-start gap-2 text-sm">
                            <AlertCircle size={14} className="text-red-500 mt-0.5" />
                            <span className="text-red-600">{detail.error}</span>
                          </div>
                        )}
                        {detail.estado === 'pendiente' && (
                          <div className="text-sm text-gray-500">
                            Esperando para procesar...
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Modal de Login */}
      <SisproLoginModal
        isOpen={showLogin}
        onClose={() => setShowLogin(false)}
        onLoginSuccess={handleLoginSuccess}
      />
    </div>
  )
}
