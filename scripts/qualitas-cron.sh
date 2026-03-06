#!/bin/bash
# Cronjob para actualizar indicadores y órdenes de Qualitas cada 2 horas
# Agregar a crontab: 0 */2 * * * /home/ubuntu/LaMarinaCC/scripts/qualitas-cron.sh

cd /home/ubuntu/LaMarinaCC

LOG_FILE="/var/log/qualitas-cron.log"
DATE=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$DATE] Iniciando actualización de Qualitas..." >> $LOG_FILE

# Ejecutar RPA dentro del contenedor
# NOTA: El RPA ya guarda las órdenes directamente en BD, no es necesario importar después
docker exec lamarinacc-backend-1 python3 -m app.rpa.qualitas_full_workflow --headless --use-db --skip-login >> $LOG_FILE 2>&1

echo "[$DATE] Proceso completado" >> $LOG_FILE
echo "---" >> $LOG_FILE
