#!/usr/bin/env python3
"""
Script automático para importar órdenes desde JSON a RDS.
Se ejecuta después del RPA para completar el flujo.
"""

import json
import glob
import os
import sys
from pathlib import Path

# Forzar DATABASE_URL correcto
os.environ['DATABASE_URL'] = 'postgresql+psycopg://LaMarinaCC:A355Fu584%24@lamarinacc-db.c7o8imsw0zss.us-east-1.rds.amazonaws.com:5432/postgres?sslmode=require'

import psycopg


def find_latest_ordenes_json():
    """Encuentra el archivo JSON de órdenes más reciente."""
    data_dir = Path(__file__).parent / "data"
    json_files = list(data_dir.glob("qualitas_ordenes_*.json"))
    
    if not json_files:
        return None
    
    return max(json_files, key=lambda p: p.stat().st_mtime)


def import_ordenes_to_rds(json_path: Path):
    """Importa órdenes desde JSON a RDS."""
    print(f"[AutoImport] Importando desde: {json_path}")
    
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    ordenes = data.get('ordenes', [])
    fecha_extraccion = data.get('fecha_extraccion')
    
    if not ordenes:
        print("[AutoImport] No hay órdenes para importar")
        return 0
    
    print(f"[AutoImport] Conectando a RDS...")
    
    # Conexión directa a RDS
    conn = psycopg.connect(
        'postgresql://LaMarinaCC:A355Fu584%24@lamarinacc-db.c7o8imsw0zss.us-east-1.rds.amazonaws.com:5432/postgres?sslmode=require',
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
            print(f"[AutoImport Error] {orden.get('num_expediente')}: {e}")
    
    conn.close()
    print(f"[AutoImport] ✓ {inserted}/{len(ordenes)} órdenes importadas a RDS")
    return inserted


def main():
    """Función principal."""
    json_file = find_latest_ordenes_json()
    
    if not json_file:
        print("[AutoImport] No se encontró archivo JSON de órdenes")
        sys.exit(1)
    
    import_ordenes_to_rds(json_file)


if __name__ == "__main__":
    main()
