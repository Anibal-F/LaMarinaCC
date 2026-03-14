#!/bin/bash
# Script para extraer piezas de Qualitas - Ejecutar cada 4 horas vía cronjob
# Uso: ./extract_qualitas_piezas.sh [max_ordenes]

set -e

# Configuración
MAX_ORDENES="${1:-10}"  # Por defecto 10 órdenes
API_KEY="${CRON_API_KEY:-lamarina-cron-2024}"
API_URL="http://localhost:8010/inventario/extract/qualitas"
LOG_FILE="/var/log/lamarinacc/qualitas_piezas_cron.log"
DATE=$(date '+%Y-%m-%d %H:%M:%S')

# Crear directorio de logs si no existe
mkdir -p "$(dirname "$LOG_FILE")"

# Función para loggear
log() {
    echo "[$DATE] $1" | tee -a "$LOG_FILE"
}

log "========================================"
log "Iniciando extracción automática de piezas Qualitas"
log "Max órdenes: $MAX_ORDENES"

# Verificar que curl esté disponible
if ! command -v curl &> /dev/null; then
    log "ERROR: curl no encontrado"
    exit 1
fi

# Llamar al endpoint de extracción
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    "${API_URL}?max_ordenes=${MAX_ORDENES}&api_key=${API_KEY}" \
    -H "Content-Type: application/json" \
    --max-time 600 2>&1) || {
    log "ERROR: Fallo en la petición curl"
    exit 1
}

# Separar body y status code
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    ORDENES=$(echo "$BODY" | grep -o '"ordenes_procesadas":[0-9]*' | cut -d':' -f2)
    PIEZAS=$(echo "$BODY" | grep -o '"total_piezas":[0-9]*' | cut -d':' -f2)
    log "✓ Extracción completada exitosamente"
    log "  - Órdenes procesadas: $ORDENES"
    log "  - Total piezas: $PIEZAS"
else
    log "✗ Error en la extracción (HTTP $HTTP_CODE)"
    log "  Respuesta: $BODY"
    exit 1
fi

log "========================================"
log ""

exit 0
