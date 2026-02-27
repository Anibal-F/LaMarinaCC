#!/usr/bin/env python3
"""
Script para importar órdenes desde el JSON generado por el RPA.
Uso en EC2:
    cd ~/LaMarinaCC/backend
    python3 import_ordenes_from_json.py /tmp/qualitas_data.json
"""

import json
import sys
import os
from datetime import datetime
from pathlib import Path

# Agregar backend al path
backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from app.core.db import get_connection

def import_ordenes(json_path: str):
    """Importa órdenes desde archivo JSON."""
    
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # El JSON tiene la estructura del dashboard, necesitamos extraer órdenes
    # Las órdenes se guardan en un archivo separado o en el mismo JSON?
    print(f"[Info] Cargando datos desde: {json_path}")
    
    # Verificar si hay datos de órdenes en el JSON
    # El RPA guarda los datos en data.to_dict() que incluye estatus
    # Pero las órdenes detalladas se guardan aparte
    
    # Buscar archivo de órdenes
    ordenes_path = Path(json_path).parent / "qualitas_ordenes_export.json"
    if not ordenes_path.exists():
        print(f"[Error] No se encontró archivo de órdenes: {ordenes_path}")
        print("[Info] El RPA debe guardar las órdenes en un archivo separado")
        return
    
    with open(ordenes_path, 'r', encoding='utf-8') as f:
        ordenes_data = json.load(f)
    
    ordenes = ordenes_data.get('ordenes', [])
    fecha_extraccion = ordenes_data.get('fecha_extraccion', datetime.now().isoformat())
    
    print(f"[Info] {len(ordenes)} órdenes encontradas")
    
    # Insertar en BD
    inserted = 0
    with get_connection() as conn:
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
        
        conn.commit()
    
    print(f"[OK] {inserted} órdenes importadas exitosamente")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python3 import_ordenes_from_json.py <ruta_al_json>")
        sys.exit(1)
    
    import_ordenes(sys.argv[1])
