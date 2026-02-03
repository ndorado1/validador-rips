# NC Processor

Aplicación para automatizar la generación de Notas Crédito con Interoperabilidad del sector salud colombiano y sus archivos RIPS asociados para la DIAN.

## Características

- Extracción automática de secciones Interoperabilidad e InvoicePeriod de facturas
- Matching inteligente entre líneas de NC y servicios RIPS usando LLM
- Generación de XML NC completo con secciones requeridas
- Generación de JSON RIPS filtrado con solo los servicios afectados
- Validación de totales entre XML y RIPS
- Interfaz web intuitiva con drag & drop

## Arquitectura

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   React     │──────▶   FastAPI   │──────▶   Kimi LLM  │
│  Frontend   │      │   Backend   │      │   Matcher   │
└─────────────┘      └─────────────┘      └─────────────┘
                            │
                     ┌──────┴──────┐
                     ▼             ▼
              ┌──────────┐   ┌──────────┐
              │ XMLProc  │   │RIPSProc  │
              └──────────┘   └──────────┘
```

## Requisitos

- Python 3.10+
- Node.js 18+
- API Key de Kimi (Moonshot AI)

## Instalación

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\\Scripts\\activate
pip install -r requirements.txt
```

Crear archivo `.env`:
```
LLM_API_KEY=tu_api_key_de_kimi
LLM_BASE_URL=https://api.moonshot.cn/v1
LLM_MODEL=moonshot-v1-128k
```

### Frontend

```bash
cd frontend
npm install
```

## Uso

### Desarrollo

Terminal 1 (Backend):
```bash
cd backend
uvicorn app.main:app --reload
```

Terminal 2 (Frontend):
```bash
cd frontend
npm run dev
```

Abrir http://localhost:5173

### Producción

```bash
# Backend
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000

# Frontend
cd frontend
npm run build
# Servir carpeta dist/ con nginx o similar
```

## API Endpoints

- `POST /api/nc/procesar` - Procesar NC completa
- `POST /api/nc/preview-matching` - Preview de matching
- `GET /health` - Health check

## Licencia

MIT
