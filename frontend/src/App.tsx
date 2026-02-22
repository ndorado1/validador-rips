import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { ValidationProvider } from './context/ValidationContext'
import Hub from './pages/Hub'
import NotasCreditoPage from './pages/NotasCreditoPage'
import CapitaPeriodoPage from './pages/CapitaPeriodoPage'
import NCTotalPage from './pages/NCTotalPage'
import FevRipsPage from './pages/FevRipsPage'
import NCParcialPage from './pages/NCParcialPage'

function App() {
  return (
    <ValidationProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Hub />} />
          <Route path="/notas-credito" element={<NotasCreditoPage />} />
          <Route path="/capita-periodo" element={<CapitaPeriodoPage />} />
          <Route path="/nc-total" element={<NCTotalPage />} />
          <Route path="/fev-rips" element={<FevRipsPage />} />
          <Route path="/nc-parcial" element={<NCParcialPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </ValidationProvider>
  )
}

export default App
