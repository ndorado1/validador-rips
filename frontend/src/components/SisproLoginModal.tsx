import { useState } from 'react'
import { X, Lock, User, Building, Loader2, Shield } from 'lucide-react'
import axios from 'axios'
import { loginSISPRO } from '../services/validationApi'
import type { LoginCredentials } from '../services/validationApi'

interface SisproLoginModalProps {
  isOpen: boolean
  onClose: () => void
  onLoginSuccess: (token: string) => void
  isMandatory?: boolean
}

export default function SisproLoginModal({ isOpen, onClose, onLoginSuccess, isMandatory = false }: SisproLoginModalProps) {
  const [credentials, setCredentials] = useState<LoginCredentials>({
    tipoDocumento: 'CC',
    numeroDocumento: '',
    nit: '',
    clave: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const token = await loginSISPRO(credentials)
      onLoginSuccess(token)
      onClose()
    } catch (err) {
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 401) {
          setError('Credenciales inválidas. Verifique sus datos.')
        } else if (err.response?.status === 504) {
          setError('Timeout al conectar con SISPRO. Intente nuevamente.')
        } else if (err.response?.status === 503) {
          setError('No se puede conectar con el Ministerio. Verifique su conexión.')
        } else {
          setError(err.response?.data?.detail || 'Error al iniciar sesión')
        }
      } else {
        setError('Error inesperado al iniciar sesión')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-800">Iniciar Sesión - SISPRO</h2>
          </div>
          {!isMandatory && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={24} />
            </button>
          )}
        </div>

        {isMandatory && (
          <div className="px-6 pt-4">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-700">
                <strong>Autenticación requerida:</strong> Debe iniciar sesión con sus credenciales de SISPRO para continuar.
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tipo de Documento
            </label>
            <select
              value={credentials.tipoDocumento}
              onChange={(e) => setCredentials({ ...credentials, tipoDocumento: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="CC">Cédula de Ciudadanía (CC)</option>
              <option value="CE">Cédula de Extranjería (CE)</option>
              <option value="PA">Pasaporte (PA)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Número de Documento
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                value={credentials.numeroDocumento}
                onChange={(e) => setCredentials({ ...credentials, numeroDocumento: e.target.value })}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Ingrese su número de documento"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              NIT de la Entidad
            </label>
            <div className="relative">
              <Building className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                value={credentials.nit}
                onChange={(e) => setCredentials({ ...credentials, nit: e.target.value })}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Ingrese el NIT"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="password"
                value={credentials.clave}
                onChange={(e) => setCredentials({ ...credentials, clave: e.target.value })}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Ingrese su contraseña"
                required
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            {!isMandatory && (
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
            )}
            <button
              type="submit"
              disabled={loading || !credentials.numeroDocumento || !credentials.nit || !credentials.clave}
              className={`px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${isMandatory ? 'w-full' : 'flex-1'}`}
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  Ingresando...
                </>
              ) : (
                <>
                  <Lock size={18} />
                  Ingresar
                </>
              )}
            </button>
          </div>
        </form>

        <div className="px-6 pb-4">
          <p className="text-xs text-gray-500 text-center">
            Sus credenciales son enviadas directamente al Ministerio de Salud.
            No se almacenan en este sistema.
          </p>
        </div>
      </div>
    </div>
  )
}
