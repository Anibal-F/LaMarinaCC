#!/usr/bin/env python3
"""
Importa órdenes desde archivo JSON a RDS.
Uso: python3 import_ordenes_json.py <archivo_json>
"""

import json
import sys
import os
from datetime import datetime
from pathlib import Path

# Configurar DATABASE_URL desde variable de entorno
os.environ['DATABASE_URL'] = 'postgresql+psycopg://LaMarinaCC:A355Fu584$@lamarinacc-db.c7o8imsw0zss.us-east-1.rds.amazonaws.com:5432/postgres?sslmode=require'

backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

import psycopg


def import_ordenes(json_path: str):
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    ordenes = data.get('ordenes', [])
    fecha_extraccion = data.get('fecha_extraccion', datetime.now().isoformat())
    
    print(f"[Info] Importando {len(ordenes)} órdenes...")
    
    # Conectar directamente a RDS
    conn = psycopg.connect(
        'postgresql://LaMarinaCC:A355Fu584$@lamarinacc-db.c7o8imsw0zss.us-east-1.rds.amazonaws.com:5432/postgres?sslmode=require',
        autocommit=True
    )
    
    inserted = 0
    for orden in ordenes:
        try:
            conn.execute("""
                INSERT INTO qualitas_ordenes_asignadas 
                (num_expediente, fecha_asignacion, poliza, siniestro, reporte, 
                 riesgo, vehiculo, anio, placas, estatus, fecha_extraccion)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (num_expediente, fecha_extraccion) DO NOTHING
            """, (
                orden.get('num_expediente'),
                orden.get('fecha_asignacion'),
                orden.get('poliza'),
                orden.get('siniestro'),
                orden.get('reporte'),
                orden.get('riesgo'),
                orden.get('vehiculo'),
                orden.get('anio'),
                orden.get('placas'),
                orden.get('estatus'),
                fecha_extraccion
            ))
            inserted += 1
        except Exception as e:
            print(f"[Error] {orden.get('num_expediente')}: {e}")
    
    conn.close()
    print(f"[OK] {inserted} órdenes importadas")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python3 import_ordenes_json.py <archivo_json>")
        sys.exit(1)
    
    import_ordenes(sys.argv[1])
