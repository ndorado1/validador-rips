import axios from 'axios'

const API_BASE = ''
const CAPITA_FINAL_API_URL = `${API_BASE}/api/capita-final`

export interface CapitaFinalPayload {
  rips: Record<string, unknown>
}

export interface ValidationError {
  Clase: string
  Codigo: string
  Descripcion: string
  Fuente: string
  Observaciones?: string
  PathFuente?: string
}

export interface CapitaFinalResponse {
  success: boolean
  result_state?: boolean
  codigo_unico_validacion?: string
  errores: ValidationError[]
  notificaciones: ValidationError[]
  raw_response?: Record<string, unknown>
}

export async function enviarCapitaFinal(payload: CapitaFinalPayload, token: string): Promise<CapitaFinalResponse> {
  const response = await axios.post<CapitaFinalResponse>(
    `${CAPITA_FINAL_API_URL}/validate`,
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
