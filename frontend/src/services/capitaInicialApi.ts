import axios from 'axios'

const API_BASE = ''
const CAPITA_INICIAL_API_URL = `${API_BASE}/api/capita-inicial`

export interface CapitaInicialPayload {
  xmlFevFile: string // Base64
}

export interface ValidationError {
  Clase: string
  Codigo: string
  Descripcion: string
  Fuente: string
  Observaciones?: string
  PathFuente?: string
}

export interface CapitaInicialResponse {
  success: boolean
  result_state?: boolean
  codigo_unico_validacion?: string
  errores: ValidationError[]
  notificaciones: ValidationError[]
  raw_response?: Record<string, unknown>
}

export async function enviarCapitaInicial(payload: CapitaInicialPayload, token: string): Promise<CapitaInicialResponse> {
  const response = await axios.post<CapitaInicialResponse>(
    `${CAPITA_INICIAL_API_URL}/validate`,
    payload,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  )
  return response.data
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = error => reject(error)
  })
}

export function xmlToBase64(xmlContent: string): string {
  const encoder = new TextEncoder()
  const data = encoder.encode(xmlContent)
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.subarray(i, Math.min(i + chunkSize, data.length))
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}
