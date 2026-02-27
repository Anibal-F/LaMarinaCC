"""
Extractor de modelos de autos desde el portal de Qualitas.

Este script extrae los modelos de las 34 páginas del catálogo
y los guarda en un archivo JSON para posterior importación.

Uso:
    python3 -m app.rpa.qualitas_modelos_extractor
    
El script genera: backend/app/rpa/data/qualitas_modelos_export.json
"""

import argparse
import asyncio
import json
from pathlib import Path
from typing import List, Dict, Any

from playwright.async_api import async_playwright
from playwright_stealth import Stealth

# Reutilizar funciones de login del workflow principal
from app.rpa.qualitas_full_workflow import do_login, load_credentials
from app.rpa.credentials_helper import setup_qualitas_env


async def extract_modelos_from_page(page) -> List[Dict[str, str]]:
    """
    Extrae los modelos de la página actual.
    Intenta múltiples estrategias para encontrar la tabla.
    
    Returns:
        Lista de dicts con {'modelo': str, 'marca': str}
    """
    modelos = []
    
    # Múltiples selectores posibles para la tabla
    table_selectors = [
        'table tbody tr',
        'table.dataTable tbody tr',
        'table.kt-table tbody tr',
        '.table tbody tr',
        '[class*="table"] tbody tr'
    ]
    
    rows = []
    used_selector = None
    
    for selector in table_selectors:
        try:
            await page.wait_for_selector(selector, timeout=5000)
            rows = await page.locator(selector).all()
            if rows:
                used_selector = selector
                print(f"  [Debug] Usando selector: {selector} ({len(rows)} filas)")
                break
        except:
            continue
    
    if not rows:
        print("[Extractor] No se encontró tabla en la página")
        # Debug: guardar HTML para análisis
        html = await page.content()
        debug_path = Path(__file__).parent / "data" / "debug_page.html"
        debug_path.parent.mkdir(parents=True, exist_ok=True)
        with open(debug_path, 'w', encoding='utf-8') as f:
            f.write(html)
        print(f"  [Debug] HTML guardado en: {debug_path}")
        return []
    
    for i, row in enumerate(rows):
        try:
            # Extraer celdas
            cells = await row.locator('td').all()
            
            if len(cells) >= 2:
                # Intentar detectar qué columnas son modelo y marca
                cell_texts = []
                for cell in cells:
                    text = await cell.text_content()
                    cell_texts.append(text.strip() if text else "")
                
                # Heurística: La primera celda suele ser el modelo, la segunda la marca
                # Pero si la segunda está vacía o parece un botón, ajustar
                modelo = cell_texts[0] if len(cell_texts) > 0 else ""
                marca = cell_texts[1] if len(cell_texts) > 1 else ""
                
                # Si la marca está vacía o parece un icono/botón, buscar en otras columnas
                if not marca or marca in ['', '...', '⋮', '⋮⋮', '⋮⋮⋮']:
                    # Buscar la primera celda con texto que parezca marca (mayúsculas o nombre conocido)
                    for text in cell_texts[2:]:
                        if text and len(text) > 1 and text not in ['...', '⋮']:
                            marca = text
                            break
                
                # Limpiar y validar
                modelo = modelo.strip()
                marca = marca.strip()
                
                if modelo and marca and len(modelo) > 1 and len(marca) > 1:
                    modelos.append({
                        'modelo': modelo,
                        'marca': marca
                    })
                    
        except Exception as e:
            print(f"[Extractor] Error procesando fila {i}: {e}")
            continue
    
    return modelos


async def get_total_pages(page) -> int:
    """Obtiene el número total de páginas del paginador."""
    try:
        # Buscar el paginador - ajustar selector según la estructura real
        # Comúnmente es: .pagination, .page-link, o números de página
        pagination_links = await page.locator('.pagination .page-item, .pagination .page-link, [class*="page"]').all()
        
        max_page = 1
        for link in pagination_links:
            text = await link.text_content()
            if text and text.strip().isdigit():
                max_page = max(max_page, int(text.strip()))
        
        return max_page
    except Exception as e:
        print(f"[Extractor] Error obteniendo total de páginas: {e}")
        return 1


async def navigate_to_page(page, page_number: int):
    """Navega a una página específica del listado."""
    try:
        # Intentar diferentes estrategias de paginación
        
        # Estrategia 1: Click en número de página
        page_link = page.locator(f'.pagination a:has-text("{page_number}"), .page-link:has-text("{page_number}")').first
        if await page_link.is_visible():
            await page_link.click()
            await asyncio.sleep(1.5)  # Esperar carga
            return True
        
        # Estrategia 2: Input de página (algunos sistemas tienen input)
        page_input = page.locator('input[type="number"][name*="page"], .pagination input').first
        if await page_input.is_visible():
            await page_input.fill(str(page_number))
            await page_input.press('Enter')
            await asyncio.sleep(1.5)
            return True
        
        # Estrategia 3: Modificar URL si tiene parámetro page
        current_url = page.url
        if '?' in current_url:
            new_url = current_url.replace(/([?&])page=\d*/, f'\\1page={page_number}')
            if new_url == current_url:  # No tenía page
                new_url = f"{current_url}&page={page_number}"
        else:
            new_url = f"{current_url}?page={page_number}"
        
        await page.goto(new_url, wait_until="networkidle")
        await asyncio.sleep(1.5)
        return True
        
    except Exception as e:
        print(f"[Extractor] Error navegando a página {page_number}: {e}")
        return False


async def extract_all_modelos(headless: bool = True, use_db: bool = True) -> List[Dict[str, str]]:
    """
    Extrae todos los modelos de las 34 páginas.
    
    Returns:
        Lista completa de modelos con marca
    """
    print("=" * 60)
    print("EXTRACTOR DE MODELOS - QUALITAS")
    print("=" * 60)
    
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
            print("\n[1/3] Iniciando sesión...")
            success = await do_login(page, use_db=use_db)
            if not success:
                raise RuntimeError("Login fallido")
            print("[Login] ✓ Sesión iniciada")
            
            # Navegar a la página de modelos
            print("\n[2/3] Navegando al catálogo de modelos...")
            base_url = "https://proordersistem.com.mx"
            await page.goto(f"{base_url}/vehiculos-modelos", wait_until="networkidle")
            await asyncio.sleep(2)
            
            # Verificar que estamos en la página correcta
            if "modelos" not in page.url.lower():
                print(f"[Warning] URL inesperada: {page.url}")
                print("[Info] Intentando navegar directamente...")
                # Intentar encontrar link en el menú
                try:
                    menu_link = page.locator('a:has-text("Ver Modelos"), a[href*="modelos"]').first
                    if await menu_link.is_visible():
                        await menu_link.click()
                        await page.wait_for_load_state("networkidle")
                        await asyncio.sleep(2)
                except:
                    pass
            
            print(f"[Navegación] URL actual: {page.url}")
            
            # Obtener total de páginas
            print("\n[3/3] Extrayendo datos...")
            total_pages = await get_total_pages(page)
            print(f"[Info] Total de páginas detectadas: {total_pages}")
            
            # Extraer de cada página
            for page_num in range(1, total_pages + 1):
                print(f"[Página {page_num}/{total_pages}] Extrayendo...")
                
                if page_num > 1:
                    success = await navigate_to_page(page, page_num)
                    if not success:
                        print(f"[Warning] No se pudo navegar a página {page_num}, saltando...")
                        continue
                
                modelos = await extract_modelos_from_page(page)
                all_modelos.extend(modelos)
                print(f"  ✓ {len(modelos)} modelos extraídos")
            
            print(f"\n[Extraction] Total de modelos: {len(all_modelos)}")
            
            # Mostrar algunos ejemplos
            print("\n[Ejemplos de datos extraídos]:")
            for m in all_modelos[:5]:
                print(f"  - {m['modelo']} ({m['marca']})")
            if len(all_modelos) > 5:
                print(f"  ... y {len(all_modelos) - 5} más")
            
            return all_modelos
            
        finally:
            await context.close()
            await browser.close()


def save_modelos_to_json(modelos: List[Dict[str, str]], filepath: Path = None):
    """Guarda los modelos extraídos en un archivo JSON."""
    if filepath is None:
        timestamp = Path(__file__).parent / "data" / "qualitas_modelos_export.json"
        filepath = timestamp
    
    filepath.parent.mkdir(parents=True, exist_ok=True)
    
    # Agrupar por marca para facilitar importación
    marcas_dict = {}
    for m in modelos:
        marca = m['marca']
        modelo = m['modelo']
        if marca not in marcas_dict:
            marcas_dict[marca] = []
        marcas_dict[marca].append(modelo)
    
    data = {
        'total_modelos': len(modelos),
        'total_marcas': len(marcas_dict),
        'marcas_unicas': sorted(marcas_dict.keys()),
        'modelos_por_marca': {k: sorted(v) for k, v in sorted(marcas_dict.items())},
        'raw_data': modelos  # Datos originales
    }
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    print(f"\n[Guardado] Datos guardados en: {filepath}")
    return filepath


def main():
    parser = argparse.ArgumentParser(description="Extractor de modelos de Qualitas")
    parser.add_argument("--headless", action="store_true", default=True, help="Modo headless")
    parser.add_argument("--no-headless", action="store_true", dest="headless", help="Mostrar navegador")
    parser.add_argument("--use-db", action="store_true", default=True, help="Usar credenciales de DB")
    parser.add_argument("--output", type=str, help="Ruta de salida del JSON")
    args = parser.parse_args()
    
    # Cargar credenciales
    if not load_credentials(use_db=args.use_db):
        print("[Error] No se pudieron cargar credenciales")
        return
    
    # Extraer
    modelos = asyncio.run(extract_all_modelos(
        headless=args.headless,
        use_db=args.use_db
    ))
    
    # Guardar
    output_path = Path(args.output) if args.output else None
    save_modelos_to_json(modelos, output_path)
    
    print("\n" + "=" * 60)
    print("EXTRACCIÓN COMPLETADA")
    print("=" * 60)


if __name__ == "__main__":
    main()
