# NC Processor Frontend

Frontend React + Vite + TailwindCSS.

## Scripts

```bash
npm run dev      # Desarrollo
npm run build    # Build producción
npm run preview  # Preview build
```

## Estructura

```
src/
├── components/    # Componentes React
│   ├── FileDropZone.tsx
│   ├── FileUpload.tsx
│   └── ResultsView.tsx
├── utils/         # Utilidades
│   └── api.ts
├── App.tsx
├── main.tsx
└── index.css
```

## Proxy

El Vite config tiene proxy configurado para `/api` al backend en `http://localhost:8000`.
