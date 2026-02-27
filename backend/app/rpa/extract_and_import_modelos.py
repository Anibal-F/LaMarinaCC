#!/usr/bin/env python3
"""
Script standalone para extraer modelos de Qualitas e importarlos a RDS.

Este script está diseñado para ejecutarse directamente en el servidor EC2.
Extrae los modelos de las 34 páginas e inserta directamente en la base de datos.

Uso en EC2:
    cd ~/LaMarinaCC/backend
    python3 -m app.rpa.extract_and_import_modelos
    
    # Solo extraer (sin importar)
    python3 -m app.rpa.extract_and_import_modelos --extract-only
    
    # Importar desde archivo existente
    python3 -m app.rpa.extract_and_import_modelos --import-only --file modelos.json

Requisitos:
    - Credenciales de Qualitas configuradas en la base de datos o .envQualitas
    - Acceso a la base de datos RDS desde EC2
"""

import argparse
import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Set, Tuple

# Agregar backend al path
backend_dir = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(backend_dir))

from playwright.async_api import async_playwright
from playwright_stealth import Stealth

# Importar configuración de DB
from app.core.db import get_connection


# ============================================================================
# CONFIGURACIÓN
# ============================================================================

QUALITAS_LOGIN_URL = "https://proordersistem.com.mx/"
QUALITAS_MODELOS_URL = "https://proordersistem.com.mx/vehiculos-modelos"


# ============================================================================
# FUNCIONES DE LOGIN (simplificado)
# ============================================================================

async def do_login_qualitas(page, credentials: Dict) -> bool:
    """Hace login en Qualitas."""
    user = credentials.get("user", "")
    password = credentials.get("password", "")
    taller_id = credentials.get("taller_id", "")
    
    if not user or not password:
        print("[Error] Faltan credenciales de Qualitas")
        return False
    
    print("[Login] Navegando a página de login...")
    await page.goto(QUALITAS_LOGIN_URL, wait_until="domcontentloaded")
    await asyncio.sleep(2)
    
    print("[Login] Llenando credenciales...")
    await page.fill('input[placeholder="Email"]', user)
    await page.fill('input[placeholder="Password"]', password)
    await page.fill('input[placeholder="ID-Taller"]', taller_id)
    
    # Aceptar términos
    try:
        terms = page.locator('input[type="checkbox"][name="tyc"]').first
        if not await terms.is_checked():
            await terms.click()
    except:
        pass
    
    # Click en login
    print("[Login] Enviando formulario...")
    await page.click('input[type="submit"][value="Log In"]')
    await page.wait_for_load_state("networkidle", timeout=30000)
    
    # Verificar login exitoso
    if "dashboard" in page.url.lower() or "vehiculos" in page.url.lower():
        print("[Login] ✓ Sesión iniciada correctamente")
        return True
    
    print(f"[Login] ✗ Falló. URL actual: {page.url}")
    return False


# ============================================================================
# EXTRACCIÓN DE DATOS
# ============================================================================

async def extract_modelos_from_page(page) -> List[Dict[str, str]]:
    """Extrae modelos de la página actual."""
    modelos = []
    
    # Esperar tabla
    selectors = ['table tbody tr', '.table tbody tr', 'tbody tr']
    rows = []
    
    for selector in selectors:
        try:
            await page.wait_for_selector(selector, timeout=5000)
            rows = await page.locator(selector).all()
            if rows:
                break
        except:
            continue
    
    if not rows:
        print("  [Warning] No se encontraron filas en esta página")
        return []
    
    for row in rows:
        try:
            cells = await row.locator('td').all()
            if len(cells) >= 2:
                modelo = await cells[0].text_content()
                marca = await cells[1].text_content()
                
                modelo = modelo.strip() if modelo else ""
                marca = marca.strip() if marca else ""
                
                # Validar que no esté vacío y no sea encabezado
                if modelo and marca and len(modelo) > 1 and len(marca) > 1:
                    # Ignorar filas de encabezado
                    if modelo.upper() not in ['MODELO', 'NOMBRE'] and marca.upper() not in ['MARCA']:
                        modelos.append({'modelo': modelo, 'marca': marca})
        except:
            continue
    
    return modelos


async def get_next_page_button(page) -> bool:
    """Navega a la siguiente página si existe."""
    try:
        # Buscar botón "Siguiente" o "Next"
        next_selectors = [
            'a:has-text("Siguiente")',
            'a:has-text("Next")',
            '.pagination .next a',
            '[class*="pagination"] a[rel="next"]',
            'button:has-text("Siguiente")'
        ]
        
        for selector in next_selectors:
            next_btn = page.locator(selector).first
            if await next_btn.is_visible():
                # Verificar si está deshabilitado
                disabled = await next_btn.get_attribute('disabled')
                class_attr = await next_btn.get_attribute('class')
                
                if disabled or (class_attr and 'disabled' in class_attr):
                    return False
                
                await next_btn.click()
                await asyncio.sleep(2)  # Esperar carga
                return True
        
        return False
        
    except:
        return False


async def extract_all_modelos(headless: bool = True) -> List[Dict[str, str]]:
    """Extrae todos los modelos navegando por las páginas."""
    print("=" * 60)
    print("EXTRACCIÓN DE MODELOS - QUALITAS")
    print("=" * 60)
    
    # Cargar credenciales
    try:
        from app.rpa.credentials_helper import get_qualitas_credentials
        creds = get_qualitas_credentials()
        if creds:
            credentials = {
                "user": creds.get("usuario", ""),
                "password": creds.get("password", ""),
                "taller_id": creds.get("taller_id", "")
            }
        else:
            # Fallback a variables de entorno
            import os
            credentials = {
                "user": os.getenv("QUALITAS_USER", ""),
                "password": os.getenv("QUALITAS_PASSWORD", ""),
                "taller_id": os.getenv("QUALITAS_TALLER_ID", "")
            }
    except Exception as e:
        print(f"[Error] No se pudieron cargar credenciales: {e}")
        return []
    
    all_modelos = []
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=headless,
            args=["--no-sandbox", "--disable-blink-features=AutomationControlled"]
        )
        
        context = await browser.new_context(viewport={"width": 1920, "height": 1080})
        page = await context.new_page()
        
        # Stealth
        stealth = Stealth(navigator_languages_override=('es-MX', 'es'))
        await stealth.apply_stealth_async(page)
        
        try:
            # Login
            if not await do_login_qualitas(page, credentials):
                return []
            
            # Navegar a modelos
            print("\n[Navegación] Yendo a catálogo de modelos...")
            await page.goto(QUALITAS_MODELOS_URL, wait_until="networkidle")
            await asyncio.sleep(3)
            
            # Extraer página por página
            page_num = 1
            max_pages = 50  # Seguridad
            
            while page_num <= max_pages:
                print(f"\n[Página {page_num}] Extrayendo...")
                modelos = await extract_modelos_from_page(page)
                
                if not modelos:
                    print("  No se encontraron modelos en esta página")
                    # Intentar verificar si hay más páginas
                    has_next = await get_next_page_button(page)
                    if not has_next:
                        break
                    page_num += 1
                    continue
                
                all_modelos.extend(modelos)
                print(f"  ✓ {len(modelos)} modelos extraídos")
                print(f"  Ejemplos: {modelos[0]['modelo'][:30]} ({modelos[0]['marca']}), ...")
                
                # Verificar siguiente página
                has_next = await get_next_page_button(page)
                if not has_next:
                    print("\n[Info] No hay más páginas")
                    break
                
                page_num += 1
            
            print(f"\n[Extraction] Total: {len(all_modelos)} modelos en {page_num} páginas")
            return all_modelos
            
        finally:
            await context.close()
            await browser.close()


# ============================================================================
# IMPORTACIÓN A BASE DE DATOS
# ============================================================================

def import_modelos_to_db(modelos: List[Dict[str, str]], dry_run: bool = False) -> Dict:
    """Importa los modelos a la base de datos RDS."""
    stats = {
        "marcas_creadas": 0,
        "modelos_creados": 0,
        "modelos_omitidos": 0,
        "errores": []
    }
    
    print("\n" + "=" * 60)
    print("IMPORTACIÓN A BASE DE DATOS")
    print("=" * 60)
    
    if dry_run:
        print("[MODO SIMULACIÓN] No se insertarán datos\n")
    
    # Obtener datos existentes
    with get_connection() as conn:
        # Marcas existentes
        marcas_db = {}
        rows = conn.execute("SELECT id, UPPER(nb_marca) FROM marcas_autos").fetchall()
        marcas_db = {row[1]: row[0] for row in rows}
        
        # Modelos existentes
        modelos_db = set()
        rows = conn.execute("SELECT marca_id, UPPER(nb_modelo) FROM modelos_autos").fetchall()
        modelos_db = set(rows)
    
    print(f"[DB] Marcas existentes: {len(marcas_db)}")
    print(f"[DB] Modelos existentes: {len(modelos_db)}")
    
    # Agrupar por marca
    modelos_por_marca = {}
    for m in modelos:
        marca = m['marca'].upper()
        modelo = m['modelo']
        if marca not in modelos_por_marca:
            modelos_por_marca[marca] = set()
        modelos_por_marca[marca].add(modelo)
    
    print(f"\n[Importación] Procesando {len(modelos_por_marca)} marcas únicas...")
    
    for marca_nombre, modelos_set in modelos_por_marca.items():
        # Verificar/crear marca
        if marca_nombre in marcas_db:
            marca_id = marcas_db[marca_nombre]
        else:
            if dry_run:
                marca_id = -1
                stats["marcas_creadas"] += 1
                print(f"  [Marca] {marca_nombre} - SE CREARÍA")
            else:
                try:
                    with get_connection() as conn:
                        # Asegurar grupo existe
                        conn.execute(
                            """INSERT INTO grupos_autos (nb_grupo) VALUES ('GENERAL')
                            ON CONFLICT (LOWER(nb_grupo)) DO NOTHING"""
                        )
                        
                        row = conn.execute(
                            """INSERT INTO marcas_autos (gpo_marca, nb_marca)
                            VALUES ('GENERAL', %s) RETURNING id""",
                            (marca_nombre.title(),)
                        ).fetchone()
                        conn.commit()
                        marca_id = row[0]
                        marcas_db[marca_nombre] = marca_id
                        stats["marcas_creadas"] += 1
                        print(f"  [Marca] {marca_nombre} (ID: {marca_id}) - CREADA")
                except Exception as e:
                    stats["errores"].append(f"Marca {marca_nombre}: {e}")
                    continue
        
        # Procesar modelos
        for modelo_nombre in modelos_set:
            modelo_key = (marca_id, modelo_nombre.upper())
            
            if modelo_key in modelos_db:
                stats["modelos_omitidos"] += 1
                continue
            
            if dry_run:
                stats["modelos_creados"] += 1
            else:
                try:
                    with get_connection() as conn:
                        conn.execute(
                            """INSERT INTO modelos_autos (marca_id, nb_modelo)
                            VALUES (%s, %s)""",
                            (marca_id, modelo_nombre)
                        )
                        conn.commit()
                        modelos_db.add(modelo_key)
                        stats["modelos_creados"] += 1
                except Exception as e:
                    stats["errores"].append(f"Modelo {modelo_nombre}: {e}")
    
    return stats


# ============================================================================
# MAIN
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Extrae modelos de Qualitas e importa a RDS"
    )
    parser.add_argument(
        "--extract-only",
        action="store_true",
        help="Solo extrae, no importa a DB"
    )
    parser.add_argument(
        "--import-only",
        action="store_true",
        help="Solo importa desde archivo, no extrae"
    )
    parser.add_argument(
        "--file",
        type=str,
        default="app/rpa/data/qualitas_modelos_export.json",
        help="Archivo JSON para guardar/cargar"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simula sin insertar datos"
    )
    parser.add_argument(
        "--no-headless",
        action="store_true",
        help="Muestra el navegador"
    )
    args = parser.parse_args()
    
    modelos = []
    
    # Extraer
    if not args.import_only:
        modelos = asyncio.run(extract_all_modelos(headless=not args.no_headless))
        
        if not modelos:
            print("[Error] No se extrajeron modelos")
            return
        
        # Guardar a JSON
        output_path = Path(args.file)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump({
                'fecha_extraccion': datetime.now().isoformat(),
                'total': len(modelos),
                'modelos': modelos
            }, f, indent=2, ensure_ascii=False)
        
        print(f"\n[Guardado] {len(modelos)} modelos guardados en: {output_path}")
        
        if args.extract_only:
            return
    
    # Importar
    if args.import_only:
        json_path = Path(args.file)
        if not json_path.exists():
            print(f"[Error] Archivo no encontrado: {json_path}")
            return
        
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            modelos = data.get('modelos', [])
        
        print(f"[Cargado] {len(modelos)} modelos desde archivo")
    
    # Importar a DB
    if modelos:
        stats = import_modelos_to_db(modelos, dry_run=args.dry_run)
        
        print("\n" + "=" * 60)
        print("RESULTADOS")
        print("=" * 60)
        print(f"Marcas creadas: {stats['marcas_creadas']}")
        print(f"Modelos creados: {stats['modelos_creados']}")
        print(f"Modelos omitidos (duplicados): {stats['modelos_omitidos']}")
        
        if stats['errores']:
            print(f"\nErrores ({len(stats['errores'])}):")
            for err in stats['errores'][:5]:
                print(f"  - {err}")
        
        print("\n✓ Proceso completado")


if __name__ == "__main__":
    main()
