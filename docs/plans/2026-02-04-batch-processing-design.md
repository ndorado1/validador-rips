# Diseño: Procesamiento Masivo de Notas Crédito

## Resumen

Extensión de NC Processor para procesar 170 carpetas automáticamente, manteniendo toda la lógica existente (matching LLM, validación ministerio, nombres de archivos con número NC).

## Arquitectura

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Frontend UI   │────▶│  Backend Batch   │────▶│  Ministerio API │
│  (Progreso +    │◄────│  Processor       │◄────│  (CUV)          │
│   Control)      │     │  (Python)        │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

## Convenciones de Carpetas

```
carpeta_padre/
├── NC001234/              → Caso normal
│   ├── PMD_factura.xml    → Detectado por "PMD"
│   ├── NC001234.xml       → Detectado por "NC"
│   └── rips.json          → Único .json
├── NC005678_LDL/          → Caso especial (detectado por "LDL")
│   ├── PMD_factura.xml
│   ├── NC005678.xml
│   └── rips.json
└── NC009999_LDL_v2/       → También caso especial
    └── ...
```

## Identificación de Archivos

| Tipo | Patrón | Ejemplo |
|------|--------|---------|
| Factura XML | Contiene "PMD" + `.xml` | `PMD_12345.xml` |
| Nota Crédito XML | Contiene "NC" + `.xml` | `NC_12345.xml` |
| RIPS | Único `.json` | `rips.json` |
| Caso especial | Carpeta contiene "LDL" | `NC001_LDL/` |

> Nota: Los archivos `.pdf` son ignorados automáticamente.

## Flujo de Procesamiento

### 1. Scan Phase
- Recorre todas las subcarpetas de la carpeta padre
- Valida estructura: exactamente 1 XML PMD, 1 XML NC, 1 JSON
- Detecta casos especiales: `"LDL" in folder_name.upper()`
- Genera lista de trabajo con 170 items

### 2. Auth Phase
- UI muestra modal de login SISPRO
- Backend guarda token en memoria
- Estado UI: 🔴 No conectado → 🟢 Conectado

### 3. Processing Phase (Secuencial)
```python
for each folder in carpetas:
    try:
        # Reutiliza lógica existente
        resultado = procesar_nc(
            es_caso_colesterol=folder.es_especial
        )

        # Validación ministerio
        cuv_response = enviar_ministerio(resultado)

        # Guardar con nombre correcto
        guardar_json(cuv_response, f"CUV_{numero_nc}.json")
        marcar_estado(folder, "EXITOSO")

    except TokenExpired:
        re_login_automatico()
        retry_folder(folder)

    except Exception as e:
        marcar_estado(folder, "ERROR", str(e))
        continuar_con_siguiente()  # No detener el batch
```

### 4. Export Phase
Genera archivo ZIP con:
- `exitosos/CUV_NC001234.json` - Todos los JSON con CUV exitoso
- `errores/errores.csv` - Reporte de fallos
- `resumen.txt` - Estadísticas del proceso

## UI de Monitoreo

### Panel Principal
```
┌─────────────────────────────────────────────────────┐
│ 📁 Cargar Carpetas                    [Seleccionar] │
├─────────────────────────────────────────────────────┤
│ Sesión SISPRO:      [🔴 No conectado] [Conectar]   │
├─────────────────────────────────────────────────────┤
│ Progreso: 0/170    █░░░░░░░░░░░░░░░   [Iniciar]   │
│                                                     │
│ Éxitos: 0  │  Errores: 0  │  LDL: 0 detectados    │
├─────────────────────────────────────────────────────┤
│ ▼ Detalles por carpeta (expandible)                │
└─────────────────────────────────────────────────────┘
```

### Lista Expandible
```
▶ NC001234/                    [Pendiente]
▶ NC005678_LDL/                [Pendiente] 🔶
▼ NC009999/                    [Procesando]
   Archivos: PMD_99999.xml, NC_99999.xml, rips.json
   Caso especial: No
   Estado: Enviando a ministerio...
▶ NC011111/                    [ÉXITO] ✓
   CUV: a1b2c3d4...e5f6
   Archivo: CUV_NC011111.json
▶ NC022222/                    [ERROR] ✗
   Error: Timeout al conectar con ministerio
```

### Post-Procesamiento
- Botón "Descargar resultados (ZIP)"
- Botón "Descargar reporte de errores (CSV)"

## Manejo de Errores

### Re-Login Automático
1. Si ministerio responde 401 en cualquier NC:
2. UI muestra "Re-autenticando..."
3. Backend re-login automático con credenciales temporales
4. Reintenta la NC fallida
5. Continúa con el resto
6. Si re-login falla: pausa y pide credenciales nuevas

### Errores No Bloqueantes
Se registran en CSV y continúa:
- Archivo corrupto
- Error 5xx del ministerio
- Timeout de red
- Estructura de carpeta inválida

### Errores Bloqueantes (detienen todo)
- Fallo crítico del servidor backend

## API Backend (Nuevos Endpoints)

### `POST /api/batch/scan`
Escanea carpeta padre y retorna lista de carpetas detectadas.

**Request:**
```json
{
  "folder_path": "/ruta/a/carpeta_padre"
}
```

**Response:**
```json
{
  "total": 170,
  "carpetas": [
    {
      "nombre": "NC001234",
      "path": "/ruta/NC001234",
      "archivos": {
        "factura": "PMD_12345.xml",
        "nc": "NC001234.xml",
        "rips": "rips.json"
      },
      "es_caso_especial": false
    },
    {
      "nombre": "NC005678_LDL",
      "path": "/ruta/NC005678_LDL",
      "es_caso_especial": true
    }
  ],
  "errores_scan": []
}
```

### `POST /api/batch/procesar`
Inicia procesamiento masivo. Requiere WebSocket o Server-Sent Events para progreso en tiempo real.

**Request:**
```json
{
  "carpetas": ["NC001234", "NC005678_LDL", ...],
  "sispro_token": "jwt_token_aqui"
}
```

**Response (inicial):**
```json
{
  "batch_id": "batch_20260204_143022",
  "estado": "iniciado",
  "total": 170
}
```

### `GET /api/batch/{batch_id}/estado`
Consulta estado del batch en progreso.

**Response:**
```json
{
  "batch_id": "batch_20260204_143022",
  "estado": "procesando",
  "progreso": 45,
  "total": 170,
  "exitosos": 43,
  "errores": 2,
  "detalles": [
    {"carpeta": "NC001234", "estado": "EXITOSO", "cuv": "a1b2..."},
    {"carpeta": "NC005678_LDL", "estado": "EXITOSO", "cuv": "c3d4..."},
    {"carpeta": "NC009999", "estado": "ERROR", "error": "Timeout"}
  ]
}
```

### `GET /api/batch/{batch_id}/descargar`
Descarga ZIP con resultados (disponible al finalizar).

## Componentes a Crear

### Backend
- `app/services/batch_processor.py` - Orquestador del batch
- `app/services/folder_scanner.py` - Escaneo y validación de carpetas
- `app/api/batch_router.py` - Endpoints REST para batch

### Frontend
- `components/BatchProcessor/` - Panel principal de procesamiento masivo
  - `BatchUploadPanel.tsx` - Selección de carpeta
  - `BatchProgress.tsx` - Barra de progreso y estadísticas
  - `BatchFolderList.tsx` - Lista expandible de carpetas
  - `BatchResults.tsx` - Descarga de resultados

## Nombres de Archivos de Salida

Se mantiene la convención existente:
- `CUV_NC001234.json` - Donde NC001234 es el ParentDocumentID extraído del XML
- `errores.csv` - Reporte de errores del batch
- `resumen.txt` - Estadísticas finales

## Consideraciones de Performance

- Procesamiento **secuencial** para no saturar el API del ministerio
- Timeout por NC: 60 segundos
- Reintentos: 3 intentos por NC antes de marcar como error
- Memoria: Resultados se escriben a disco temporalmente, no se mantienen en RAM
