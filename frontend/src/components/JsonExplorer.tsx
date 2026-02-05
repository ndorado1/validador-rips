import { useState, useCallback } from 'react'
import { ChevronRight, ChevronDown, Edit3 } from 'lucide-react'

interface JsonExplorerProps {
  data: any
  onSelectField: (path: string, value: any) => void
  parentPath?: string
}

// Recolecta todas las rutas de objetos/arrays anidados
function collectAllPaths(data: any, currentPath: string = ''): string[] {
  const paths: string[] = []

  if (typeof data === 'object' && data !== null) {
    if (Array.isArray(data)) {
      if (data.length > 0) {
        paths.push(currentPath)
        data.forEach((item, index) => {
          const itemPath = currentPath ? `${currentPath}[${index}]` : `[${index}]`
          paths.push(itemPath)
          paths.push(...collectAllPaths(item, itemPath))
        })
      }
    } else {
      const keys = Object.keys(data)
      if (keys.length > 0) {
        paths.push(currentPath)
        keys.forEach(key => {
          const keyPath = currentPath ? `${currentPath}.${key}` : key
          paths.push(keyPath)
          paths.push(...collectAllPaths(data[key], keyPath))
        })
      }
    }
  }

  return paths
}

export default function JsonExplorer({ data, onSelectField, parentPath = '' }: JsonExplorerProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggleExpand = (path: string) => {
    const newExpanded = new Set(expanded)
    if (newExpanded.has(path)) {
      newExpanded.delete(path)
    } else {
      newExpanded.add(path)
    }
    setExpanded(newExpanded)
  }

  const expandAll = useCallback(() => {
    const allPaths = collectAllPaths(data, parentPath)
    setExpanded(new Set(allPaths))
  }, [data, parentPath])

  const collapseAll = useCallback(() => {
    setExpanded(new Set())
  }, [])

  const renderValue = (key: string, value: any, currentPath: string) => {
    if (value === null || value === undefined) {
      return (
        <span className="text-gray-400 text-xs" onClick={(e) => {
          e.stopPropagation()
          onSelectField(currentPath, value)
        }}>
          null
        </span>
      )
    }

    if (typeof value === 'string') {
      return (
        <span className="text-green-600 text-xs truncate max-w-xs" onClick={(e) => {
          e.stopPropagation()
          onSelectField(currentPath, value)
        }}>
          "{value}"
        </span>
      )
    }

    if (typeof value === 'number') {
      return (
        <span className="text-blue-600 text-xs" onClick={(e) => {
          e.stopPropagation()
          onSelectField(currentPath, value)
        }}>
          {value}
        </span>
      )
    }

    if (typeof value === 'boolean') {
      return (
        <span className="text-purple-600 text-xs" onClick={(e) => {
          e.stopPropagation()
          onSelectField(currentPath, value)
        }}>
          {value.toString()}
        </span>
      )
    }

    if (Array.isArray(value)) {
      const isExpanded = expanded.has(currentPath)
      return (
        <div className="ml-2">
          <div
            className="flex items-center gap-1 cursor-pointer hover:bg-gray-100 rounded px-1"
            onClick={() => toggleExpand(currentPath)}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span className="text-gray-600 text-xs">Array[{value.length}]</span>
          </div>
          {isExpanded && (
            <div className="ml-4 border-l-2 border-gray-200 pl-2">
              {value.map((item, index) => (
                <div key={index} className="py-1">
                  <span className="text-gray-400 text-xs">[{index}]: </span>
                  {renderValue(String(index), item, `${currentPath}[${index}]`)}
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }

    if (typeof value === 'object') {
      const isExpanded = expanded.has(currentPath)
      const keys = Object.keys(value)
      return (
        <div className="ml-2">
          <div
            className="flex items-center gap-1 cursor-pointer hover:bg-gray-100 rounded px-1"
            onClick={() => toggleExpand(currentPath)}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span className="text-gray-600 text-xs">{'{}'} {keys.length} campos</span>
          </div>
          {isExpanded && (
            <div className="ml-4 border-l-2 border-gray-200 pl-2">
              {keys.map((k) => (
                <div key={k} className="py-1">
                  <div className="flex items-center gap-2">
                    <span className="text-blue-800 font-medium text-xs">{k}:</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectField(`${currentPath}.${k}`, value[k])
                      }}
                      className="text-blue-500 hover:text-blue-700"
                      title="Seleccionar este campo"
                    >
                      <Edit3 size={12} />
                    </button>
                  </div>
                  <div className="ml-2">
                    {renderValue(k, value[k], `${currentPath}.${k}`)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }

    return <span className="text-xs">{String(value)}</span>
  }

  if (typeof data !== 'object' || data === null) {
    return <div className="p-2 text-gray-600">No hay datos para explorar</div>
  }

  return (
    <div className="bg-gray-50 rounded-lg p-3 text-sm">
      {/* Barra de herramientas */}
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-gray-500">
          Haz clic en <Edit3 size={12} className="inline" /> para seleccionar un campo
        </div>
        <div className="flex gap-2">
          <button
            onClick={expandAll}
            className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1"
          >
            Expandir todo
          </button>
          <span className="text-gray-300 self-center">|</span>
          <button
            onClick={collapseAll}
            className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1"
          >
            Contraer todo
          </button>
        </div>
      </div>

      {/* Árbol JSON */}
      <div className="border border-gray-200 rounded p-2 bg-white max-h-[500px] overflow-auto">
        {Object.keys(data).map((key) => (
          <div key={key} className="py-1 border-b border-gray-200 last:border-0">
            <div className="flex items-center gap-2">
              <span className="text-blue-800 font-medium">{key}:</span>
              <button
                onClick={() => onSelectField(key, data[key])}
                className="text-blue-500 hover:text-blue-700"
                title="Seleccionar este campo"
              >
                <Edit3 size={14} />
              </button>
            </div>
            <div className="ml-2">
              {renderValue(key, data[key], key)}
            </div>
          </div>
        ))}
      </div>

      {/* Instrucciones */}
      <div className="mt-3 text-xs text-gray-500 bg-blue-50 p-2 rounded">
        <p className="font-medium text-blue-800 mb-1">💡 Consejos:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Usa <strong>Expandir todo</strong> para ver toda la estructura del JSON</li>
          <li>Usa <strong>Contraer todo</strong> para ver solo los campos principales</li>
          <li>Los arrays muestran la cantidad de elementos: <code className="bg-gray-200 px-1 rounded">Array[5]</code></li>
          <li>Haz clic en el icono <Edit3 size={10} className="inline" /> para seleccionar un campo</li>
        </ul>
      </div>
    </div>
  )
}
