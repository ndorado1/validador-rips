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
}

export interface ScanResponse {
  total: number
  carpetas: FolderInfo[]
  errores_scan: string[]
}

export interface BatchStartRequest {
  folder_path: string
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
  progreso: number
  total: number
  exitosos: number
  errores: number
  detalles: Array<{
    carpeta: string
    estado: string
    cuv?: string
    error?: string
    es_caso_especial: boolean
  }>
}

export async function scanFolders(folderPath: string): Promise<ScanResponse> {
  const response = await axios.post<ScanResponse>(`${BATCH_API_URL}/scan`, {
    folder_path: folderPath
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
