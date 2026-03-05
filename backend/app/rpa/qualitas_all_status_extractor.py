"""
Extractor de órdenes de TODOS los estatus de Qualitas.

Este módulo navega por cada tab de estatus (Asignados, Citados, Tránsito, Piso, 
Terminadas, Entregadas, etc.) y extrae todas las órdenes de cada uno.
"""

import asyncio
import re
from datetime import datetime
from typing import List, Dict, Optional
from playwright.async_api import Page

from app.rpa.qualitas_ordenes_extractor import (
    click_next_page_ordenes,
    parse_fecha
)
from app.rpa.qualitas_ordenes_extractor_v2 import (
    extract_ordenes_from_table
)


def get_table_id_from_status(status_name: str) -> str:
    """
    Obtiene el ID de la tabla correspondiente a un estatus.
    
    Args:
        status_name: Nombre del estatus
        
    Returns:
        ID de la tabla HTML
    """
    status_to_table = {
        'asignados': 'tableasig',
        'asignado por app': 'tablependientes',  # O puede ser otra tabla
        'asignadoporapp': 'tablependientes',
        'citados': 'tablecitados',
        'transito': 'tabletransito',
        'tránsito': 'tabletransito',
        'piso': 'tablepiso',
        'terminadas': 'tableterminadas',
        'entregadas': 'tableentregadas',
        'facturadas': 'tablefacturadas',
        'pérdida total y pago de daños': 'tableperdidadapago',
        'perdida total y pago de danos': 'tableperdidadapago',
        'historico': 'tablehistorico',
        'histórico': 'tablehistorico',
        'historico facturados': 'tablehistoricofacturados',
        'histórico facturados': 'tablehistoricofacturados',
    }
    
    # Normalizar el nombre del estatus
    status_key = status_name.lower().strip()
    
    # Buscar coincidencia exacta primero
    if status_key in status_to_table:
        return status_to_table[status_key]
    
    # Buscar coincidencia parcial
    for key, table_id in status_to_table.items():
        if key in status_key or status_key in key:
            return table_id
    
    # Si no hay coincidencia, generar un ID genérico
    return f"table{status_key.replace(' ', '')}"


async def extract_ordenes_from_status_tab(
    page: Page, 
    status_name: str,
    max_pages: int = 100
) -> List[Dict]:
    """
    Extrae órdenes de un tab de estatus específico.
    
    Args:
        page: Página de Playwright
        status_name: Nombre del estatus (ej: "Asignados", "Citados")
        max_pages: Máximo de páginas a recorrer
        
    Returns:
        Lista de órdenes con el campo 'estatus' poblado
    """
    ordenes = []
    page_num = 1
    
    print(f"\n[StatusExtractor] Extrayendo órdenes de: {status_name}")
    
    # Obtener el ID de la tabla para este estatus
    table_id = get_table_id_from_status(status_name)
    print(f"[StatusExtractor] Usando tabla ID: {table_id}")
    
    try:
        # Esperar a que la tabla cargue
        try:
            await page.wait_for_selector(f'#{table_id}, table[id="{table_id}"]', timeout=5000)
        except:
            print(f"  [Warning] No se encontró tabla específica #{table_id}, buscando cualquier tabla...")
        
        await asyncio.sleep(1)  # Pequeña espera para estabilidad
        
        while page_num <= max_pages:
            print(f"[StatusExtractor] {status_name} - Página {page_num}")
            
            # Extraer órdenes de la página actual, usando el nuevo extractor
            ordenes_pagina = await extract_ordenes_from_table(page, table_id, status_name)
            
            if ordenes_pagina:
                # Agregar el estatus a cada orden
                for orden in ordenes_pagina:
                    orden['estatus'] = status_name
                    orden['fecha_extraccion'] = datetime.now().isoformat()
                
                ordenes.extend(ordenes_pagina)
                print(f"  ✓ {len(ordenes_pagina)} órdenes extraídas")
            
            # Intentar ir a la siguiente página
            has_next = await click_next_page_ordenes(page, table_id)
            if not has_next:
                print(f"[StatusExtractor] {status_name} - No hay más páginas")
                break
            
            page_num += 1
        
        print(f"[StatusExtractor] {status_name} - Total: {len(ordenes)} órdenes en {page_num} páginas")
        
    except Exception as e:
        print(f"[StatusExtractor] Error extrayendo {status_name}: {e}")
        import traceback
        print(f"[StatusExtractor] Traceback: {traceback.format_exc()}")
    
    return ordenes


async def click_status_tab(page: Page, status_name: str) -> bool:
    """
    Hace clic en el tab de navegación correspondiente a un estatus.
    
    Args:
        page: Página de Playwright
        status_name: Nombre del estatus a buscar
        
    Returns:
        True si se encontró y clickeó el tab
    """
    try:
        print(f"[TabNavigator] Buscando tab para: '{status_name}'")
        
        # Estrategia 1: Buscar por href que contenga el nombre del estatus (sin espacios, minúsculas)
        status_id = status_name.lower().replace(' ', '').replace('á', 'a').replace('é', 'e').replace('í', 'i').replace('ó', 'o').replace('ú', 'u')
        
        href_selectors = [
            f'a[href="#{status_id}"]',
            f'a[href*="{status_id}"]',
            f'a[href="#tab{status_id}"]',
            f'a[href="#table{status_id}"]',
        ]
        
        for selector in href_selectors:
            try:
                tab = page.locator(selector).first
                count = await tab.count()
                if count > 0:
                    is_visible = await tab.is_visible()
                    if is_visible:
                        await tab.click()
                        print(f"[TabNavigator] ✓ Click en tab '{status_name}' (selector: {selector})")
                        await asyncio.sleep(2)
                        return True
            except Exception as e:
                print(f"[TabNavigator] Selector {selector} falló: {e}")
                continue
        
        # Estrategia 2: Buscar en todos los enlaces con data-toggle="tab"
        try:
            all_tabs = await page.locator('a[data-toggle="tab"], .nav-tabs a, .nav-item a').all()
            print(f"[TabNavigator] Encontrados {len(all_tabs)} tabs totales")
            
            for tab in all_tabs:
                try:
                    text = await tab.text_content()
                    href = await tab.get_attribute('href') or ''
                    
                    if text:
                        text_clean = text.strip().lower()
                        status_clean = status_name.lower()
                        
                        # Comparar si el nombre del estatus está en el texto del tab
                        if status_clean in text_clean or text_clean in status_clean:
                            print(f"[TabNavigator] Match encontrado: texto='{text}', href='{href}'")
                            await tab.click()
                            print(f"[TabNavigator] ✓ Click en tab '{status_name}' (búsqueda alternativa)")
                            await asyncio.sleep(2)
                            return True
                except Exception as e:
                    continue
        except Exception as e:
            print(f"[TabNavigator] Error en búsqueda alternativa: {e}")
        
        # Estrategia 3: Buscar por onclick que contenga cargarDataTable
        try:
            onclick_tabs = await page.locator('a[onclick*="cargarDataTable"]').all()
            for tab in onclick_tabs:
                try:
                    text = await tab.text_content()
                    onclick = await tab.get_attribute('onclick') or ''
                    
                    if text and status_name.lower() in text.lower():
                        print(f"[TabNavigator] Match en onclick: texto='{text}'")
                        await tab.click()
                        print(f"[TabNavigator] ✓ Click en tab '{status_name}' (onclick)")
                        await asyncio.sleep(2)
                        return True
                except:
                    continue
        except:
            pass
        
        print(f"[TabNavigator] ✗ No se encontró tab para '{status_name}'")
        return False
        
    except Exception as e:
        print(f"[TabNavigator] Error navegando a tab '{status_name}': {e}")
        return False


async def _get_available_status_tabs(page: Page) -> List[str]:
    """
    Obtiene la lista de tabs de estatus disponibles en la página.
    
    Returns:
        Lista de nombres de estatus
    """
    tabs = []
    
    try:
        # Estrategia 1: Buscar todos los elementos con data-toggle="tab"
        tab_elements = await page.locator('a[data-toggle="tab"]').all()
        print(f"[GetTabs] Encontrados {len(tab_elements)} elementos con data-toggle='tab'")
        
        for tab in tab_elements:
            try:
                text = await tab.text_content()
                href = await tab.get_attribute('href') or ''
                onclick = await tab.get_attribute('onclick') or ''
                
                if text:
                    text_clean = text.strip()
                    # Extraer solo el nombre, sin el número entre paréntesis
                    # Ej: "Asignados(126)" -> "Asignados"
                    match = re.match(r'([^\(]+)', text_clean)
                    if match:
                        nombre = match.group(1).strip()
                        if nombre and nombre not in tabs:
                            tabs.append(nombre)
                            print(f"[GetTabs] Tab encontrado: '{nombre}' (href={href}, onclick={onclick[:50]}...)")
            except Exception as e:
                print(f"[GetTabs] Error procesando tab: {e}")
                continue
        
        # Estrategia 2: Si no encontramos tabs, buscar en .nav-link
        if not tabs:
            print("[GetTabs] Buscando con selector .nav-link...")
            nav_links = await page.locator('.nav-link, .nav-item a').all()
            for tab in nav_links:
                try:
                    text = await tab.text_content()
                    if text:
                        text_clean = text.strip()
                        match = re.match(r'([^\(]+)', text_clean)
                        if match:
                            nombre = match.group(1).strip()
                            if nombre and nombre not in tabs and len(nombre) > 2:
                                tabs.append(nombre)
                                print(f"[GetTabs] Tab encontrado (.nav-link): '{nombre}'")
                except:
                    continue
        
    except Exception as e:
        print(f"[GetTabs] Error obteniendo tabs: {e}")
    
    # Si no encontramos tabs, usar lista por defecto basada en la imagen
    if not tabs:
        print("[GetTabs] ⚠ No se encontraron tabs dinámicos, usando lista por defecto")
        tabs = [
            "Asignados",
            "Asignado por App",
            "Citados", 
            "Tránsito",
            "Piso",
            "Terminadas",
            "Entregadas",
            "Facturadas",
            "Pérdida Total y Pago De Daños",
            "Histórico",
            "Histórico Facturados"
        ]
    
    return tabs


async def extract_all_ordenes_all_status(page: Page) -> Dict[str, List[Dict]]:
    """
    Extrae órdenes de TODOS los estatus disponibles.
    
    Args:
        page: Página de Playwright ya logueada y en el dashboard
        
    Returns:
        Dict con key=nombre_estatus y value=lista_de_ordenes
    """
    result = {}
    
    print("\n" + "=" * 60)
    print("EXTRACCIÓN COMPLETA DE TODOS LOS ESTATUS")
    print("=" * 60)
    
    # Navegar a la página de órdenes/bandeja
    print("[AllStatus] Navegando a BandejaQualitas...")
    await page.goto("https://proordersistem.com.mx/BandejaQualitas", wait_until="networkidle")
    await asyncio.sleep(3)
    
    # Debug: Guardar HTML para análisis
    try:
        html = await page.content()
        print(f"[AllStatus] HTML de la página cargada ({len(html)} caracteres)")
        # Buscar patrones de tabs en el HTML
        import re
        tab_patterns = re.findall(r'<a[^>]*data-toggle=["\']tab["\'][^>]*>([^<]+)</a>', html)
        print(f"[AllStatus] Tabs encontrados en HTML: {tab_patterns}")
    except Exception as e:
        print(f"[AllStatus] Error analizando HTML: {e}")
    
    # Obtener lista de tabs disponibles
    tabs_disponibles = await _get_available_status_tabs(page)
    print(f"\n[TabsDisponibles] {len(tabs_disponibles)} estatus encontrados:")
    for tab in tabs_disponibles:
        print(f"  • {tab}")
    
    # Extraer órdenes de cada tab
    for status_name in tabs_disponibles:
        print(f"\n{'='*40}")
        print(f"Procesando: {status_name}")
        print(f"{'='*40}")
        
        # Hacer clic en el tab
        clicked = await click_status_tab(page, status_name)
        
        if clicked:
            # Extraer órdenes de este estatus
            ordenes = await extract_ordenes_from_status_tab(page, status_name)
            if ordenes:
                result[status_name] = ordenes
                print(f"  ✓ {len(ordenes)} órdenes de '{status_name}'")
            else:
                print(f"  ⚠ No se encontraron órdenes en '{status_name}'")
        else:
            print(f"  ✗ No se pudo acceder a '{status_name}'")
        
        await asyncio.sleep(1)
    
    print("\n" + "=" * 60)
    total_ordenes = sum(len(ordenes) for ordenes in result.values())
    print(f"EXTRACCIÓN COMPLETADA - Total: {total_ordenes} órdenes")
    print("=" * 60)
    
    return result


def flatten_ordenes_by_status(ordenes_by_status: Dict[str, List[Dict]]) -> List[Dict]:
    """
    Convierte el dict de órdenes por estatus en una lista plana.
    
    Args:
        ordenes_by_status: Dict con key=estatus, value=lista_de_ordenes
        
    Returns:
        Lista plana de todas las órdenes
    """
    all_ordenes = []
    for status_name, ordenes in ordenes_by_status.items():
        for orden in ordenes:
            orden['estatus_origen'] = status_name
        all_ordenes.extend(ordenes)
    return all_ordenes


async def save_all_ordenes_to_db(ordenes_by_status: Dict[str, List[Dict]]) -> int:
    """
    Guarda todas las órdenes de todos los estatus en la base de datos.
    
    Args:
        ordenes_by_status: Dict con key=estatus, value=lista_de_ordenes
        
    Returns:
        Número total de órdenes insertadas
    """
    from pathlib import Path
    
    fecha_extraccion = datetime.now()
    total_inserted = 0
    
    # Aplanar todas las órdenes
    all_ordenes = flatten_ordenes_by_status(ordenes_by_status)
    
    if not all_ordenes:
        print("[SaveAll] No hay órdenes para guardar")
        return 0
    
    # Guardar en JSON primero
    output_path = Path(__file__).parent / "data" / f"qualitas_all_ordenes_{fecha_extraccion.strftime('%Y%m%d_%H%M%S')}.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    import json
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump({
            'fecha_extraccion': fecha_extraccion.isoformat(),
            'total_ordenes': len(all_ordenes),
            'ordenes_por_estatus': {k: len(v) for k, v in ordenes_by_status.items()},
            'ordenes': all_ordenes
        }, f, indent=2, ensure_ascii=False)
    
    print(f"[SaveAll] ✓ {len(all_ordenes)} órdenes guardadas en: {output_path}")
    
    # Intentar guardar en BD
    errores = []
    duplicados = 0
    
    try:
        from app.core.db import get_connection
        
        print(f"[SaveAll] Intentando guardar {len(all_ordenes)} órdenes en BD...")
        
        with get_connection() as conn:
            for i, orden in enumerate(all_ordenes):
                try:
                    # Validar datos mínimos
                    num_exp = orden.get('num_expediente')
                    if not num_exp or len(str(num_exp).strip()) < 3:
                        print(f"  [Warning] Orden {i}: num_expediente inválido '{num_exp}', saltando...")
                        continue
                    
                    result = conn.execute("""
                        INSERT INTO qualitas_ordenes_asignadas 
                        (num_expediente, fecha_asignacion, poliza, siniestro, reporte, 
                         riesgo, vehiculo, anio, placas, estatus, fecha_extraccion)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (num_expediente, fecha_extraccion) DO NOTHING
                        RETURNING id
                    """, (
                        str(num_exp).strip()[:50],
                        orden.get('fecha_asignacion'),
                        str(orden.get('poliza', ''))[:100],
                        str(orden.get('siniestro', ''))[:100],
                        str(orden.get('reporte', ''))[:100],
                        str(orden.get('riesgo', ''))[:50],
                        str(orden.get('vehiculo', ''))[:500],
                        orden.get('anio'),
                        str(orden.get('placas', ''))[:20],
                        str(orden.get('estatus', 'Desconocido'))[:50],
                        fecha_extraccion
                    ))
                    
                    if result.rowcount > 0:
                        total_inserted += 1
                    else:
                        duplicados += 1
                        
                except Exception as e:
                    errores.append(f"Orden {i} ({num_exp}): {str(e)[:100]}")
                    if len(errores) <= 5:  # Mostrar solo los primeros 5 errores
                        print(f"  [Error BD] Orden {i}: {e}")
            
            conn.commit()
            print(f"[SaveAll] ✓ {total_inserted} órdenes insertadas")
            if duplicados > 0:
                print(f"[SaveAll] ⚠ {duplicados} órdenes duplicadas (omitidas)")
            if errores:
                print(f"[SaveAll] ✗ {len(errores)} errores totales")
                
    except Exception as e:
        print(f"[SaveAll] ✗ Error general guardando en BD: {e}")
        import traceback
        print(f"[SaveAll] Traceback: {traceback.format_exc()}")
    
    return total_inserted
