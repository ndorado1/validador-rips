import axios from 'axios'

const VALIDATION_API_URL = '/api/validation'
const CORRECTION_API_URL = '/api/correccion'

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

export interface NCPayload {
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

export interface PropuestaCorreccion {
  error_codigo: string
  error_descripcion: string
  campo: string
  ruta_json?: string
  ruta_xml?: string
  valor_actual: any
  valor_propuesto: any
  justificacion: string
}

export interface CorreccionResponse {
  propuestas: PropuestaCorreccion[]
  requieren_revision_manual: Array<{
    // Backend puede enviar en diferentes formatos
    codigo?: string
    descripcion?: string
    razon?: string
    error_codigo?: string
    error_descripcion?: string
    motivo?: string
    error?: ValidationError  // Cuando el agente no propone corrección
  }>
}

export interface CambioAprobado {
  ruta_json?: string
  ruta_xml?: string
  valor_nuevo: any
}

export interface AplicarCorreccionRequest {
  cambios: CambioAprobado[]
  xml_original: string
  rips_json_original: Record<string, unknown>
}

export interface AplicarCorreccionResponse {
  xml_corregido: string
  rips_json_corregido: Record<string, unknown>
  cambios_aplicados: number
}

export interface NCValidationResponse {
  success: boolean
  result_state?: boolean  // ResultState del ministerio
  codigo_unico_validacion?: string  // CUV - 96 caracteres hexadecimales
  numeroRadicado?: string
  errores: ValidationError[]
  notificaciones: ValidationError[]
  raw_response?: Record<string, unknown>  // Respuesta completa para descarga
}

export async function loginSISPRO(credentials: LoginCredentials): Promise<string> {
  // Construir payload según formato del Ministerio
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

export async function enviarNCMinisterio(payload: NCPayload, token: string): Promise<NCValidationResponse> {
  const response = await axios.post<NCValidationResponse>(
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

export async function checkValidationStatus(): Promise<{ connected: boolean; message: string }> {
  const response = await axios.get(`${VALIDATION_API_URL}/status`)
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

export async function analizarErrores(
  errores: ValidationError[],
  xmlContent: string,
  ripsJson: Record<string, unknown>
): Promise<CorreccionResponse> {
  const response = await axios.post<CorreccionResponse>(
    `${CORRECTION_API_URL}/analizar`,
    {
      errores,
      xml_content: xmlContent,
      rips_json: ripsJson
    }
  )
  return response.data
}

export async function aplicarCorrecciones(
  request: AplicarCorreccionRequest
): Promise<AplicarCorreccionResponse> {
  const response = await axios.post<AplicarCorreccionResponse>(
    `${CORRECTION_API_URL}/aplicar`,
    request
  )
  return response.data
}
