import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Users, CreditCard, Package, ArrowRight, LogOut, Shield } from 'lucide-react'
import SisproLoginModal from '../components/SisproLoginModal'
import { useValidation } from '../context/ValidationContext'

function HubContent() {
  const navigate = useNavigate()
  const { token, setToken, isAuthenticated, clearToken } = useValidation()
  const [showLoginModal, setShowLoginModal] = useState(!isAuthenticated)

  const options = [
    {
      id: 'notas-credito',
      title: 'Notas Crédito',
      description: 'Procesa Notas Crédito con validación de interoperabilidad ante el Ministerio de Salud',
      icon: FileText,
      path: '/notas-credito',
      color: 'bg-blue-500',
      hoverColor: 'hover:bg-blue-600'
    },
    {
      id: 'capita-periodo',
      title: 'Capita Periodo',
      description: 'Valida y envía paquetes de Capita Periodo al Ministerio de Salud',
      icon: Users,
      path: '/capita-periodo',
      color: 'bg-emerald-500',
      hoverColor: 'hover:bg-emerald-600'
    },
    {
      id: 'nc-total',
      title: 'Nota Crédito Total',
      description: 'Valida Nota Crédito Total ante el Ministerio de Salud (solo requiere XML)',
      icon: CreditCard,
      path: '/nc-total',
      color: 'bg-purple-500',
      hoverColor: 'hover:bg-purple-600'
    },
    {
      id: 'fev-rips',
      title: 'FEV RIPS',
      description: 'Valida y envía paquetes FEV RIPS al Ministerio de Salud',
      icon: Package,
      path: '/fev-rips',
      color: 'bg-amber-500',
      hoverColor: 'hover:bg-amber-600'
    }
  ]

  // Efecto para mostrar login cuando el token se limpia
  useEffect(() => {
    if (!isAuthenticated) {
      setShowLoginModal(true)
    }
  }, [isAuthenticated])

  const handleLoginSuccess = (newToken: string) => {
    // Guardar token en el contexto (que también lo guarda en localStorage)
    setToken(newToken)
    setShowLoginModal(false)
  }

  const handleLogout = () => {
    clearToken()
    setShowLoginModal(true)
  }

  return (
    <div className="min-h-screen py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Shield className="w-10 h-10 text-blue-600" />
            <h1 className="text-4xl font-bold text-gray-900">
              Validador Ministerio de Salud
            </h1>
          </div>
          <p className="text-lg text-gray-600">
            Selecciona el tipo de proceso que deseas validar
          </p>
          {isAuthenticated && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                <Shield size={14} />
                Sesión activa
              </span>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1 px-3 py-1 text-sm text-gray-500 hover:text-red-600 transition-colors"
              >
                <LogOut size={14} />
                Cerrar sesión
              </button>
            </div>
          )}
        </div>

        {/* Options Grid */}
        <div className="grid md:grid-cols-3 gap-6">
          {options.map((option) => {
            const Icon = option.icon
            return (
              <button
                key={option.id}
                onClick={() => navigate(option.path)}
                className="group relative bg-white rounded-2xl shadow-lg border-2 border-gray-100 p-8 text-left transition-all duration-200 hover:shadow-xl hover:border-gray-200 hover:-translate-y-1"
              >
                {/* Icon */}
                <div className={`inline-flex items-center justify-center w-14 h-14 rounded-xl ${option.color} text-white mb-6 transition-transform group-hover:scale-110`}>
                  <Icon size={28} />
                </div>

                {/* Title */}
                <h2 className="text-2xl font-bold text-gray-900 mb-3">
                  {option.title}
                </h2>

                {/* Description */}
                <p className="text-gray-600 mb-6 leading-relaxed">
                  {option.description}
                </p>

                {/* Arrow indicator */}
                <div className="flex items-center text-gray-400 group-hover:text-gray-600 transition-colors">
                  <span className="font-medium">Comenzar</span>
                  <ArrowRight size={20} className="ml-2 transition-transform group-hover:translate-x-1" />
                </div>

                {/* Hover overlay effect */}
                <div className={`absolute inset-0 rounded-2xl ${option.color} opacity-0 group-hover:opacity-5 transition-opacity`} />
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div className="mt-12 text-center">
          <p className="text-sm text-gray-500">
            Sistema de validación para el Sector Salud Colombiano
          </p>
        </div>
      </div>

      {/* Login Modal - Se muestra si no hay autenticación */}
      <SisproLoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onLoginSuccess={handleLoginSuccess}
        isMandatory={!isAuthenticated}
      />
    </div>
  )
}

export default function Hub() {
  return <HubContent />
}
