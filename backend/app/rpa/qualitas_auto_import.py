#!/usr/bin/env python3
"""
Script automático para extraer e importar órdenes de Qualitas a RDS.
Este script se ejecuta desde el cronjob cada 2 horas.
"""

import os
import sys
import json
import asyncio
from datetime import datetime
from pathlib import Path

# Forzar DATABASE_URL de RDS
os.environ['DATABASE_URL'] = 'postgresql+psycopg://LaMarinaCC:A355Fu584%24@lamarinacc-db.c7o8imsw0zss.us-east-1.rds.amazonaws.com:5432/postgres?sslmode=require'

import psycopg


def import_ordenes_from_json(json_path: str) -> int:
    """Importa órdenes desde JSON a RDS."""
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    ordenes = data.get('ordenes', [])
    fecha_extraccion = data.get('fecha_extraccion', datetime.now().isoformat())
    
    if not ordenes:
        print("[Import] No hay órdenes para importar")
        return 0
    
    print(f"[Import] Conectando a RDS...")
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
            print(f"[Error] {orden.get('num_expediente')}: {e}")
    
    conn.close()
    print(f"[Import] {inserted}/{len(ordenes)} órdenes importadas a RDS")
    return inserted


async def main():
    """Flujo completo: extraer + importar."""
    print("=" * 60)
    print("QUALITAS AUTO-IMPORT")
    print("=" * 60)
    
    # 1. Ejecutar RPA para extraer datos
    print("\n[1/2] Extrayendo datos de Qualitas...")
    
    from app.rpa.qualitas_full_workflow import run_workflow, load_credentials
    
    if not load_credentials(use_db=True):
        print("[Error] No se pudieron cargar credenciales")
        return
    
    try:
        # Ejecutar workflow (esto guarda JSON si falla BD)
        await run_workflow(skip_login=True, headless=True, save_json=True, use_db=True)
    except Exception as e:
        print(f"[Warning] El workflow terminó con errores: {e}")
        # Continuar para intentar importar desde JSON
    
    # 2. Buscar archivo JSON más reciente
    print("\n[2/2] Importando a RDS...")
    
    data_dir = Path(__file__).parent / "data"
    json_files = sorted(data_dir.glob("qualitas_ordenes_*.json"), reverse=True)
    
    if json_files:
        latest_json = json_files[0]
        print(f"[Import] Archivo encontrado: {latest_json}")
        import_ordenes_from_json(str(latest_json))
    else:
        print("[Warning] No se encontró archivo JSON de órdenes")
    
    print("\n" + "=" * 60)
    print("✓ Proceso completado")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
