import axios from 'axios'

const API_BASE = ''
const VALIDATION_API_URL = `${API_BASE}/api/validation`

export interface NCParcialPayload {
  rips: Record<string, unknown>
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

export interface NCParcialResponse {
  success: boolean
  result_state?: boolean
  codigo_unico_validacion?: string
  errores: ValidationError[]
  notificaciones: ValidationError[]
  raw_response?: Record<string, unknown>
}

export async function enviarNCParcial(payload: NCParcialPayload, token: string): Promise<NCParcialResponse> {
  const response = await axios.post<NCParcialResponse>(
    `${VALIDATION_API_URL}/enviar-nc`,
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
    reader.onload = () => {
      const base64 = reader.result as string
      const base64Content = base64.split(',')[1] || base64
      resolve(base64Content)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
