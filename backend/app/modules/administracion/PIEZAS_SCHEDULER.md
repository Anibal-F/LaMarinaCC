# Scheduler de Extracción de Piezas

Sistema de actualización automática de piezas de Qualitas y CHUBB.

## Características

- ✅ **Ejecución automática diaria** a las 6:00 AM (configurable)
- ✅ **Extracción secuencial** - Primero Qualitas, luego CHUBB (5 minutos de separación)
- ✅ **API REST** para control y monitoreo
- ✅ **Tareas encoladas** - Las extracciones se ejecutan en segundo plano

## Configuración

### Horario de Ejecución

Por defecto: **6:00 AM todos los días**

Para cambiar el horario:

```http
POST /admin/piezas-scheduler/schedule
{
    "hour": 7,
    "minute": 30
}
```

### Habilitar/Deshabilitar

```http
# Habilitar
POST /admin/piezas-scheduler/enable

# Deshabilitar
POST /admin/piezas-scheduler/disable
```

## Endpoints

### Estado del Scheduler

```http
GET /admin/piezas-scheduler/status
```

Retorna:
```json
{
  "running": true,
  "enabled": true,
  "schedule_time": "06:00",
  "last_run": "2026-03-22T06:00:00",
  "next_run": "2026-03-23T06:00:00",
  "time_until_next_run": 43200
}
```

### Control del Scheduler

```http
# Iniciar
POST /admin/piezas-scheduler/start

# Detener
POST /admin/piezas-scheduler/stop

# Fuerza ejecución inmediata
POST /admin/piezas-scheduler/force-run
```

### Cambiar Horario

```http
POST /admin/piezas-scheduler/schedule
{
    "hour": 5,
    "minute": 0
}
```

## Flujo de Ejecución

```
06:00:00 ┌─────────────────┐
         │  Inicia tarea   │
         │  Qualitas Piezas│
         └────────┬────────┘
                  │
                  ▼
06:00:01 ┌─────────────────┐
         │  Worker procesa │
         │  qualitas_piezas│
         │  _workflow.py   │
         └────────┬────────┘
                  │
                  ▼ (tarda ~30-60 min)
~06:45   ┌─────────────────┐
         │  Tarea completada│
         └─────────────────┘
                  │
                  │ (5 min de espera)
                  ▼
~06:50   ┌─────────────────┐
         │  Inicia tarea   │
         │  CHUBB Piezas   │
         └────────┬────────┘
                  │
                  ▼
~06:50   ┌─────────────────┐
         │  Worker procesa │
         │  chubb_piezas   │
         │  _extractor.py  │
         └────────┬────────┘
                  │
                  ▼ (tarda ~30-60 min)
~07:45   ┌─────────────────┐
         │  Tarea completada│
         └─────────────────┘
```

## Monitoreo

### Ver tareas en cola

```http
GET /admin/rpa-queue/tasks
```

### Ver logs de una tarea específica

```http
GET /admin/rpa-queue/tasks/{task_id}/logs
```

## Notas

- El scheduler inicia automáticamente cuando carga el backend
- Si el servidor se reinicia, el scheduler también se reinicia
- La extracción de Qualitas y CHUBB se ejecuta secuencialmente para evitar sobrecarga
- Cada tarea tiene un timeout de 1 hora
- Si una tarea falla, se puede reintentar manualmente con `force-run`
