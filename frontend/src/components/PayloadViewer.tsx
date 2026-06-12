import { useMemo, useState } from 'react'
import { FileJson, FileCode, Maximize2, Minimize2, AlertTriangle } from 'lucide-react'

interface PayloadViewerProps {
  /** Objeto a mostrar como JSON. Si se pasa `text`, este se ignora. */
  data?: unknown
  /** Texto crudo a mostrar tal cual (p. ej. XML). Tiene prioridad sobre `data`. */
  text?: string
  /** Título de la sección. */
  title?: string
  /** Acento visual / etiqueta. */
  language?: 'json' | 'xml' | 'text'
  /** Líneas mostradas en la vista de muestra antes de "Ver completo". */
  previewLines?: number
  /** Altura del visor en píxeles. */
  heightPx?: number
}

// Altura fija por línea (px). Debe coincidir con lineHeight del render virtualizado.
const LINE_H = 20

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

function describeValue(v: unknown): string {
  if (Array.isArray(v)) return `Array · ${v.length.toLocaleString()} elemento(s)`
  if (v === null) return 'null'
  if (typeof v === 'object') return `Objeto · ${Object.keys(v as object).length} campo(s)`
  if (typeof v === 'string') return v.length > 48 ? `"${v.slice(0, 48)}…"` : `"${v}"`
  return String(v)
}

/**
 * Visor de payloads grandes (RIPS JSON, XML) que NO bloquea la RAM.
 *
 * El problema original era renderizar `JSON.stringify(data, null, 2)` (10 MB ->
 * ~30 MB de texto, cientos de miles de líneas) dentro de un único <pre>: el
 * navegador hace el layout de TODO el texto aunque `overflow:auto` lo recorte,
 * congelando el hilo principal y agotando la memoria.
 *
 * Estrategia:
 *  - Serializa una sola vez (memoizado), nunca en cada render.
 *  - Por defecto solo pinta las primeras `previewLines` líneas (DOM diminuto).
 *  - El array completo de líneas se materializa SOLO al pulsar "Ver completo",
 *    y se renderiza virtualizado: solo las ~40 filas visibles entran al DOM.
 */
export default function PayloadViewer({
  data,
  text,
  title = 'Payload',
  language = 'json',
  previewLines = 200,
  heightPx = 384,
}: PayloadViewerProps) {
  const [expanded, setExpanded] = useState(false)
  const [scrollTop, setScrollTop] = useState(0)

  // Serializa UNA sola vez. Para 10 MB son ~100 ms de CPU y NO toca el DOM.
  const content = useMemo(() => {
    if (typeof text === 'string') return text
    try {
      return JSON.stringify(data, null, 2) ?? 'undefined'
    } catch {
      return '// No se pudo serializar el contenido'
    }
  }, [data, text])

  // Cuenta líneas recorriendo el string, sin materializar un array gigante.
  const totalLines = useMemo(() => {
    let n = 1
    for (let i = 0; i < content.length; i++) if (content.charCodeAt(i) === 10) n++
    return n
  }, [content])

  // Solo las primeras `previewLines` líneas, sin hacer split completo.
  const previewText = useMemo(() => {
    let idx = 0
    let count = 0
    while (count < previewLines && idx < content.length) {
      const nl = content.indexOf('\n', idx)
      if (nl === -1) {
        idx = content.length
        break
      }
      idx = nl + 1
      count++
    }
    return content.slice(0, idx)
  }, [content, previewLines])

  // El array de líneas SOLO se materializa cuando el usuario pide "ver completo".
  const lines = useMemo(() => (expanded ? content.split('\n') : null), [expanded, content])

  // Resumen estructural (solo para objetos JSON, no para texto crudo).
  const summary = useMemo(() => {
    if (typeof text === 'string' || data === null || typeof data !== 'object') return null
    if (Array.isArray(data)) {
      return [{ key: '(raíz)', desc: `Array · ${data.length.toLocaleString()} elemento(s)` }]
    }
    return Object.entries(data as Record<string, unknown>).map(([key, v]) => ({
      key,
      desc: describeValue(v),
    }))
  }, [data, text])

  const isTruncated = totalLines > previewLines
  const Icon = language === 'json' ? FileJson : FileCode

  // Virtualización por padding: solo se renderizan las filas visibles del viewport.
  const total = lines?.length ?? 0
  const overscan = 12
  const startIndex = Math.max(0, Math.floor(scrollTop / LINE_H) - overscan)
  const endIndex = Math.min(total, Math.ceil((scrollTop + heightPx) / LINE_H) + overscan)
  const visible = lines ? lines.slice(startIndex, endIndex) : []
  const padTop = startIndex * LINE_H
  const padBottom = Math.max(0, (total - endIndex) * LINE_H)

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Cabecera con métricas */}
      <div className="px-4 py-3 bg-gray-50 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon size={18} className="text-blue-600 flex-shrink-0" />
          <span className="font-medium text-gray-700 truncate">{title}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500 flex-shrink-0">
          <span>≈ {formatBytes(content.length)}</span>
          <span>{totalLines.toLocaleString()} líneas</span>
        </div>
      </div>

      {/* Resumen estructural */}
      {summary && summary.length > 0 && (
        <div className="px-4 py-3 bg-white border-t border-gray-100">
          <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Resumen</p>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
            {summary.map((row) => (
              <div
                key={row.key}
                className="flex items-baseline justify-between gap-2 text-sm border-b border-gray-50 py-0.5"
              >
                <span className="font-mono text-gray-700 truncate">{row.key}</span>
                <span className="text-gray-500 text-right flex-shrink-0">{row.desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cuerpo: muestra truncada (por defecto) o visor virtualizado (bajo demanda) */}
      {!expanded ? (
        <div>
          <div className="bg-gray-900 overflow-auto" style={{ maxHeight: heightPx }}>
            <pre className="p-4 text-sm font-mono text-green-400 whitespace-pre">{previewText}</pre>
          </div>
          {isTruncated && (
            <div className="px-4 py-3 bg-amber-50 border-t border-amber-100 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-amber-700 flex items-center gap-1.5">
                <AlertTriangle size={14} className="flex-shrink-0" />
                Mostrando {previewLines.toLocaleString()} de {totalLines.toLocaleString()} líneas.
              </p>
              <button
                onClick={() => {
                  setScrollTop(0)
                  setExpanded(true)
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 text-white text-xs font-medium rounded-md hover:bg-gray-700 transition-colors"
              >
                <Maximize2 size={14} />
                Ver payload completo
              </button>
            </div>
          )}
        </div>
      ) : (
        <div>
          <div
            className="bg-gray-900 overflow-auto"
            style={{ height: heightPx }}
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          >
            {/* Spacer por padding => altura total real, scroll nativo, sin pintar todo */}
            <div style={{ paddingTop: padTop, paddingBottom: padBottom }}>
              {visible.map((ln, i) => (
                <div
                  key={startIndex + i}
                  className="whitespace-pre text-sm font-mono text-green-400 px-4"
                  style={{ height: LINE_H, lineHeight: `${LINE_H}px` }}
                >
                  {ln === '' ? ' ' : ln}
                </div>
              ))}
            </div>
          </div>
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-gray-500">
              Visor virtualizado · {totalLines.toLocaleString()} líneas (solo se renderizan las visibles)
            </p>
            <button
              onClick={() => setExpanded(false)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-200 text-gray-700 text-xs font-medium rounded-md hover:bg-gray-300 transition-colors"
            >
              <Minimize2 size={14} />
              Contraer
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
