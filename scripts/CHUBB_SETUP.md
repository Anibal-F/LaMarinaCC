# Configuración de CHUBB - La Marina CC

Este documento describe la configuración completa para la integración de CHUBB con la plataforma La Marina Collision Center.

## 🗄️ Configuración de Base de Datos

### 1. Ejecutar Script SQL en pgAdmin4

Abrir pgAdmin4 y ejecutar el archivo:
```
scripts/chubb_database_setup.sql
```

Esto creará las siguientes tablas:
- `chubb_indicadores` - Almacena los indicadores por estado
- `chubb_expedientes` - Almacena todos los expedientes extraídos
- `v_chubb_expedientes_recientes` - Vista de expedientes de la última extracción

## 🔧 Configuración del Backend

### 2. Credenciales de CHUBB

Configurar las credenciales en el panel de administración:
1. Ir a **Admin → Credenciales**
2. Crear nueva credencial:
   - **Seguro**: CHUBB
   - **Plataforma URL**: https://acg-prod-mx.audatex.com.mx/Audanet/
   - **Usuario**: (tu usuario de CHUBB)
   - **Password**: (tu contraseña)
   - **Taller ID**: (ID del taller)

Alternativamente, crear archivo `backend/.envChubb`:
```bash
CHUBB_LOGIN_URL=https://acg-prod-mx.audatex.com.mx/Audanet/
CHUBB_USER=tu_usuario
CHUBB_PASSWORD=tu_password
```

### 3. Instalación de Dependencias (si no están instaladas)

```bash
cd backend
pip install playwright playwright-stealth
playwright install chromium
```

## 🚀 Uso del Sistema

### Ejecución Manual

**Via API (Recomendado):**
```bash
curl -X POST http://localhost:8000/admin/chubb/indicadores/actualizar
```

**Via Cola de Tareas (Async):**
```bash
curl -X POST http://localhost:8000/admin/rpa-queue/chubb/actualizar
```

**Directamente con Python:**
```bash
cd backend
python3 -m app.rpa.chubb_full_workflow --headless --use-db --extract-data
```

### Opciones del Script RPA

```bash
python3 -m app.rpa.chubb_full_workflow [opciones]

Opciones:
  --skip-login    Usar sesión existente (más rápido)
  --headless      Ejecutar sin ventana visible
  --save-json     Guardar datos en archivo JSON
  --use-db        Usar credenciales desde la base de datos (por defecto)
  --use-env       Usar credenciales desde archivo .envChubb
  --extract-data  Extraer datos de expedientes de todas las páginas
```

## ⏰ Configuración del Cronjob

El sistema incluye un **scheduler automático** que se inicia con el backend (cada 2 horas), pero también se puede configurar un cronjob del sistema como respaldo.

### Opción 1: Scheduler Automático (Ya incluido)

El scheduler ya está configurado y se inicia automáticamente cuando arranca el backend. Verificar estado:

```bash
curl http://localhost:8000/admin/rpa-queue/scheduler/status
```

### Opción 2: Crontab del Sistema (Respaldo)

**1. Hacer el script ejecutable:**
```bash
chmod +x scripts/chubb_cronjob.sh
```

**2. Editar crontab:**
```bash
sudo crontab -e
```

**3. Agregar líneas (Zona horaria Mazatlán - UTC-7):**

```cron
# CHUBB - Ejecutar cada 2 horas en zona horaria Mazatlán
# Nota: El servidor debe estar configurado con TZ=America/Mazatlan

# Opción A: Usar el API del backend (Recomendado)
0 */2 * * * curl -s -X POST http://localhost:8000/admin/rpa-queue/chubb/actualizar > /dev/null 2>&1

# Opción B: Usar el script shell
0 */2 * * * /bin/bash /ruta/completa/al/proyecto/scripts/chubb_cronjob.sh >> /var/log/chubb_cron.log 2>&1
```

**4. Configurar zona horaria del servidor:**
```bash
# Verificar zona horaria actual
date

# Configurar zona horaria a Mazatlán
sudo timedatectl set-timezone America/Mazatlan

# Verificar
timedatectl
```

### Horarios Sugeridos (Mazatlán UTC-7)

Si quieres ejecuciones específicas durante el día laboral:

```cron
# Ejecutar a las: 6am, 8am, 10am, 12pm, 2pm, 4pm, 6pm (hora de Mazatlán)
0 6,8,10,12,14,16,18 * * * curl -s -X POST http://localhost:8000/admin/rpa-queue/chubb/actualizar > /dev/null 2>&1
```

## 🌐 Endpoints API Disponibles

### Indicadores
- `GET /admin/chubb/indicadores` - Obtener indicadores más recientes
- `POST /admin/chubb/indicadores/actualizar` - Ejecutar RPA y actualizar
- `GET /admin/chubb/indicadores/estatus` - Ver estado de la última actualización
- `GET /admin/chubb/indicadores/historial` - Ver historial de indicadores

### Expedientes
- `GET /admin/chubb/expedientes` - Obtener expedientes (parámetros: `estado`, `limit`)
- `GET /admin/chubb/expedientes/estados` - Obtener lista de estados con conteos

### Cola de Tareas
- `POST /admin/rpa-queue/chubb/actualizar` - Encolar actualización de CHUBB
- `GET /admin/rpa-queue/tasks/{task_id}` - Ver estado de una tarea

### Scheduler
- `GET /admin/rpa-queue/scheduler/status` - Estado de todos los schedulers
- `POST /admin/rpa-queue/scheduler/force-run` - Forzar ejecución inmediata

## 📊 Estados de Expedientes

Los expedientes en CHUBB pueden tener los siguientes estados:

| Estado | Descripción |
|--------|-------------|
| `Por Aprobar` | Expedientes pendientes de autorización |
| `Autorizado` | Expedientes ya autorizados |
| `Rechazado` | Expedientes rechazados |
| `Complemento` | Complementos solicitados |

## 🔍 Troubleshooting

### El RPA no puede hacer login
- Verificar credenciales en Admin → Credenciales
- Revisar si la sesión expiró (borrar `backend/app/rpa/sessions/chubb_session.json`)
- Verificar que el sitio de CHUBB esté disponible

### No se extraen datos
- Verificar que el usuario tenga permisos para ver "Mi Trabajo"
- Revisar screenshots en `backend/app/rpa/sessions/` para debugging
- Verificar logs del backend

### Error de zona horaria
```bash
# Verificar zona horaria de PostgreSQL
psql -c "SHOW timezone;"

# Configurar en postgresql.conf si es necesario:
# timezone = 'America/Mazatlan'
```

## 📁 Archivos Importantes

- `backend/app/rpa/chubb_full_workflow.py` - Script RPA principal
- `backend/app/modules/administracion/chubb_indicadores.py` - Módulo backend
- `backend/app/modules/administracion/rpa_scheduler.py` - Scheduler automático
- `frontend/src/components/ChubbIndicators.jsx` - Componente de indicadores
- `frontend/src/components/ChubbExpedientes.jsx` - Componente de tabla
- `scripts/chubb_database_setup.sql` - Script SQL para tablas
- `scripts/chubb_cronjob.sh` - Script de cronjob
