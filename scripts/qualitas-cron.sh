#!/bin/bash
# Cronjob para actualizar indicadores y órdenes de Qualitas cada 2 horas
# Agregar a crontab: 0 */2 * * * /home/ubuntu/LaMarinaCC/scripts/qualitas-cron.sh

cd /home/ubuntu/LaMarinaCC

LOG_FILE="/var/log/qualitas-cron.log"
DATE=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$DATE] Iniciando actualización de Qualitas..." >> $LOG_FILE

# Ejecutar RPA dentro del contenedor
docker exec lamarinacc-backend-1 python3 -m app.rpa.qualitas_full_workflow --headless --use-db --skip-login >> $LOG_FILE 2>&1

# Buscar el JSON más reciente de órdenes
LATEST_JSON=$(docker exec lamarinacc-backend-1 ls -t /app/app/rpa/data/qualitas_ordenes_*.json 2>/dev/null | head -1)

if [ -n "$LATEST_JSON" ]; then
    echo "[$DATE] Importando órdenes desde $LATEST_JSON..." >> $LOG_FILE
    
    # Ejecutar importación dentro del contenedor
    docker exec lamarinacc-backend-1 python3 -c "
import json
import psycopg

with open('$LATEST_JSON') as f:
    data = json.load(f)

ordenes = data.get('ordenes', [])
fecha = data.get('fecha_extraccion')

conn = psycopg.connect(
    'postgresql://LaMarinaCC:A355Fu584%24@lamarinacc-db.c7o8imsw0zss.us-east-1.rds.amazonaws.com:5432/postgres?sslmode=require',
    autocommit=True
)

inserted = 0
for o in ordenes:
    try:
        conn.execute('INSERT INTO qualitas_ordenes_asignadas (num_expediente, fecha_asignacion, poliza, siniestro, reporte, riesgo, vehiculo, anio, placas, estatus, fecha_extraccion) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING', 
        (o['num_expediente'], o['fecha_asignacion'], o['poliza'], o.get('siniestro',''), o.get('reporte',''), o['riesgo'], o['vehiculo'], o['anio'], o['placas'], o['estatus'], fecha))
        inserted += 1
    except Exception as e:
        print(f'Error: {e}')

conn.close()
print(f'Importadas {inserted}/{len(ordenes)} ordenes')
" >> $LOG_FILE 2>&1
else
    echo "[$DATE] No se encontró archivo JSON de órdenes" >> $LOG_FILE
fi

echo "[$DATE] Proceso completado" >> $LOG_FILE
echo "---" >> $LOG_FILE
