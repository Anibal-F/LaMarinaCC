# RPA Scheduler - Actualización Automática de Qualitas

Sistema de actualización automática de indicadores de Qualitas cada 2 horas.

## Características

- ✅ **Ejecución automática** cada 2 horas (configurable)
- ✅ **Verificación inteligente de sesión** - reutiliza sesión válida
- ✅ **Reintento automático** con login completo si la sesión expiró
- ✅ **API REST** para control y monitoreo
- ✅ **Persistencia** - las tareas se guardan en la base de datos

## Endpoints

### Estado del Scheduler
```http
GET /admin/rpa-queue/scheduler/status
```

Retorna:
```json
{
  "running": true,
  "interval_hours": 2,
  "last_run": "2026-02-21T21:25:02",
  "next_run": "2026-02-21T23:25:02",
  "current_task_id": null,
  "time_until_next_run": 7200
}
```

### Iniciar Scheduler
```http
POST /admin/rpa-queue/scheduler/start?interval_hours=2
```

### Detener Scheduler
```http
POST /admin/rpa-queue/scheduler/stop
```

### Reiniciar Scheduler
```http
POST /admin/rpa-queue/scheduler/restart?interval_hours=4
```

### Forzar Ejecución Inmediata
```http
POST /admin/rpa-queue/scheduler/force-run
```

Retorna:
```json
{
  "success": true,
  "message": "Ejecución forzada iniciada",
  "task_id": "qualitas_extract_20260221_215000",
  "check_status_url": "/admin/rpa-queue/tasks/qualitas_extract_20260221_215000"
}
```

### Ver Estado de una Tarea
```http
GET /admin/rpa-queue/tasks/{task_id}
```

## Flujo de Ejecución

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Cada 2 horas   │────▶│  Verificar sesión │────▶│  ¿Sesión válida?│
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                              Sí                          │     No
                              ▼                           │     ▼
                    ┌──────────────────┐                  │  ┌──────────────────┐
                    │  Usar --skip-    │                  │  │  Login completo  │
                    │  login (rápido)  │                  │  │  con CAPTCHA     │
                    └────────┬─────────┘                  │  │  (30-120s)       │
                             │                            │  └────────┬─────────┘
                             │                            │           │
                             └────────────┬───────────────┘           │
                                          ▼                           ▼
                              ┌──────────────────┐
                              │  Extraer datos   │
                              │  del dashboard   │
                              └────────┬─────────┘
                                       ▼
                              ┌──────────────────┐
                              │  Guardar en DB   │
                              └──────────────────┘
```

## Lógica de Reintento

El sistema implementa lógica inteligente de reintento:

1. **Primer intento**: Usa sesión existente (`--skip-login`)
2. **Si falla por sesión expirada**:
   - Detecta el error (busca "session expired", "sesión expirada", etc.)
   - Elimina la sesión expirada
   - Reintenta con login completo (CAPTCHA)
3. **Si falla por otro motivo**: Reporta error

## Configuración

El intervalo por defecto es de **2 horas**. Puedes cambiarlo usando el endpoint `restart`:

```bash
# Cambiar a 4 horas
curl -X POST "http://localhost:8000/admin/rpa-queue/scheduler/restart?interval_hours=4"

# Cambiar a 1 hora
curl -X POST "http://localhost:8000/admin/rpa-queue/scheduler/restart?interval_hours=1"
```

## Monitoreo

### Logs del Scheduler
Los logs se escriben en el logger de Python con prefijo `[Scheduler]`.

### Estado de Tareas
Todas las ejecuciones se registran como tareas en la cola:

```http
GET /admin/rpa-queue/tasks
```

### Historial de Indicadores
```http
GET /admin/qualitas/indicadores/historial
```

## Archivos Relacionados

- `rpa_scheduler.py` - Lógica del scheduler
- `rpa_queue.py` - Cola de tareas y worker
- `qualitas_indicadores.py` - Guardado de indicadores en DB
- `qualitas_full_workflow.py` - RPA de Qualitas

## Notas

- El scheduler inicia automáticamente al cargar el módulo
- Si el servidor se reinicia, el scheduler también se reinicia
- Las sesiones se guardan en `app/rpa/sessions/qualitas_session.json`
- Los datos extraídos se guardan en `app/rpa/data/qualitas_dashboard_*.json`
