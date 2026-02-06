import axios from 'axios'

const API_URL = '/api/nc'

export interface ItemIgualadoCero {
  linea_nc: number
  codigo_rips: string
  tipo_servicio: string
  valor_original: number
}

export interface ProcessNCResponse {
  success: boolean
  nc_xml_completo: string
  nc_rips_json: Record<string, unknown>
  validacion: {
    total_nc_xml: number
    total_rips: number
    coinciden: boolean
    diferencia: number
  }
  matching_details: Array<{
    linea_nc: number
    descripcion_nc: string
    servicio_rips: string
    valor_nc: number
    cantidad_calculada: number
    cantidad_rips: number | null
    confianza: string
  }>
  warnings: string[]
  errors: string[]
  numero_nota_credito?: string
  valores_pre_procesamiento?: {
    total_nc_xml: number
    total_rips: number
  }
  items_igualados_a_cero: ItemIgualadoCero[]
}

export interface PreviewValuesResponse {
  valores_nc_xml: number
  valores_rips: number
  nc_xml_cdata: string
  rips_json: Record<string, unknown>
}

export async function procesarNC(
  ncXml: File,
  facturaXml: File,
  facturaRips: File,
  esCasoColesterol: boolean = false
): Promise<ProcessNCResponse> {
  const formData = new FormData()
  formData.append('nc_xml', ncXml)
  formData.append('factura_xml', facturaXml)
  formData.append('factura_rips', facturaRips)
  formData.append('es_caso_colesterol', esCasoColesterol.toString())

  const response = await axios.post(`${API_URL}/procesar`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  return response.data
}

export async function previewValues(
  ncXml: File,
  facturaRips: File
): Promise<PreviewValuesResponse> {
  const formData = new FormData()
  formData.append('nc_xml', ncXml)
  formData.append('factura_rips', facturaRips)

  const response = await axios.post(`${API_URL}/preview-values`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  return response.data
}

export function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function downloadJSON(data: Record<string, unknown>, filename: string) {
  const content = JSON.stringify(data, null, 2)
  downloadFile(content, filename, 'application/json')
}
