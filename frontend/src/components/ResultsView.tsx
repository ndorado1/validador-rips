import { CheckCircle, AlertCircle, Download, ShieldCheck, UserCheck, UserX } from 'lucide-react'
import { downloadFile, downloadJSON } from '../utils/api'
import type { ProcessNCResponse } from '../utils/api'

interface ResultsViewProps {
  result: ProcessNCResponse
  onDownloadXML: () => void
  onDownloadJSON: () => void
  onValidarCUV?: () => void
  isAuthenticated?: boolean
}

export default function ResultsView({ result, onDownloadXML, onDownloadJSON, onValidarCUV, isAuthenticated }: ResultsViewProps) {
  return (
    <div className="bg-white rounded-lg shadow-md p-6 mt-6">
      <h2 className="text-xl font-semibold mb-4">Resultados</h2>

      {/* Estado */}
      <div className={`p-4 rounded-lg mb-4 ${result.success ? 'bg-green-50' : 'bg-red-50'}`}>
        <div className="flex items-center gap-2">
          {result.success ? (
            <CheckCircle className="text-green-500" />
          ) : (
            <AlertCircle className="text-red-500" />
          )}
          <span className={result.success ? 'text-green-700' : 'text-red-700'}>
            {result.success ? 'Procesamiento exitoso' : 'Errores encontrados'}
          </span>
        </div>
      </div>

      {/* Validación */}
      {result.success && (
        <div className="mb-4 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-medium mb-2">Validación de Totales</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Total NC (XML):</span>
              <span className="ml-2 font-medium">${result.validacion.total_nc_xml.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-gray-600">Total RIPS:</span>
              <span className="ml-2 font-medium">${result.validacion.total_rips.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-gray-600">Diferencia:</span>
              <span className={`ml-2 font-medium ${result.validacion.coinciden ? 'text-green-600' : 'text-red-600'}`}>
                ${result.validacion.diferencia.toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-gray-600">Estado:</span>
              <span className={`ml-2 font-medium ${result.validacion.coinciden ? 'text-green-600' : 'text-red-600'}`}>
                {result.validacion.coinciden ? 'Coinciden' : 'No coinciden'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Matching Details */}
      {result.matching_details.length > 0 && (
        <div className="mb-4">
          <h3 className="font-medium mb-2">Detalle de Matching</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-3 py-2 text-left">Línea</th>
                  <th className="px-3 py-2 text-left">Descripción NC</th>
                  <th className="px-3 py-2 text-left">Servicio RIPS</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2 text-right">Cantidad RIPS</th>
                  <th className="px-3 py-2 text-center">Confianza</th>
                </tr>
              </thead>
              <tbody>
                {result.matching_details.map((detail, idx) => (
                  <tr key={idx} className="border-b">
                    <td className="px-3 py-2">{detail.linea_nc}</td>
                    <td className="px-3 py-2 max-w-xs truncate" title={detail.descripcion_nc}>
                      {detail.descripcion_nc}
                    </td>
                    <td className="px-3 py-2">{detail.servicio_rips}</td>
                    <td className="px-3 py-2 text-right">${detail.valor_nc.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">{detail.cantidad_rips ?? 'N/A'}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-2 py-1 rounded text-xs ${
                        detail.confianza === 'alta' ? 'bg-green-100 text-green-800' :
                        detail.confianza === 'media' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {detail.confianza}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="mb-4 p-4 bg-yellow-50 rounded-lg">
          <h3 className="font-medium mb-2 text-yellow-800">Advertencias</h3>
          <ul className="list-disc list-inside text-sm text-yellow-700">
            {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {/* Errors */}
      {result.errors.length > 0 && (
        <div className="mb-4 p-4 bg-red-50 rounded-lg">
          <h3 className="font-medium mb-2 text-red-800">Errores</h3>
          <ul className="list-disc list-inside text-sm text-red-700">
            {result.errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {/* Download Buttons */}
      {result.success && (
        <div className="flex flex-wrap gap-4 mt-6">
          <button
            onClick={onDownloadXML}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Download size={18} />
            Descargar XML
          </button>
          <button
            onClick={onDownloadJSON}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Download size={18} />
            Descargar RIPS JSON
          </button>
          {onValidarCUV && (
            <div className="flex items-center gap-2">
              <button
                onClick={onValidarCUV}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                <ShieldCheck size={18} />
                Validar CUV
              </button>
              {/* Indicador de sesión */}
              {isAuthenticated !== undefined && (
                <span
                  className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${
                    isAuthenticated
                      ? 'bg-green-100 text-green-700'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}
                  title={
                    isAuthenticated
                      ? 'Sesión activa - Puede validar directamente'
                      : 'Sin sesión activa - Se solicitará login antes de validar'
                  }
                >
                  {isAuthenticated ? (
                    <>
                      <UserCheck size={12} />
                      Sesión activa
                    </>
                  ) : (
                    <>
                      <UserX size={12} />
                      Sin sesión
                    </>
                  )}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
