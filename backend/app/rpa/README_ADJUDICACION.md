# RPA de Adjudicación de Órdenes - Qualitas

Este módulo permite automatizar el proceso de adjudicación de órdenes de servicio en el sistema de Qualitas mediante Playwright.

## 📋 Descripción

El RPA de adjudicación automatiza el proceso de asignar/converter órdenes desde la tabla de "Asignados" a órdenes de trabajo en el taller. El flujo automático incluye:

1. **Búsqueda** del expediente en la tabla de asignados
2. **Apertura** del modal de adjudicación
3. **Llenado** del formulario con los datos proporcionados
4. **Guardado** de la adjudicación

## 🗂️ Archivos del Módulo

```
backend/app/rpa/
├── qualitas_adjudicacion_handler.py    # Handler principal
├── qualitas_adjudicacion_runner.py     # Script ejecutor
├── qualitas_adjudicacion_example.py    # Ejemplos y documentación
└── README_ADJUDICACION.md              # Este archivo
```

## 🔌 Endpoints API

### 1. Adjudicar una orden

```http
POST /admin/rpa/qualitas/adjudicar
Content-Type: application/json
```

**Request Body (por número de expediente):**

```json
{
  "id_expediente": "9070883",
  "wsreportid": "578576",
  "nombre": "JUAN CARLOS",
  "apellidos": "PEREZ GARCIA",
  "celular": "6671234567",
  "marca_qualitas_codigo": "KA",
  "placa": "FRU580A",
  "estatus_exp_id": "1",
  "headless": true
}
```

**Request Body (por número de reporte - desde OrdenAdmision.jsx):**

```json
{
  "num_reporte": "1995476",
  "nombre": "JUAN CARLOS",
  "apellidos": "PEREZ GARCIA",
  "celular": "6671234567",
  "marca_qualitas_codigo": "KA",
  "placa": "FRU580A",
  "estatus_exp_id": "1",
  "headless": true
}
```

**Response:**

```json
{
  "job_id": "qualitas_adj_20250307_143022_123456789",
  "status": "queued",
  "message": "Adjudicación del expediente 9070883 iniciada..."
}
```

### 2. Adjudicar múltiples órdenes (Batch)

```http
POST /admin/rpa/qualitas/adjudicar/batch
Content-Type: application/json
```

**Request Body:**

```json
{
  "ordenes": [
    {
      "id_expediente": "9070883",
      "wsreportid": "578576",
      "nombre": "JUAN CARLOS",
      "apellidos": "PEREZ GARCIA",
      "celular": "6671234567",
      "marca_qualitas_codigo": "KA",
      "placa": "FRU580A",
      "estatus_exp_id": "1"
    },
    {
      "id_expediente": "9070884",
      "wsreportid": "578577",
      "nombre": "MARIA",
      "apellidos": "GOMEZ LOPEZ",
      "celular": "6679876543",
      "marca_qualitas_codigo": "CT",
      "placa": "ABC123D",
      "estatus_exp_id": "2"
    }
  ],
  "headless": true,
  "stop_on_error": false
}
```

### 3. Ver estado de un job

```http
GET /admin/rpa/status/{job_id}
```

### 4. Listar jobs recientes

```http
GET /admin/rpa/jobs
```

### 5. Obtener códigos de marcas

```http
GET /admin/rpa/marcas-qualitas
```

## 📊 Campos del Formulario

### Obligatorios

| Campo | Descripción | Ejemplo |
|-------|-------------|---------|
| `id_expediente` | Número de expediente visible | `"9070883"` |
| `num_reporte` | Número de reporte/siniestro (alternativa a id_expediente) | `"1995476"` |
| `wsreportid` | ID interno del sistema Qualitas | `"578576"` |
| `nombre` | Nombre(s) del cliente | `"JUAN CARLOS"` |
| `apellidos` | Apellidos del cliente | `"PEREZ GARCIA"` |
| `celular` | Número de celular (10 dígitos) | `"6671234567"` |
| `marca_qualitas_codigo` | Código de 2 letras de Qualitas | `"KA"` (KIA) |
| `placa` | Número de placa del vehículo | `"FRU580A"` |

> **Nota:** Puedes usar `id_expediente` O `num_reporte` para buscar la orden. Si se proporciona `num_reporte`, se usará ese para la búsqueda.

### Opcionales

| Campo | Descripción | Valores |
|-------|-------------|---------|
| `lada` | Código de país | `"521"` (MX - default), `"1"` (USA) |
| `tel_fijo` | Teléfono fijo | `"6671234567"` |
| `email_cliente` | Correo electrónico | `"cliente@email.com"` |
| `modelo_id` | ID del modelo en el taller | `"12345"` |
| `anio_vehiculo` | Año del vehículo | `"2018"` |
| `color_vehiculo` | Código HEX del color | `"000000"` (Negro) |
| `economico` | Número económico | `"001"` |
| `nro_serie` | VIN del vehículo | `"3KPA24AC4JE031274"` |
| `es_hibrido_electrico` | ¿Es híbrido/eléctrico? | `false` (default) |
| `tipo_danio_id` | Tipo de daño | `"1"` (Colisión - default) |
| `estatus_exp_id` | Estatus del expediente | `"1"`=Piso, `"2"`=Tránsito, `"4"`=Express |
| `ingreso_grua` | ¿Ingresó en grúa? | `"0"`=No (default), `"1"`=Sí |
| `ubicacion` | Ubicación física | `"Taller Principal"` |

## 🚗 Códigos de Marca Qualitas

| Marca | Código | Marca | Código |
|-------|--------|-------|--------|
| KIA | `KA` | Chevrolet | `CT` |
| Honda | `HA` | Toyota | `TY` |
| Nissan | `NN` | Ford | `FD` |
| Volkswagen | `VW` | Mazda | `MA` |
| Hyundai | `HI` | Jeep | `JP` |
| BMW | `BW` | Mercedes Benz | `MZ` |
| Audi | `AI` | Tesla | `TE` |
| Acura | `AC` | Lexus | `LX` |
| Suzuki | `SI` | Subaru | `SU` |
| Otro | `BS` | | |

Ver lista completa: `GET /admin/rpa/marcas-qualitas`

## 🚀 Uso

### 1. Desde la API (Recomendado)

```bash
# Adjudicar una orden
curl -X POST http://localhost:8000/admin/rpa/qualitas/adjudicar \
  -H "Content-Type: application/json" \
  -d '{
    "id_expediente": "9070883",
    "wsreportid": "578576",
    "nombre": "JUAN CARLOS",
    "apellidos": "PEREZ GARCIA",
    "celular": "6671234567",
    "marca_qualitas_codigo": "KA",
    "placa": "FRU580A",
    "estatus_exp_id": "1",
    "headless": true
  }'

# Ver estado
curl http://localhost:8000/admin/rpa/status/qualitas_adj_20250307_143022_123456789
```

### 2. Desde OrdenAdmision.jsx (Frontend)

La integración con la página de Órdenes de Admisión permite adjudicar directamente desde el sistema:

**Pasos:**
1. Ve a "Recepción > Órdenes de Admisión"
2. Localiza la orden con aseguradora Qualitas
3. Haz clic en el botón 🤖 (robot morado) en la columna de acciones
4. Revisa la información en el modal
5. Haz clic en "Ejecutar RPA"

**Campos que se envían automáticamente:**
- `num_reporte`: Del campo `reporte_siniestro` de la orden
- `nombre`, `apellidos`: Del nombre del cliente
- `celular`: Teléfono del cliente (limpio, solo números)
- `marca_qualitas_codigo`: Código convertido desde la marca del vehículo
- `placa`, `anio_vehiculo`, `nro_serie`: Datos del vehículo
- `estatus_exp_id`: "1" (Piso) por defecto

**Nota:** El botón solo aparece para órdenes donde la aseguradora contenga "QUALITAS" en su nombre.

### 3. Desde línea de comandos

```bash
cd backend

# Generar archivos de ejemplo
python3 -m app.rpa.qualitas_adjudicacion_example generar

# Ejecutar adjudicación
python3 -m app.rpa.qualitas_adjudicacion_runner \
    rpa_ejemplos/ejemplo_adjudicacion_single.json \
    --headless \
    --use-db
```

### 3. Desde código Python

```python
import asyncio
from playwright.async_api import async_playwright
from app.rpa.qualitas_adjudicacion_handler import (
    QualitasAdjudicacionHandler,
    DatosAdjudicacion
)
from app.rpa.qualitas_full_workflow import do_login

async def adjudicar():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context()
        page = await context.new_page()
        
        # Login
        await do_login(page)
        
        # Preparar datos
        datos = DatosAdjudicacion(
            id_expediente="9070883",
            wsreportid="578576",
            nombre="JUAN CARLOS",
            apellidos="PEREZ GARCIA",
            celular="6671234567",
            marca_qualitas_codigo="KA",
            placa="FRU580A",
            estatus_exp_id="1"
        )
        
        # Ejecutar adjudicación
        handler = QualitasAdjudicacionHandler(page)
        resultado = await handler.adjudicar_orden(datos)
        
        print(f"Éxito: {resultado.exito}")
        print(f"Mensaje: {resultado.mensaje}")
        
        await browser.close()

asyncio.run(adjudicar())
```

## 🔄 Flujo de Trabajo Completo

1. **Extraer órdenes asignadas**
   ```bash
   curl -X POST http://localhost:8000/admin/rpa/qualitas
   ```

2. **Preparar datos de adjudicación**
   - Obtener `wsreportid` de los datos extraídos
   - Solicitar datos adicionales al cliente (si es necesario)
   - Determinar estatus (Piso/Tránsito/Express)

3. **Adjudicar orden**
   ```bash
   curl -X POST http://localhost:8000/admin/rpa/qualitas/adjudicar \
     -H "Content-Type: application/json" \
     -d '{...datos...}'
   ```

4. **Verificar resultado**
   ```bash
   curl http://localhost:8000/admin/rpa/status/{job_id}
   ```

## ⚠️ Notas Importantes

1. **Sesión persistente**: El RPA guarda la sesión de Qualitas en `backend/app/rpa/sessions/qualitas_session.json` para evitar logins repetidos.

2. **Captcha**: El login automático resuelve el reCAPTCHA usando 2captcha (requiere `CAPTCHA_API_KEY` en `.env`).

3. **Modal de aviso**: Después del login, el RPA maneja automáticamente el modal de avisos legales.

4. **Modelos**: El campo `modelo_id` requiere el ID del modelo en la base de datos del taller. Si no se proporciona, el select de modelo quedará vacío.

5. **Marca "Otro"**: Si la marca no está en la lista de Qualitas, usar código `"BS"` y proporcionar `marca_taller_id`.

## 🐛 Troubleshooting

### Error: "Expediente no encontrado"
- Verificar que el expediente esté en estado "Asignado"
- Confirmar que el `id_expediente` sea correcto

### Error: "Modal no está visible"
- Puede que la sesión haya expirado
- Intentar nuevamente (el RPA hará re-login automático)

### Error: "Errores de validación"
- Verificar que todos los campos obligatorios estén completos
- Revisar formato del celular (10 dígitos)
- Confirmar código de marca válido

## 📚 Documentación Adicional

Ver ejemplos completos:
```bash
python3 -m app.rpa.qualitas_adjudicacion_example

# O ver documentación detallada
python3 -m app.rpa.qualitas_adjudicacion_example docs
```
