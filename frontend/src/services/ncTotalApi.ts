import axios from 'axios'

// Detectar si estamos usando el proxy de Vite (puerto 5173) o no
const API_BASE = ''

const NC_TOTAL_API_URL = `${API_BASE}/api/nc-total`

export interface LoginCredentials {
  tipoDocumento: string
  numeroDocumento: string
  nit: string
  clave: string
}

export interface LoginResponse {
  token: string
  success: boolean
  message?: string
}

export interface NCTotalPayload {
  xmlFevFile: string // Base64 - solo XML, no requiere RIPS
}

export interface ValidationError {
  Clase: string
  Codigo: string
  Descripcion: string
  Fuente: string
  Observaciones?: string
  PathFuente?: string
}

export interface NCValidationResponse {
  success: boolean
  result_state?: boolean  // ResultState del ministerio
  codigo_unico_validacion?: string  // CUV - 96 caracteres hexadecimales
  errores: ValidationError[]
  notificaciones: ValidationError[]
  raw_response?: Record<string, unknown>  // Respuesta completa para descarga
}

export async function loginSISPRO(credentials: LoginCredentials): Promise<string> {
  // Reutilizamos el endpoint de login de validation
  const VALIDATION_API_URL = `${API_BASE}/api/validation`
  const payload = {
    persona: {
      identificacion: {
        tipo: credentials.tipoDocumento,
        numero: credentials.numeroDocumento
      }
    },
    clave: credentials.clave,
    nit: credentials.nit
  }
  const response = await axios.post<LoginResponse>(`${VALIDATION_API_URL}/login`, payload)
  if (!response.data.success) {
    throw new Error(response.data.message || 'Error en login')
  }
  return response.data.token
}

export async function enviarNCTotal(payload: NCTotalPayload, token: string): Promise<NCValidationResponse> {
  const response = await axios.post<NCValidationResponse>(
    `${NC_TOTAL_API_URL}/enviar`,
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

export function xmlToBase64(xmlContent: string): string {
  // Convertir string a base64 (chunked para soportar XMLs grandes)
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

export function formatValidationErrors(errors: ValidationError[]): string {
  return errors.map(e => `[${e.Clase}] ${e.Codigo}: ${e.Descripcion}`).join('\n')
}
