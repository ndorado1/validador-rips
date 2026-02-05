import { useState, useEffect } from 'react'
import { Check, X, AlertCircle, Loader2, Sparkles, Edit2, Plus, FileText, Code, Eye, EyeOff } from 'lucide-react'
import type { PropuestaCorreccion, CambioAprobado } from '../services/validationApi'
import JsonExplorer from './JsonExplorer'
import XmlExplorer from './XmlExplorer'

export interface ManualCorrection {
  campo: string
  ruta_json?: string
  ruta_xml?: string
  tipo_archivo: 'json' | 'xml'
  valor_actual: string
  valor_nuevo: string
  justificacion: string
}

interface RevisionManualItem {
  codigo?: string
  descripcion?: string
  razon?: string
  error_codigo?: string
  error_descripcion?: string
  motivo?: string
  error?: {
    Codigo?: string
    Descripcion?: string
    [key: string]: any
  }
}

interface CorreccionPanelProps {
  propuestas: PropuestaCorreccion[]
  requierenRevision: RevisionManualItem[]
  onAplicar: (cambios: CambioAprobado[]) => void
  onCancelar: () => void
  isLoading?: boolean
  erroresOriginales?: Array<{ Codigo: string; Descripcion: string; [key: string]: any }>
  onAgregarCorreccionManual?: (correccion: ManualCorrection) => void
  xmlContent?: string
  ripsJson?: Record<string, unknown>
}

export default function CorreccionPanel({
  propuestas,
  requierenRevision,
  onAplicar,
  onCancelar,
  isLoading = false,
  erroresOriginales = [],
  onAgregarCorreccionManual,
  xmlContent,
  ripsJson
}: CorreccionPanelProps) {
  const [decisiones, setDecisiones] = useState<Record<number, 'aprobado' | 'rechazado' | null>>({})
  const [valoresEditados, setValoresEditados] = useState<Record<number, any>>({})

  // Debug: Ver qué propuestas llegan
  useEffect(() => {
    console.log('[CorreccionPanel] Propuestas recibidas:', propuestas.length, propuestas)
    console.log('[CorreccionPanel] Requieren revision:', requierenRevision.length)
  }, [propuestas, requierenRevision])

  // Resetear estado cuando cambian las propuestas
  useEffect(() => {
    console.log('[CorreccionPanel] Resetear estado con propuestas:', propuestas.length)
    setDecisiones(Object.fromEntries(propuestas.map((_, i) => [i, null])))
    setValoresEditados(Object.fromEntries(propuestas.map((p, i) => [i, p.valor_propuesto])))
  }, [propuestas])

  // Estado para correcciones manuales
  const [correccionesManuales, setCorreccionesManuales] = useState<ManualCorrection[]>([])
  const [mostrarFormManual, setMostrarFormManual] = useState(false)
  const [tipoArchivoActivo, setTipoArchivoActivo] = useState<'json' | 'xml'>('json')
  const [formManual, setFormManual] = useState<ManualCorrection>({
    campo: '',
    ruta_json: '',
    ruta_xml: '',
    tipo_archivo: 'json',
    valor_actual: '',
    valor_nuevo: '',
    justificacion: ''
  })

  // Estado para visualización de archivos
  const [mostrarArchivos, setMostrarArchivos] = useState(false)
  const [archivoActivo, setArchivoActivo] = useState<'xml' | 'json'>('xml')

  // Estado para mensaje de éxito al agregar corrección
  const [mensajeExito, setMensajeExito] = useState<string | null>(null)

  const handleAprobar = (index: number) => {
    setDecisiones(prev => ({ ...prev, [index]: 'aprobado' }))
  }

  const handleRechazar = (index: number) => {
    setDecisiones(prev => ({ ...prev, [index]: 'rechazado' }))
  }

  const handleValorChange = (index: number, valor: any) => {
    setValoresEditados(prev => ({ ...prev, [index]: valor }))
  }

  const handleAplicar = () => {
    const cambios: CambioAprobado[] = []

    // Agregar cambios de propuestas aprobadas
    propuestas.forEach((propuesta, index) => {
      if (decisiones[index] === 'aprobado') {
        if (propuesta.ruta_json) {
          cambios.push({
            ruta_json: propuesta.ruta_json,
            valor_nuevo: valoresEditados[index]
          })
        } else if (propuesta.ruta_xml) {
          cambios.push({
            ruta_xml: propuesta.ruta_xml,
            valor_nuevo: valoresEditados[index]
          })
        }
      }
    })

    // Agregar cambios manuales
    correccionesManuales.forEach(correccion => {
      if (correccion.tipo_archivo === 'json' && correccion.ruta_json) {
        cambios.push({
          ruta_json: correccion.ruta_json,
          valor_nuevo: correccion.valor_nuevo
        })
      } else if (correccion.tipo_archivo === 'xml' && correccion.ruta_xml) {
        cambios.push({
          ruta_xml: correccion.ruta_xml,
          valor_nuevo: correccion.valor_nuevo
        })
      }
    })

    onAplicar(cambios)
  }

  const handleAgregarCorreccionManual = (cerrarFormulario = false) => {
    const isValid = formManual.campo && formManual.valor_nuevo && (
      (formManual.tipo_archivo === 'json' && formManual.ruta_json) ||
      (formManual.tipo_archivo === 'xml' && formManual.ruta_xml)
    )

    if (isValid) {
      setCorreccionesManuales([...correccionesManuales, formManual])
      // Mostrar mensaje de éxito
      setMensajeExito(`✓ "${formManual.campo}" agregado. Total: ${correccionesManuales.length + 1}`)
      setTimeout(() => setMensajeExito(null), 3000)

      // Resetear el formulario para permitir agregar otra corrección
      setFormManual({
        campo: '',
        ruta_json: '',
        ruta_xml: '',
        tipo_archivo: formManual.tipo_archivo, // Mantener el tipo de archivo seleccionado
        valor_actual: '',
        valor_nuevo: '',
        justificacion: ''
      })
      // Solo cerrar si se solicita explícitamente
      if (cerrarFormulario) {
        setMostrarFormManual(false)
      }
    }
  }

  const handleEliminarCorreccionManual = (index: number) => {
    setCorreccionesManuales(correccionesManuales.filter((_, i) => i !== index))
  }

  // Asegurar que decisiones tenga entradas para todas las propuestas
  const decisionesCompletas = propuestas.map((_, i) => decisiones[i] || null)
  const aprobadosPropuestasCount = decisionesCompletas.filter(d => d === 'aprobado').length
  const rechazadosCount = decisionesCompletas.filter(d => d === 'rechazado').length
  const correccionesManualesCount = correccionesManuales.length
  const aprobadosCount = aprobadosPropuestasCount + correccionesManualesCount
  const pendientesCount = propuestas.length - aprobadosPropuestasCount - rechazadosCount

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8 text-center">
        <Loader2 className="mx-auto animate-spin text-blue-600 mb-4" size={48} />
        <h3 className="text-lg font-medium text-gray-800">Analizando errores con IA...</h3>
        <p className="text-gray-600 mt-2">Esto puede tomar unos segundos</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center gap-3 mb-4">
        <Sparkles className="text-purple-600" size={24} />
        <h2 className="text-xl font-semibold">Corrección de Errores</h2>
      </div>

      <p className="text-gray-600 mb-6">
        Crea correcciones manuales para los errores encontrados.
        Puedes especificar el campo a modificar, su nuevo valor y justificación.
      </p>

      {/* Resumen */}
      {(() => {
        console.log('[CorreccionPanel Render] Contadores:', { aprobadosCount, rechazadosCount, pendientesCount, totalPropuestas: propuestas.length })
        return null
      })()}
      <div className="flex gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="text-center">
          <span className="text-2xl font-bold text-green-600">{aprobadosCount}</span>
          <p className="text-sm text-gray-600">Aprobados</p>
        </div>
        <div className="text-center">
          <span className="text-2xl font-bold text-red-600">{rechazadosCount}</span>
          <p className="text-sm text-gray-600">Rechazados</p>
        </div>
        <div className="text-center">
          <span className="text-2xl font-bold text-yellow-600">{pendientesCount}</span>
          <p className="text-sm text-gray-600">Pendientes</p>
        </div>
      </div>

      {/* Visualización de archivos */}
      {(xmlContent || ripsJson) && (
        <div className="mb-6">
          <button
            onClick={() => setMostrarArchivos(!mostrarArchivos)}
            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 mb-2"
          >
            {mostrarArchivos ? <EyeOff size={16} /> : <Eye size={16} />}
            {mostrarArchivos ? 'Ocultar archivos' : 'Ver archivos (XML / JSON)'}
          </button>

          {mostrarArchivos && (
            <div className="border rounded-lg overflow-hidden">
              {/* Tabs */}
              <div className="flex border-b">
                <button
                  onClick={() => setArchivoActivo('xml')}
                  className={`flex items-center gap-2 px-4 py-2 text-sm ${
                    archivoActivo === 'xml'
                      ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <FileText size={16} />
                  XML Nota Crédito
                </button>
                <button
                  onClick={() => setArchivoActivo('json')}
                  className={`flex items-center gap-2 px-4 py-2 text-sm ${
                    archivoActivo === 'json'
                      ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Code size={16} />
                  JSON RIPS
                </button>
              </div>

              {/* Contenido */}
              <div className="max-h-96 overflow-auto">
                {archivoActivo === 'xml' && xmlContent && (
                  <pre className="p-4 text-xs font-mono bg-gray-50 whitespace-pre-wrap">
                    {xmlContent}
                  </pre>
                )}
                {archivoActivo === 'json' && ripsJson && (
                  <pre className="p-4 text-xs font-mono bg-gray-50 whitespace-pre-wrap">
                    {JSON.stringify(ripsJson, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Propuestas */}
      <div className="space-y-4 mb-6">
        {propuestas.map((propuesta, index) => (
          <div
            key={index}
            className={`border rounded-lg p-4 ${
              decisiones[index] === 'aprobado'
                ? 'border-green-300 bg-green-50'
                : decisiones[index] === 'rechazado'
                ? 'border-red-300 bg-red-50 opacity-60'
                : 'border-gray-200'
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <span className="inline-block px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded mb-2">
                  {propuesta.error_codigo}
                </span>
                <p className="text-sm text-gray-700">{propuesta.error_descripcion}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAprobar(index)}
                  className={`p-2 rounded ${
                    decisiones[index] === 'aprobado'
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 hover:bg-green-100'
                  }`}
                  title="Aprobar"
                >
                  <Check size={18} />
                </button>
                <button
                  onClick={() => handleRechazar(index)}
                  className={`p-2 rounded ${
                    decisiones[index] === 'rechazado'
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-100 hover:bg-red-100'
                  }`}
                  title="Rechazar"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Indicador de archivo destino */}
            <div className="mb-3 flex gap-2">
              {propuesta.ruta_json && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                  <Code size={12} />
                  JSON RIPS
                </span>
              )}
              {propuesta.ruta_xml && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 text-xs font-medium rounded">
                  <FileText size={12} />
                  XML
                </span>
              )}
              {!propuesta.ruta_json && !propuesta.ruta_xml && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded">
                  Sin ruta definida
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 mb-3">
              <div>
                <label className="text-xs text-gray-500">Campo</label>
                <p className="text-sm font-medium">{propuesta.campo}</p>
                {propuesta.ruta_json && (
                  <p className="text-xs text-blue-600 font-mono">JSON: {propuesta.ruta_json}</p>
                )}
                {propuesta.ruta_xml && (
                  <p className="text-xs text-orange-600 font-mono">XML: {propuesta.ruta_xml}</p>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-500">Justificación</label>
                <p className="text-sm text-gray-600">{propuesta.justificacion}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500">Valor actual</label>
                <div className="p-2 bg-gray-100 rounded text-sm font-mono">
                  {String(propuesta.valor_actual)}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500">Valor propuesto</label>
                <input
                  type="text"
                  value={String(valoresEditados[index])}
                  onChange={(e) => handleValorChange(index, e.target.value)}
                  disabled={decisiones[index] === 'rechazado'}
                  className="w-full p-2 border rounded text-sm font-mono disabled:bg-gray-100"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Requieren revisión manual */}
      {(requierenRevision.length > 0 || correccionesManuales.length > 0) && (
        <div className="mb-6">
          {/* Errores que requieren revisión manual */}
          {requierenRevision.length > 0 && (
            <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="text-yellow-600" size={20} />
                <h3 className="font-medium text-yellow-800">Requieren revisión manual</h3>
              </div>
              <p className="text-sm text-yellow-700 mb-2">
                Estos errores no pudieron ser analizados automáticamente. Puedes crear una corrección manual:
              </p>
              <ul className="list-disc list-inside text-sm text-yellow-700 space-y-1">
                {requierenRevision.map((item, i) => {
                  // Normalizar datos del backend
                  const codigo = item.error_codigo || item.codigo || item.error?.Codigo || 'Sin código'
                  const descripcion = item.error_descripcion || item.descripcion || item.error?.Descripcion || 'Sin descripción'
                  const motivoRaw = item.motivo || item.razon || ''

                  // Limpiar mensajes de error técnicos
                  let motivo = motivoRaw
                  if (motivoRaw.includes('Error al procesar con el agente')) {
                    motivo = 'No se pudo analizar automáticamente'
                  } else if (motivoRaw.includes('401') || motivoRaw.includes('Authentication')) {
                    motivo = 'Error de conexión con el servicio de IA'
                  }

                  return (
                    <li key={i} className="flex items-start justify-between gap-2">
                      <span>
                        <strong>{codigo}:</strong> {descripcion}
                        {motivo && <span className="text-yellow-600 block text-xs">({motivo})</span>}
                      </span>
                      <button
                        onClick={() => {
                          setFormManual({
                            ...formManual,
                            justificacion: `Corrección para error ${codigo}: ${descripcion}`
                          })
                          setMostrarFormManual(true)
                        }}
                        className="p-1 text-yellow-700 hover:bg-yellow-100 rounded shrink-0"
                        title="Crear corrección manual"
                      >
                        <Plus size={16} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {/* Formulario para agregar corrección manual */}
          {mostrarFormManual && (
            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="font-medium text-blue-800 mb-3 flex items-center gap-2">
                <Edit2 size={18} />
                Nueva corrección manual
              </h4>

              {/* Selector de tipo de archivo */}
              <div className="mb-4">
                <label className="text-xs text-blue-600 font-medium mb-2 block">Archivo a modificar</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setTipoArchivoActivo('json')
                      setFormManual({ ...formManual, tipo_archivo: 'json', ruta_xml: '' })
                    }}
                    className={`flex items-center gap-2 px-3 py-2 rounded text-sm ${
                      tipoArchivoActivo === 'json'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white border border-blue-300 text-blue-700 hover:bg-blue-100'
                    }`}
                  >
                    <Code size={14} />
                    JSON RIPS
                  </button>
                  <button
                    onClick={() => {
                      setTipoArchivoActivo('xml')
                      setFormManual({ ...formManual, tipo_archivo: 'xml', ruta_json: '' })
                    }}
                    className={`flex items-center gap-2 px-3 py-2 rounded text-sm ${
                      tipoArchivoActivo === 'xml'
                        ? 'bg-orange-600 text-white'
                        : 'bg-white border border-orange-300 text-orange-700 hover:bg-orange-100'
                    }`}
                  >
                    <FileText size={14} />
                    XML Nota Crédito
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-blue-600 font-medium">Campo a modificar</label>
                  <input
                    type="text"
                    value={formManual.campo}
                    onChange={(e) => setFormManual({...formManual, campo: e.target.value})}
                    placeholder="Ej: tipoDocumentoIdentificacion"
                    className="w-full p-2 border rounded text-sm"
                  />
                </div>

                {tipoArchivoActivo === 'json' && (
                  <>
                    <div>
                      <label className="text-xs text-blue-600 font-medium">Ruta en JSON (usar punto para anidados)</label>
                      <input
                        type="text"
                        value={formManual.ruta_json}
                        onChange={(e) => setFormManual({...formManual, ruta_json: e.target.value})}
                        placeholder="Ej: usuarios[0].tipoUsuario"
                        className="w-full p-2 border rounded text-sm"
                      />
                      <p className="text-xs text-blue-500 mt-1">
                        Tip: Si es un array, usa corchetes como: usuarios[0].tipoUsuario
                      </p>
                    </div>

                    {/* Explorador JSON */}
                    {ripsJson && (
                      <div className="mt-3">
                        <label className="text-xs text-blue-600 font-medium flex items-center gap-1 mb-2">
                          O selecciona visualmente del JSON:
                        </label>
                        <JsonExplorer
                          data={ripsJson}
                          onSelectField={(path, value) => {
                            setFormManual({
                              ...formManual,
                              ruta_json: path,
                              valor_actual: String(value || ''),
                              campo: path.split('.').pop() || path
                            })
                          }}
                        />
                      </div>
                    )}
                  </>
                )}

                {tipoArchivoActivo === 'xml' && (
                  <>
                    <div>
                      <label className="text-xs text-blue-600 font-medium">Ruta en XML (usar / para elementos)</label>
                      <input
                        type="text"
                        value={formManual.ruta_xml}
                        onChange={(e) => setFormManual({...formManual, ruta_xml: e.target.value})}
                        placeholder="Ej: ext:UBLExtensions/ext:UBLExtension/ext:ExtensionContent/CustomTagGeneral/Interoperabilidad/NumeroNotaCredito"
                        className="w-full p-2 border rounded text-sm"
                      />
                      <p className="text-xs text-blue-500 mt-1">
                        Tip: Usa el formato: tag1/tag2/tag3 (incluye namespaces si existen)
                      </p>
                    </div>

                    {/* Explorador XML */}
                    {xmlContent && (
                      <div className="mt-3">
                        <label className="text-xs text-blue-600 font-medium flex items-center gap-1 mb-2">
                          O selecciona visualmente del XML:
                        </label>
                        <XmlExplorer
                          xmlContent={xmlContent}
                          onSelectField={(path, value, tagName) => {
                            setFormManual({
                              ...formManual,
                              ruta_xml: path,
                              valor_actual: value,
                              campo: tagName.split(':').pop() || tagName
                            })
                          }}
                        />
                      </div>
                    )}
                  </>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-blue-600 font-medium">Valor actual</label>
                    <input
                      type="text"
                      value={formManual.valor_actual}
                      onChange={(e) => setFormManual({...formManual, valor_actual: e.target.value})}
                      placeholder="Valor que tiene ahora"
                      className="w-full p-2 border rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-blue-600 font-medium">Valor nuevo *</label>
                    <input
                      type="text"
                      value={formManual.valor_nuevo}
                      onChange={(e) => setFormManual({...formManual, valor_nuevo: e.target.value})}
                      placeholder="Valor corregido"
                      className="w-full p-2 border rounded text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-blue-600 font-medium">Justificación</label>
                  <textarea
                    value={formManual.justificacion}
                    onChange={(e) => setFormManual({...formManual, justificacion: e.target.value})}
                    placeholder="¿Por qué se hace esta corrección?"
                    className="w-full p-2 border rounded text-sm"
                    rows={2}
                  />
                </div>
                {mensajeExito && (
                  <div className="p-2 bg-green-100 border border-green-300 rounded text-green-800 text-sm animate-pulse">
                    {mensajeExito}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => handleAgregarCorreccionManual(false)}
                    disabled={!formManual.campo || !formManual.valor_nuevo || (
                      (formManual.tipo_archivo === 'json' && !formManual.ruta_json) ||
                      (formManual.tipo_archivo === 'xml' && !formManual.ruta_xml)
                    )}
                    className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:bg-gray-300 flex items-center gap-1"
                    title="Agregar esta corrección y continuar agregando más"
                  >
                    <Plus size={14} />
                    Agregar y continuar
                  </button>
                  <button
                    onClick={() => handleAgregarCorreccionManual(true)}
                    disabled={!formManual.campo || !formManual.valor_nuevo || (
                      (formManual.tipo_archivo === 'json' && !formManual.ruta_json) ||
                      (formManual.tipo_archivo === 'xml' && !formManual.ruta_xml)
                    )}
                    className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:bg-gray-300"
                    title="Agregar esta corrección y cerrar el formulario"
                  >
                    Agregar y cerrar
                  </button>
                  <button
                    onClick={() => setMostrarFormManual(false)}
                    className="px-3 py-1 border border-gray-300 text-gray-700 text-sm rounded hover:bg-gray-100"
                  >
                    Cancelar
                  </button>
                </div>

                <p className="text-xs text-blue-500 mt-2">
                  💡 <strong>Consejo:</strong> Usa "Agregar y continuar" para agregar varias correcciones rápidamente sin salir del formulario.
                </p>
              </div>
            </div>
          )}

          {/* Lista de correcciones manuales agregadas */}
          {correccionesManuales.length > 0 && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <h4 className="font-medium text-green-800 mb-2">Correcciones manuales agregadas ({correccionesManuales.length})</h4>
              <div className="space-y-2">
                {correccionesManuales.map((correccion, i) => (
                  <div key={i} className="p-2 bg-white rounded border border-green-200 text-sm">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="font-medium">{correccion.campo}</span>
                        <span className={`text-xs ml-2 px-2 py-0.5 rounded ${
                          correccion.tipo_archivo === 'json'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-orange-100 text-orange-700'
                        }`}>
                          {correccion.tipo_archivo.toUpperCase()}
                        </span>
                        <span className="text-gray-400 text-xs ml-2">
                          ({correccion.tipo_archivo === 'json' ? correccion.ruta_json : correccion.ruta_xml})
                        </span>
                      </div>
                      <button
                        onClick={() => handleEliminarCorreccionManual(i)}
                        className="text-red-500 hover:text-red-700"
                        title="Eliminar"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <div className="mt-1 text-xs">
                      <span className="text-gray-500">{correccion.valor_actual || '(vacío)'} →</span>
                      <span className="text-green-700 font-medium ml-1">{correccion.valor_nuevo}</span>
                    </div>
                    {correccion.justificacion && (
                      <p className="text-gray-500 text-xs mt-1 italic">{correccion.justificacion}</p>
                    )}
                  </div>
                ))}
              </div>
              {!mostrarFormManual && (
                <button
                  onClick={() => setMostrarFormManual(true)}
                  className="mt-3 flex items-center gap-1 text-green-700 text-sm hover:underline"
                >
                  <Plus size={14} />
                  Agregar otra corrección manual
                </button>
              )}
            </div>
          )}

          {/* Botón para agregar corrección manual si no hay ninguna */}
          {requierenRevision.length === 0 && correccionesManuales.length === 0 && !mostrarFormManual && (
            <button
              onClick={() => setMostrarFormManual(true)}
              className="flex items-center gap-2 px-4 py-2 border border-dashed border-yellow-400 text-yellow-700 rounded-lg hover:bg-yellow-50"
            >
              <Plus size={18} />
              Agregar corrección manual
            </button>
          )}
        </div>
      )}

      {/* Botones */}
      <div className="flex gap-3">
        <button
          onClick={onCancelar}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          onClick={handleAplicar}
          disabled={aprobadosCount === 0}
          className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300"
        >
          Aplicar {aprobadosCount > 0 && `(${aprobadosCount})`} cambios
        </button>
      </div>
    </div>
  )
}
