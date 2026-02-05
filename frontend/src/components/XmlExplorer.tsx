import { useState, useMemo, useRef, useEffect } from 'react'
import { ChevronRight, ChevronDown, Edit3, FileText, Search, FolderTree, Package, Settings, Layers, Code, DollarSign, Calculator } from 'lucide-react'

interface XmlNode {
  tagName: string
  namespace?: string
  attributes: Record<string, string>
  textContent: string
  children: XmlNode[]
  path: string
  isCData?: boolean
  cDataContent?: string
}

interface XmlExplorerProps {
  xmlContent: string
  onSelectField: (path: string, value: string, tagName: string) => void
}

// Extrae CDATA de un texto
function extractCDATA(text: string): string | null {
  const cdataMatch = text.match(/<!\[CDATA\[(.*?)\]\]>/s)
  if (cdataMatch) {
    return cdataMatch[1]
  }
  return null
}

// Verifica si un texto es XML válido
function isValidXML(text: string): boolean {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(text, 'application/xml')
    return !doc.querySelector('parsererror')
  } catch {
    return false
  }
}

function parseXMLToTree(xmlString: string, parentPath: string = '', isCData: boolean = false): XmlNode | null {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xmlString, 'application/xml')

    // Check for parsing errors
    const parserError = doc.querySelector('parsererror')
    if (parserError) {
      console.error('XML parsing error:', parserError.textContent)
      return null
    }

    function buildTree(node: Element, currentParentPath: string = ''): XmlNode {
      const tagName = node.tagName
      const path = currentParentPath ? `${currentParentPath}/${tagName}` : tagName

      // Extract namespace if present
      const namespace = tagName.includes(':') ? tagName.split(':')[0] : undefined

      // Extract attributes
      const attributes: Record<string, string> = {}
      for (let i = 0; i < node.attributes.length; i++) {
        const attr = node.attributes[i]
        attributes[attr.name] = attr.value
      }

      // Get text content (only from direct text nodes, not children)
      let textContent = ''
      for (let i = 0; i < node.childNodes.length; i++) {
        const child = node.childNodes[i]
        if (child.nodeType === Node.TEXT_NODE) {
          textContent += child.textContent || ''
        }
      }
      textContent = textContent.trim()

      // Check for CDATA content
      let cDataContent: string | undefined
      if (!isCData) {
        for (let i = 0; i < node.childNodes.length; i++) {
          const child = node.childNodes[i]
          if (child.nodeType === Node.CDATA_SECTION_NODE) {
            cDataContent = child.textContent || undefined
            break
          }
        }
        // Also check in text content
        if (!cDataContent && textContent.includes('<![CDATA[')) {
          cDataContent = extractCDATA(textContent) || undefined
        }
      }

      // Process child elements
      const children: XmlNode[] = []
      for (let i = 0; i < node.children.length; i++) {
        children.push(buildTree(node.children[i], path))
      }

      return {
        tagName,
        namespace,
        attributes,
        textContent,
        children,
        path,
        isCData,
        cDataContent
      }
    }

    const rootElement = doc.documentElement
    if (!rootElement) return null

    return buildTree(rootElement, parentPath)
  } catch (error) {
    console.error('Error parsing XML:', error)
    return null
  }
}

// Extrae todos los nodos CDATA que contienen XML válido
function findCDataNodes(node: XmlNode, results: XmlNode[] = []): XmlNode[] {
  if (node.cDataContent && isValidXML(node.cDataContent)) {
    results.push(node)
  }
  node.children.forEach(child => findCDataNodes(child, results))
  return results
}

// Busca nodos que coincidan con el término de búsqueda
function findMatchingNodes(node: XmlNode, searchTerm: string, matches: Set<string> = new Set()): Set<string> {
  const searchLower = searchTerm.toLowerCase()
  const tagNameLower = node.tagName.toLowerCase()
  const textLower = node.textContent.toLowerCase()

  // Buscar en nombre del tag
  if (tagNameLower.includes(searchLower)) {
    matches.add(node.path)
  }
  // Buscar en contenido de texto
  if (textLower.includes(searchLower)) {
    matches.add(node.path)
  }
  // Buscar en atributos
  for (const [key, value] of Object.entries(node.attributes)) {
    if (key.toLowerCase().includes(searchLower) || value.toLowerCase().includes(searchLower)) {
      matches.add(node.path)
    }
  }

  // Recursivo en hijos
  node.children.forEach(child => findMatchingNodes(child, searchTerm, matches))

  return matches
}

// Encuentra todos los paths que deben estar expandidos para mostrar los matches
function findPathsToExpand(node: XmlNode, matches: Set<string>, expanded: Set<string> = new Set()): Set<string> {
  if (matches.has(node.path)) {
    // Agregar todos los ancestros de este nodo
    let currentPath = node.path
    while (currentPath.includes('/')) {
      currentPath = currentPath.substring(0, currentPath.lastIndexOf('/'))
      expanded.add(currentPath)
    }
  }

  node.children.forEach(child => findPathsToExpand(child, matches, expanded))

  return expanded
}

// Busca nodos por tag name (parcial)
function findNodesByTagName(node: XmlNode, tagName: string, results: XmlNode[] = []): XmlNode[] {
  const tagNameLower = tagName.toLowerCase()
  const nodeTagLower = node.tagName.toLowerCase()
  const nodeTagLocal = node.tagName.split(':').pop()?.toLowerCase() || nodeTagLower

  if (nodeTagLower.includes(tagNameLower) || nodeTagLocal.includes(tagNameLower)) {
    results.push(node)
  }

  node.children.forEach(child => findNodesByTagName(child, tagName, results))
  return results
}

function XmlNodeComponent({
  node,
  onSelectField,
  expanded,
  onToggle,
  highlighted,
  level = 0
}: {
  node: XmlNode
  onSelectField: (path: string, value: string, tagName: string) => void
  expanded: Set<string>
  onToggle: (path: string) => void
  highlighted?: boolean
  level?: number
}) {
  const isExpanded = expanded.has(node.path)
  const hasChildren = node.children.length > 0
  const hasAttributes = Object.keys(node.attributes).length > 0
  const hasText = node.textContent.length > 0 && !node.cDataContent
  const hasCData = !!node.cDataContent

  const displayName = node.namespace
    ? node.tagName
    : node.tagName.split(':').pop() || node.tagName

  return (
    <div className="ml-2">
      <div
        className={`flex items-center gap-1 py-1 px-1 rounded group ${
          highlighted ? 'bg-yellow-100 hover:bg-yellow-200' : 'hover:bg-gray-100'
        }`}
      >
        {hasChildren || hasCData ? (
          <button
            onClick={() => onToggle(node.path)}
            className="text-gray-500 hover:text-gray-700 shrink-0"
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        <span className={`font-medium text-xs shrink-0 ${
          highlighted ? 'text-orange-800' : 'text-orange-700'
        }`}>
          {displayName}
        </span>

        {hasCData && (
          <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded ml-1">
            CDATA
          </span>
        )}

        {hasAttributes && (
          <span className="text-gray-400 text-xs truncate">
            {Object.entries(node.attributes).map(([key, value]) => (
              <span key={key} className="ml-1">
                <span className="text-blue-600">{key}</span>=
                <span className="text-green-600">"{value.substring(0, 15)}{value.length > 15 ? '...' : ''}"</span>
              </span>
            ))}
          </span>
        )}

        {hasText && (
          <span
            className={`text-xs truncate max-w-[200px] cursor-pointer hover:text-green-900 ${
              highlighted ? 'text-green-800 font-medium' : 'text-green-700'
            }`}
            onClick={() => onSelectField(node.path, node.textContent, node.tagName)}
            title="Click para seleccionar este valor"
          >
            "{node.textContent.substring(0, 25)}{node.textContent.length > 25 ? '...' : ''}"
          </span>
        )}

        <button
          onClick={() => onSelectField(node.path, node.textContent, node.tagName)}
          className="text-blue-500 hover:text-blue-700 opacity-0 group-hover:opacity-100 transition-opacity ml-auto shrink-0"
          title="Seleccionar este campo para corrección"
        >
          <Edit3 size={12} />
        </button>
      </div>

      {isExpanded && (
        <div className="ml-4 border-l-2 border-gray-200 pl-2">
          {/* Mostrar hijos normales */}
          {node.children.map((child, index) => (
            <XmlNodeComponent
              key={`${child.path}-${index}`}
              node={child}
              onSelectField={onSelectField}
              expanded={expanded}
              onToggle={onToggle}
              highlighted={highlighted}
              level={level + 1}
            />
          ))}

          {/* Si tiene CDATA con XML válido, mostrar como nodo especial */}
          {hasCData && node.cDataContent && isValidXML(node.cDataContent) && (
            <CDataNode
              parentNode={node}
              onSelectField={onSelectField}
              expanded={expanded}
              onToggle={onToggle}
              highlighted={highlighted}
              level={level + 1}
            />
          )}
        </div>
      )}
    </div>
  )
}

// Componente especial para mostrar el contenido CDATA como árbol XML
function CDataNode({
  parentNode,
  onSelectField,
  expanded,
  onToggle,
  highlighted,
  level
}: {
  parentNode: XmlNode
  onSelectField: (path: string, value: string, tagName: string) => void
  expanded: Set<string>
  onToggle: (path: string) => void
  highlighted?: boolean
  level: number
}) {
  const cDataTree = useMemo(() => {
    if (!parentNode.cDataContent) return null
    return parseXMLToTree(parentNode.cDataContent, `${parentNode.path}/[CDATA]`, true)
  }, [parentNode.cDataContent, parentNode.path])

  if (!cDataTree) return null

  return (
    <div className="ml-2">
      <div className="flex items-center gap-1 py-1 px-1 rounded bg-purple-50 border border-purple-200">
        <span className="w-4 shrink-0" />
        <Code size={12} className="text-purple-600" />
        <span className="text-xs text-purple-700 font-medium">
          Contenido XML ({cDataTree.tagName})
        </span>
      </div>
      <div className="ml-4 border-l-2 border-purple-200 pl-2">
        <XmlNodeComponent
          node={cDataTree}
          onSelectField={onSelectField}
          expanded={expanded}
          onToggle={onToggle}
          highlighted={highlighted}
          level={level + 1}
        />
      </div>
    </div>
  )
}

// Campos monetarios importantes que se deben mostrar en el resumen
const KEY_MONETARY_FIELDS = [
  'LineExtensionAmount',
  'TaxExclusiveAmount',
  'TaxInclusiveAmount',
  'PrepaidAmount',
  'PayableAmount',
  'PriceAmount',
  'CreditedQuantity',
  'TaxableAmount',
  'TaxAmount',
  'AllowanceTotalAmount',
  'ChargeTotalAmount',
]

// Campos de RIPS JSON comunes con errores
const KEY_RIPS_FIELDS = [
  'vrUnitMedicamento',
  'vrServicio',
  'vrCopago',
  'vrCuotaModeradora',
  'valorPagoModerador',
  'consecutivo',
  'codigoMedicamento',
  'tipoMedicamento',
  'unidadMedida',
  'numUnidades',
  'coberturaPlanBeneficio',
  'etario',
]

// Extrae todos los campos monetarios importantes del árbol XML
function extractMonetaryFields(node: XmlNode, results: Array<{tag: string, value: string, path: string, parent?: string}> = [], parentTag?: string): Array<{tag: string, value: string, path: string, parent?: string}> {
  const tagLocal = node.tagName.split(':').pop() || node.tagName

  // Si es un campo monetario y tiene valor numérico
  if (KEY_MONETARY_FIELDS.includes(tagLocal) && node.textContent.trim()) {
    const value = node.textContent.trim()
    if (!isNaN(parseFloat(value))) {
      results.push({
        tag: tagLocal,
        value: value,
        path: node.path,
        parent: parentTag
      })
    }
  }

  // Recorrer hijos
  node.children.forEach(child => {
    extractMonetaryFields(child, results, tagLocal)
  })

  return results
}

// Extrae campos de RIPS del JSON
function extractRIPSFields(json: any, path = '', results: Array<{field: string, value: any, path: string}> = []): Array<{field: string, value: any, path: string}> {
  if (!json || typeof json !== 'object') return results

  for (const [key, value] of Object.entries(json)) {
    const currentPath = path ? `${path}.${key}` : key

    // Si es un campo RIPS importante
    if (KEY_RIPS_FIELDS.includes(key)) {
      results.push({
        field: key,
        value: value,
        path: currentPath
      })
    }

    // Recursión para objetos anidados
    if (value && typeof value === 'object') {
      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          extractRIPSFields(item, `${currentPath}[${index}]`, results)
        })
      } else {
        extractRIPSFields(value, currentPath, results)
      }
    }
  }

  return results
}

export default function XmlExplorer({ xmlContent, onSelectField }: XmlExplorerProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const [matchCount, setMatchCount] = useState(0)
  const [activeView, setActiveView] = useState<'full' | 'cdata'>('full')
  const [showMonetarySummary, setShowMonetarySummary] = useState(true)
  const treeRef = useRef<HTMLDivElement>(null)

  // Parsear el XML principal
  const mainTree = useMemo(() => parseXMLToTree(xmlContent), [xmlContent])

  // Encontrar nodos CDATA con XML válido
  const cDataNodes = useMemo(() => {
    if (!mainTree) return []
    return findCDataNodes(mainTree)
  }, [mainTree])

  // Determinar qué árbol mostrar
  const displayTree = useMemo(() => {
    if (activeView === 'cdata' && cDataNodes.length > 0 && cDataNodes[0].cDataContent) {
      return parseXMLToTree(cDataNodes[0].cDataContent, '', true)
    }
    return mainTree
  }, [activeView, cDataNodes, mainTree])

  // Calcular matches cuando cambia la búsqueda
  const matches = useMemo(() => {
    if (!displayTree || !searchTerm) return new Set<string>()
    const found = findMatchingNodes(displayTree, searchTerm)
    setMatchCount(found.size)
    return found
  }, [displayTree, searchTerm])

  // Auto-expandir paths que contienen matches
  useEffect(() => {
    if (displayTree && searchTerm && matches.size > 0) {
      const pathsToExpand = findPathsToExpand(displayTree, matches)
      setExpanded(prev => {
        const newSet = new Set(prev)
        pathsToExpand.forEach(p => newSet.add(p))
        matches.forEach(p => newSet.add(p))
        return newSet
      })
    }
  }, [matches, searchTerm, displayTree])

  const toggleExpand = (path: string) => {
    setExpanded(prev => {
      const newExpanded = new Set(prev)
      if (newExpanded.has(path)) {
        newExpanded.delete(path)
      } else {
        newExpanded.add(path)
      }
      return newExpanded
    })
  }

  const expandAll = () => {
    if (!displayTree) return
    const allPaths = new Set<string>()
    const collectPaths = (node: XmlNode) => {
      allPaths.add(node.path)
      node.children.forEach(collectPaths)
    }
    collectPaths(displayTree)
    setExpanded(allPaths)
  }

  const collapseAll = () => {
    setExpanded(new Set())
  }

  // Expandir a una sección específica por nombre de tag
  const expandToSection = (tagName: string) => {
    if (!displayTree) return
    const nodes = findNodesByTagName(displayTree, tagName)
    if (nodes.length > 0) {
      const pathsToExpand = new Set<string>()
      nodes.forEach(node => {
        pathsToExpand.add(node.path)
        // Agregar todos los ancestros
        let currentPath = node.path
        while (currentPath.includes('/')) {
          currentPath = currentPath.substring(0, currentPath.lastIndexOf('/'))
          pathsToExpand.add(currentPath)
        }
      })
      setExpanded(pathsToExpand)

      // Scroll al primer match después de un breve delay
      setTimeout(() => {
        if (treeRef.current) {
          treeRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }, 100)
    }
  }

  // Navegación rápida a secciones comunes
  const quickNavButtons = [
    { label: 'Interoperabilidad', tag: 'Interoperabilidad', icon: Settings },
    { label: 'Items', tag: 'Item', icon: Package },
    { label: 'CreditNoteLine', tag: 'CreditNoteLine', icon: Layers },
    { label: 'Precios', tag: 'LineExtensionAmount', icon: DollarSign },
  ]

  if (!mainTree) {
    return (
      <div className="bg-gray-50 rounded-lg p-4 text-sm text-red-600">
        <FileText size={16} className="inline mr-2" />
        Error al parsear el XML. Verifica que el contenido sea válido.
      </div>
    )
  }

  return (
    <div className="bg-gray-50 rounded-lg p-3 text-sm">
      {/* Selector de vista si hay CDATA */}
      {cDataNodes.length > 0 && (
        <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded">
          <p className="text-xs text-blue-700 mb-2 font-medium">
            Este documento contiene XML embebido en CDATA:
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setActiveView('full')}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded ${
                activeView === 'full'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-blue-300 text-blue-700 hover:bg-blue-50'
              }`}
            >
              <FileText size={12} />
              Documento Completo
            </button>
            <button
              onClick={() => setActiveView('cdata')}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded ${
                activeView === 'cdata'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white border border-purple-300 text-purple-700 hover:bg-purple-50'
              }`}
            >
              <Code size={12} />
              Solo Nota Crédito (CDATA)
            </button>
          </div>
        </div>
      )}

      {/* Barra de búsqueda */}
      <div className="mb-3">
        <div className="relative">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar elemento (ej: Item, Interoperabilidad, ID, CustomTagGeneral)..."
            className="w-full pl-8 pr-4 py-2 border rounded text-sm"
          />
          {searchTerm && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">
              {matchCount} coincidencias
            </span>
          )}
        </div>
      </div>

      {/* Navegación rápida */}
      <div className="flex flex-wrap gap-2 mb-3">
        {quickNavButtons.map(({ label, tag, icon: Icon }) => (
          <button
            key={tag}
            onClick={() => expandToSection(tag)}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-blue-50 hover:border-blue-300 transition-colors"
            title={`Ir a sección ${label}`}
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
        <div className="flex-1" />
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

      {/* Resumen de Campos Clave */}
      {displayTree && showMonetarySummary && (
        <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign size={14} className="text-green-600" />
            <span className="text-xs font-medium text-green-800">Campos Monetarios (Precios y Montos)</span>
            <div className="flex-1" />
            <button
              onClick={() => setShowMonetarySummary(!showMonetarySummary)}
              className="text-xs text-green-600 hover:text-green-800"
            >
              {showMonetarySummary ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
          {(() => {
            const monetaryFields = extractMonetaryFields(displayTree)
            if (monetaryFields.length === 0) return null
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {monetaryFields.map((field, idx) => (
                  <div
                    key={`${field.path}-${idx}`}
                    className="flex items-center justify-between p-2 bg-white rounded border border-green-200 hover:border-green-400 cursor-pointer group"
                    onClick={() => onSelectField(field.path, field.value, field.tag)}
                  >
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-xs font-medium text-gray-700 truncate" title={field.tag}>
                        {field.parent && <span className="text-gray-400">{field.parent} / </span>}
                        {field.tag}
                      </span>
                      <span className="text-xs text-gray-500 truncate">{field.value}</span>
                    </div>
                    <Edit3 size={12} className="text-green-500 opacity-0 group-hover:opacity-100 shrink-0 ml-1" />
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      )}

      {!showMonetarySummary && displayTree && (
        <div className="mb-3">
          <button
            onClick={() => setShowMonetarySummary(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
          >
            <Calculator size={12} />
            Mostrar campos monetarios
          </button>
        </div>
      )}

      {/* Árbol XML */}
      <div
        ref={treeRef}
        className="border border-gray-200 rounded p-2 bg-white max-h-[500px] overflow-auto"
      >
        {displayTree && (
          <XmlNodeComponent
            node={displayTree}
            onSelectField={onSelectField}
            expanded={expanded}
            onToggle={toggleExpand}
            highlighted={false}
          />
        )}
      </div>

      {/* Instrucciones */}
      <div className="mt-3 text-xs text-gray-500 bg-blue-50 p-2 rounded">
        <p className="font-medium text-blue-800 mb-1">💡 Consejos:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>La sección <strong>Campos Monetarios</strong> muestra todos los precios y montos del XML para editarlos fácilmente</li>
          <li>Los elementos con <span className="bg-purple-100 text-purple-700 px-1 rounded">CDATA</span> contienen XML adicional (como la Nota Crédito real)</li>
          <li>Usa el botón <strong>"Solo Nota Crédito (CDATA)"</strong> para ver directamente el contenido importante</li>
          <li>Los botones <strong>Interoperabilidad</strong> e <strong>Items</strong> te llevan a esas secciones</li>
          <li>Haz clic en el icono <Edit3 size={10} className="inline" /> para seleccionar un campo</li>
        </ul>
      </div>
    </div>
  )
}
