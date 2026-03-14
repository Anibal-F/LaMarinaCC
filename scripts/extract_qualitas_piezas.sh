#!/bin/bash
# Script para extraer piezas de Qualitas - Ejecutar cada 4 horas vía cronjob
# Con reintentos automáticos y sistema de checkpoints
# Uso: ./extract_qualitas_piezas.sh [max_ordenes] [--reset]

set -e

# Configuración
MAX_ORDENES="${1:-10}"  # Por defecto 10 órdenes
API_KEY="${CRON_API_KEY:-lamarina-cron-2024}"
API_URL="http://localhost:8010/inventario/extract/qualitas"
LOG_FILE="/var/log/lamarinacc/qualitas_piezas_cron.log"
DATE=$(date '+%Y-%m-%d %H:%M:%S')

# Verificar si se quiere reiniciar el checkpoint
RESET_CHECKPOINT="false"
if [ "$2" = "--reset" ]; then
    RESET_CHECKPOINT="true"
    echo "[$DATE] ⚠️ Se reiniciará el checkpoint (empezar desde cero)"
fi

# Crear directorio de logs si no existe
mkdir -p "$(dirname "$LOG_FILE")"

# Función para loggear
log() {
    echo "[$DATE] $1" | tee -a "$LOG_FILE"
}

log "========================================"
log "Iniciando extracción automática de piezas Qualitas"
log "Max órdenes: $MAX_ORDENES"
log "Reset checkpoint: $RESET_CHECKPOINT"

# Verificar que curl esté disponible
if ! command -v curl &> /dev/null; then
    log "ERROR: curl no encontrado"
    exit 1
fi

# Construir URL con parámetros
URL="${API_URL}?max_ordenes=${MAX_ORDENES}&api_key=${API_KEY}&max_retries=3"

if [ "$RESET_CHECKPOINT" = "true" ]; then
    URL="${URL}&reset_checkpoint=true"
fi

log "URL: $API_URL"
log "Ejecutando extracción con reintentos automáticos..."
log "(Esto puede tomar hasta 90 minutos en caso de múltiples reintentos)"

# Llamar al endpoint de extracción (con timeout de 100 minutos)
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    "$URL" \
    -H "Content-Type: application/json" \
    --max-time 6000 2>&1) || {
    log "ERROR: Fallo en la petición curl"
    exit 1
}

# Separar body y status code
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    ORDENES=$(echo "$BODY" | grep -o '"ordenes_procesadas":[0-9]*' | cut -d':' -f2)
    PIEZAS=$(echo "$BODY" | grep -o '"total_piezas":[0-9]*' | cut -d':' -f2)
    RETRIES=$(echo "$BODY" | grep -o '"retries_used":[0-9]*' | cut -d':' -f2)
    PROCESADAS=$(echo "$BODY" | grep -o '"procesadas":[0-9]*' | cut -d':' -f2 | head -1)
    FALLIDAS=$(echo "$BODY" | grep -o '"fallidas":[0-9]*' | cut -d':' -f2 | head -1)
    
    log "✓ Extracción completada exitosamente"
    log "  - Órdenes procesadas: $ORDENES"
    log "  - Total piezas: $PIEZAS"
    log "  - Reintentos usados: $RETRIES"
    [ ! -z "$PROCESADAS" ] && log "  - Total en checkpoint: $PROCESADAS"
    [ ! -z "$FALLIDAS" ] && [ "$FALLIDAS" -gt 0 ] && log "  - Órdenes fallidas: $FALLIDAS"
else
    log "✗ Error en la extracción (HTTP $HTTP_CODE)"
    log "  Respuesta: $BODY"
    exit 1
fi

log "========================================"
log ""

exit 0
