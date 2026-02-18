import axios from 'axios'

const API_BASE = ''

const FEV_RIPS_API_URL = `${API_BASE}/api/fev-rips`

export interface FevRipsPayload {
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

export interface FevRipsResponse {
  success: boolean
  result_state?: boolean
  codigo_unico_validacion?: string
  errores: ValidationError[]
  notificaciones: ValidationError[]
  raw_response?: Record<string, unknown>
}

export async function enviarFevRips(payload: FevRipsPayload, token: string): Promise<FevRipsResponse> {
  const response = await axios.post<FevRipsResponse>(
    `${FEV_RIPS_API_URL}/validate`,
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
