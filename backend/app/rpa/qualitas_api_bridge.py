"""
Puente entre el RPA de Qualitas y la API del backend.

Este script se ejecuta desde el RPA para guardar los datos extraídos
en la base de datos mediante la API interna.
"""

import json
import sys
from pathlib import Path
from datetime import datetime

# Añadir el backend al path
backend_dir = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(backend_dir))

from app.modules.administracion.qualitas_indicadores import save_indicadores


def save_latest_data(json_file_path: str) -> bool:
    """
    Guarda los datos del archivo JSON más reciente en la base de datos.
    
    Args:
        json_file_path: Ruta al archivo JSON con los datos extraídos
        
    Returns:
        True si se guardó exitosamente
    """
    try:
        with open(json_file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        record_id = save_indicadores(data)
        print(f"[Bridge] Datos guardados en DB con ID: {record_id}")
        return True
        
    except Exception as e:
        print(f"[Bridge] Error guardando datos: {e}")
        return False


def get_latest_data_file() -> Path:
    """Obtiene el archivo de datos más reciente."""
    data_dir = Path(__file__).resolve().parent / "data"
    json_files = sorted(data_dir.glob("qualitas_dashboard_*.json"), reverse=True)
    
    if not json_files:
        raise FileNotFoundError("No se encontraron archivos de datos")
    
    return json_files[0]


if __name__ == "__main__":
    # Si se pasa un archivo como argumento, usarlo
    if len(sys.argv) > 1:
        json_file = sys.argv[1]
    else:
        # Buscar el archivo más reciente
        json_file = get_latest_data_file()
    
    success = save_latest_data(str(json_file))
    sys.exit(0 if success else 1)
