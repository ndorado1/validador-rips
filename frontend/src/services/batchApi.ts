import axios from 'axios'

const BATCH_API_URL = '/api/batch'

export interface FolderInfo {
  nombre: string
  path: string
  archivos: {
    factura: string
    nc: string
    rips: string
  }
  es_caso_especial: boolean
  estado: string
}

export interface ScanResponse {
  total: number
  carpetas: FolderInfo[]
  errores_scan: string[]
  batch_id: string
}

export interface BatchStartRequest {
  batch_id: string
  carpetas: string[]
  sispro_token: string
}

export interface BatchStartResponse {
  batch_id: string
  estado: string
  total: number
}

export interface BatchStatusResponse {
  batch_id: string
  estado: string
  progreso: number  // Porcentaje 0-100
  completadas: number  // Número de carpetas procesadas
  total: number
  exitosos: number
  errores: number
  detalles: Array<{
    carpeta: string
    numero_nc: string
    exitoso: boolean
    estado: string
    cuv?: string
    error?: string
    items_igualados_a_cero?: number
  }>
}

export async function uploadAndScanZip(zipFile: File): Promise<ScanResponse> {
  const formData = new FormData()
  formData.append('zip_file', zipFile)

  const response = await axios.post<ScanResponse>(`${BATCH_API_URL}/upload-and-scan`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  return response.data
}

export async function startBatch(request: BatchStartRequest): Promise<BatchStartResponse> {
  const response = await axios.post<BatchStartResponse>(`${BATCH_API_URL}/start`, request)
  return response.data
}

export async function getBatchStatus(batchId: string): Promise<BatchStatusResponse> {
  const response = await axios.get<BatchStatusResponse>(`${BATCH_API_URL}/status/${batchId}`)
  return response.data
}

export function downloadBatchResults(batchId: string): string {
  return `${BATCH_API_URL}/download/${batchId}`
}

export function createBatchWebSocket(batchId: string): WebSocket {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${wsProtocol}//${window.location.host}/api/batch/ws/${batchId}`
  return new WebSocket(wsUrl)
}
