import FileUpload from './components/FileUpload'

function App() {
  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-2">
          NC Processor
        </h1>
        <p className="text-gray-600 text-center mb-8">
          Generación de Notas Crédito con Interoperabilidad - Sector Salud
        </p>
        <FileUpload />
      </div>
    </div>
  )
}

export default App
