"""
Script de importación de modelos de autos a la base de datos.

Este script toma el JSON generado por qualitas_modelos_extractor.py
y lo importa a las tablas marcas_autos y modelos_autos.

Uso:
    # Importar automáticamente (crea marcas si no existen)
    python3 -m app.rpa.import_modelos_to_db
    
    # Preview sin insertar
    python3 -m app.rpa.import_modelos_to_db --preview
    
    # Importar desde archivo específico
    python3 -m app.rpa.import_modelos_to_db --file ruta/al/archivo.json
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Dict, List, Set, Tuple

# Agregar backend al path
backend_dir = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(backend_dir))

from app.core.db import get_connection


def get_existing_marcas() -> Dict[str, int]:
    """Obtiene las marcas existentes en la base de datos."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, nb_marca FROM marcas_autos"
        ).fetchall()
        return {row[1].upper(): row[0] for row in rows}


def get_existing_modelos() -> Set[Tuple[int, str]]:
    """Obtiene los modelos existentes como set de (marca_id, modelo_upper)."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT marca_id, UPPER(nb_modelo) FROM modelos_autos"
        ).fetchall()
        return set(rows)


def create_marca(nb_marca: str, gpo_marca: str = "GENERAL") -> int:
    """
    Crea una nueva marca en la base de datos.
    
    Args:
        nb_marca: Nombre de la marca
        gpo_marca: Grupo de la marca (default: GENERAL)
        
    Returns:
        ID de la marca creada
    """
    # Verificar si existe el grupo, si no, crearlo
    with get_connection() as conn:
        # Crear grupo si no existe
        conn.execute(
            """
            INSERT INTO grupos_autos (nb_grupo)
            VALUES (%s)
            ON CONFLICT (LOWER(nb_grupo)) DO NOTHING
            """,
            (gpo_marca,)
        )
        
        # Crear marca
        row = conn.execute(
            """
            INSERT INTO marcas_autos (gpo_marca, nb_marca)
            VALUES (%s, %s)
            RETURNING id
            """,
            (gpo_marca, nb_marca)
        ).fetchone()
        
        conn.commit()
        return row[0]


def create_modelo(marca_id: int, nb_modelo: str) -> int:
    """
    Crea un nuevo modelo en la base de datos.
    
    Args:
        marca_id: ID de la marca
        nb_modelo: Nombre del modelo
        
    Returns:
        ID del modelo creado
    """
    with get_connection() as conn:
        row = conn.execute(
            """
            INSERT INTO modelos_autos (marca_id, nb_modelo)
            VALUES (%s, %s)
            RETURNING id
            """,
            (marca_id, nb_modelo)
        ).fetchone()
        conn.commit()
        return row[0]


def import_modelos(
    data: Dict,
    skip_existing: bool = True,
    dry_run: bool = False
) -> Dict:
    """
    Importa los modelos a la base de datos.
    
    Args:
        data: Datos extraídos del JSON
        skip_existing: Si True, omite modelos que ya existen
        dry_run: Si True, solo muestra lo que se importaría sin insertar
        
    Returns:
        Estadísticas de la importación
    """
    stats = {
        'marcas_creadas': 0,
        'modelos_creados': 0,
        'modelos_omitidos': 0,
        'errores': []
    }
    
    print("[Importación] Analizando datos...")
    
    # Obtener datos existentes
    marcas_db = get_existing_marcas()
    modelos_db = get_existing_modelos()
    
    print(f"[DB] Marcas existentes: {len(marcas_db)}")
    print(f"[DB] Modelos existentes: {len(modelos_db)}")
    
    # Procesar datos
    modelos_por_marca = data.get('modelos_por_marca', {})
    
    print(f"\n[Importación] Procesando {len(modelos_por_marca)} marcas...")
    
    for marca_nombre, modelos_list in modelos_por_marca.items():
        marca_upper = marca_nombre.upper()
        
        # Verificar/crear marca
        if marca_upper in marcas_db:
            marca_id = marcas_db[marca_upper]
            if not dry_run:
                print(f"  [Marca] {marca_nombre} (ID: {marca_id}) - Existente")
        else:
            if dry_run:
                print(f"  [Marca] {marca_nombre} - SE CREARÍA")
                marca_id = -1  # Placeholder para dry-run
            else:
                marca_id = create_marca(marca_nombre)
                marcas_db[marca_upper] = marca_id
                stats['marcas_creadas'] += 1
                print(f"  [Marca] {marca_nombre} (ID: {marca_id}) - CREADA")
        
        # Procesar modelos de esta marca
        for modelo_nombre in modelos_list:
            modelo_key = (marca_id, modelo_nombre.upper())
            
            if skip_existing and modelo_key in modelos_db:
                stats['modelos_omitidos'] += 1
                continue
            
            if dry_run:
                print(f"    [Modelo] {modelo_nombre} - SE INSERTARÍA")
                stats['modelos_creados'] += 1
            else:
                try:
                    create_modelo(marca_id, modelo_nombre)
                    stats['modelos_creados'] += 1
                    modelos_db.add(modelo_key)  # Agregar al set para evitar duplicados
                    print(f"    [Modelo] {modelo_nombre} - CREADO")
                except Exception as e:
                    error_msg = f"Error creando modelo {modelo_nombre} ({marca_nombre}): {e}"
                    stats['errores'].append(error_msg)
                    print(f"    [ERROR] {modelo_nombre}: {e}")
    
    return stats


def preview_data(data: Dict):
    """Muestra un preview de los datos a importar."""
    print("\n" + "=" * 60)
    print("PREVIEW DE DATOS")
    print("=" * 60)
    
    print(f"\nTotal de marcas: {data.get('total_marcas', 0)}")
    print(f"Total de modelos: {data.get('total_modelos', 0)}")
    
    print("\nMarcas encontradas:")
    marcas = data.get('marcas_unicas', [])
    for i, marca in enumerate(marcas[:20], 1):
        print(f"  {i}. {marca}")
    if len(marcas) > 20:
        print(f"  ... y {len(marcas) - 20} más")
    
    print("\nEjemplos de modelos por marca:")
    modelos_por_marca = data.get('modelos_por_marca', {})
    for marca, modelos in list(modelos_por_marca.items())[:5]:
        print(f"\n  {marca} ({len(modelos)} modelos):")
        for modelo in modelos[:3]:
            print(f"    - {modelo}")
        if len(modelos) > 3:
            print(f"    ... y {len(modelos) - 3} más")


def main():
    parser = argparse.ArgumentParser(
        description="Importa modelos de autos desde JSON a la base de datos"
    )
    parser.add_argument(
        "--file",
        type=str,
        default=str(Path(__file__).parent / "data" / "qualitas_modelos_export.json"),
        help="Ruta al archivo JSON con los modelos"
    )
    parser.add_argument(
        "--preview",
        action="store_true",
        help="Solo muestra preview sin importar"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simula la importación sin insertar datos"
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Importa incluso si ya existen (puede crear duplicados)"
    )
    args = parser.parse_args()
    
    # Cargar archivo
    json_path = Path(args.file)
    if not json_path.exists():
        print(f"[Error] Archivo no encontrado: {json_path}")
        print("[Info] Ejecuta primero: python3 -m app.rpa.qualitas_modelos_extractor")
        return
    
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Preview
    if args.preview:
        preview_data(data)
        return
    
    # Importación
    print("=" * 60)
    print("IMPORTACIÓN DE MODELOS A BASE DE DATOS")
    print("=" * 60)
    
    if args.dry_run:
        print("\n[DRY RUN] Modo simulación - No se insertarán datos")
    
    stats = import_modelos(
        data,
        skip_existing=not args.force,
        dry_run=args.dry_run
    )
    
    # Resultados
    print("\n" + "=" * 60)
    print("RESULTADOS")
    print("=" * 60)
    print(f"Marcas creadas: {stats['marcas_creadas']}")
    print(f"Modelos creados: {stats['modelos_creados']}")
    print(f"Modelos omitidos (ya existían): {stats['modelos_omitidos']}")
    
    if stats['errores']:
        print(f"\nErrores: {len(stats['errores'])}")
        for error in stats['errores'][:5]:
            print(f"  - {error}")
        if len(stats['errores']) > 5:
            print(f"  ... y {len(stats['errores']) - 5} más")
    
    print("\n✓ Importación completada")


if __name__ == "__main__":
    main()
