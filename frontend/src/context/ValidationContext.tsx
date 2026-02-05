import { createContext, useContext, useState, ReactNode } from 'react'

interface ValidationContextType {
  token: string | null
  setToken: (token: string) => void
  clearToken: () => void
  isAuthenticated: boolean
}

const ValidationContext = createContext<ValidationContextType | undefined>(undefined)

export function ValidationProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => {
    // Intentar recuperar token del localStorage al iniciar
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sispro_token')
    }
    return null
  })

  const setToken = (newToken: string) => {
    setTokenState(newToken)
    if (typeof window !== 'undefined') {
      localStorage.setItem('sispro_token', newToken)
    }
  }

  const clearToken = () => {
    setTokenState(null)
    if (typeof window !== 'undefined') {
      localStorage.removeItem('sispro_token')
    }
  }

  const isAuthenticated = token !== null && token.length > 0

  return (
    <ValidationContext.Provider value={{ token, setToken, clearToken, isAuthenticated }}>
      {children}
    </ValidationContext.Provider>
  )
}

export function useValidation() {
  const context = useContext(ValidationContext)
  if (context === undefined) {
    throw new Error('useValidation debe usarse dentro de un ValidationProvider')
  }
  return context
}
