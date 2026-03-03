#!/bin/bash
# ============================================================================
# CRONJOB PARA ACTUALIZACIÓN AUTOMÁTICA DE CHUBB
# 
# Este script puede ser ejecutado manualmente o configurado en crontab
# Zona horaria: America/Mazatlan (Mazatlán, Sinaloa)
#
# Configuración en crontab (cada 2 horas):
# 0 */2 * * * /bin/bash /ruta/al/proyecto/scripts/chubb_cronjob.sh >> /var/log/chubb_cron.log 2>&1
# ============================================================================

set -e

# Configuración
BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../backend" && pwd)"
LOG_FILE="/var/log/lamarinacc_chubb.log"
API_URL="http://localhost:8000"  # Ajustar según la configuración

# Crear log directory si no existe
sudo mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true

# Función de logging
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE" 2>/dev/null || echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "=========================================="
log "Iniciando actualización CHUBB - Cronjob"
log "Zona horaria: $(date +%Z)"
log "=========================================="

# Cambiar al directorio del backend
cd "$BACKEND_DIR"

# Verificar que el entorno virtual existe
if [ -d "venv" ]; then
    source venv/bin/activate
    log "Entorno virtual activado"
elif [ -d ".venv" ]; then
    source .venv/bin/activate
    log "Entorno virtual activado"
else
    log "⚠ No se encontró entorno virtual, usando python del sistema"
fi

# Opción 1: Usar el API del backend (recomendado - usa la cola de tareas)
log "Encolando tarea de actualización CHUBB via API..."
RESPONSE=$(curl -s -X POST "${API_URL}/admin/rpa-queue/chubb/actualizar" -H "Content-Type: application/json" 2>/dev/null || echo '{"success": false}')

if echo "$RESPONSE" | grep -q '"success": true'; then
    TASK_ID=$(echo "$RESPONSE" | grep -o '"task_id": "[^"]*"' | cut -d'"' -f4)
    log "✓ Tarea encolada exitosamente: $TASK_ID"
    log "Monitorear estado en: ${API_URL}/admin/rpa-queue/tasks/${TASK_ID}"
else
    log "✗ Error encolando tarea: $RESPONSE"
    
    # Opción 2: Ejecutar RPA directamente (fallback)
    log "Intentando ejecución directa del RPA..."
    
    if python3 -m app.rpa.chubb_full_workflow --headless --use-db --extract-data >> "$LOG_FILE" 2>&1; then
        log "✓ RPA ejecutado exitosamente"
    else
        log "✗ Error ejecutando RPA directamente"
        exit 1
    fi
fi

log "=========================================="
log "Actualización CHUBB completada"
log "=========================================="
