import axios from 'axios'

// Detectar si estamos usando el proxy de Vite (puerto 5173) o no
const API_BASE = ''

const CAPITA_API_URL = `${API_BASE}/api/capita`

export interface CapitaPayload {
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

export interface CapitaPeriodoResponse {
  success: boolean
  result_state?: boolean
  codigo_unico_validacion?: string
  errores: ValidationError[]
  notificaciones: ValidationError[]
  raw_response?: Record<string, unknown>
}

export async function enviarCapitaPeriodo(payload: CapitaPayload, token: string): Promise<CapitaPeriodoResponse> {
  const response = await axios.post<CapitaPeriodoResponse>(
    `${CAPITA_API_URL}/validate`,
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
      // Remove data URL prefix if present
      const base64Content = base64.split(',')[1] || base64
      resolve(base64Content)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
