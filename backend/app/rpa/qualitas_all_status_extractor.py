"""
Extractor de órdenes de TODOS los estatus de Qualitas.

Este módulo navega por cada tab de estatus (Asignados, Citados, Tránsito, Piso, 
Terminadas, Entregadas, etc.) y extrae todas las órdenes de cada uno.
"""

import asyncio
from datetime import datetime
from typing import List, Dict, Optional
from playwright.async_api import Page

from app.rpa.qualitas_ordenes_extractor import (
    extract_ordenes_from_page, 
    click_next_page_ordenes,
    parse_fecha
)


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
    
    try:
        # Esperar a que la tabla cargue
        await page.wait_for_selector('#tableasig, table[id*="asig"]', timeout=10000)
        await asyncio.sleep(1)  # Pequeña espera para estabilidad
        
        while page_num <= max_pages:
            print(f"[StatusExtractor] {status_name} - Página {page_num}")
            
            # Extraer órdenes de la página actual
            ordenes_pagina = await extract_ordenes_from_page(page)
            
            if ordenes_pagina:
                # Agregar el estatus a cada orden
                for orden in ordenes_pagina:
                    orden['estatus'] = status_name
                    orden['fecha_extraccion'] = datetime.now().isoformat()
                
                ordenes.extend(ordenes_pagina)
                print(f"  ✓ {len(ordenes_pagina)} órdenes extraídas")
            
            # Intentar ir a la siguiente página
            has_next = await click_next_page_ordenes(page)
            if not has_next:
                print(f"[StatusExtractor] {status_name} - No hay más páginas")
                break
            
            page_num += 1
        
        print(f"[StatusExtractor] {status_name} - Total: {len(ordenes)} órdenes en {page_num} páginas")
        
    except Exception as e:
        print(f"[StatusExtractor] Error extrayendo {status_name}: {e}")
    
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
        # Los tabs suelen tener la forma: <a href="#asignados">Asignados(126)</a>
        # Buscar por el texto o data-toggle="tab"
        
        # Primero intentar encontrar el enlace exacto por texto
        tab_selectors = [
            f'a:has-text("{status_name}")',
            f'a[data-toggle="tab"]:has-text("{status_name}")',
            f'li.nav-item a:has-text("{status_name}")',
        ]
        
        for selector in tab_selectors:
            try:
                tab = page.locator(selector).first
                if await tab.count() > 0 and await tab.is_visible():
                    await tab.click()
                    print(f"[TabNavigator] Click en tab '{status_name}'")
                    await asyncio.sleep(2)  # Esperar carga de la tabla
                    return True
            except:
                continue
        
        # Si no funciona, buscar en todos los nav-link
        all_tabs = await page.locator('a[data-toggle="tab"]').all()
        for tab in all_tabs:
            try:
                text = await tab.text_content()
                if text and status_name.lower() in text.lower():
                    await tab.click()
                    print(f"[TabNavigator] Click en tab '{status_name}' (búsqueda alternativa)")
                    await asyncio.sleep(2)
                    return True
            except:
                continue
        
        print(f"[TabNavigator] No se encontró tab para '{status_name}'")
        return False
        
    except Exception as e:
        print(f"[TabNavigator] Error navegando a tab '{status_name}': {e}")
        return False


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
    await page.goto("https://proordersistem.com.mx/BandejaQualitas", wait_until="networkidle")
    await asyncio.sleep(3)
    
    # Obtener lista de tabs disponibles
    tabs_disponibles = await _get_available_status_tabs(page)
    print(f"\n[TabsDisponibles] {len(tabs_disponibles)} estatus encontrados:")
    for tab in tabs_disponibles:
        print(f"  • {tab}")
    
    # Extraer órdenes de cada tab
    for status_name in tabs_disponibles:
        # Hacer clic en el tab
        clicked = await click_status_tab(page, status_name)
        
        if clicked:
            # Extraer órdenes de este estatus
            ordenes = await extract_ordenes_from_status_tab(page, status_name)
            if ordenes:
                result[status_name] = ordenes
                print(f"  ✓ {len(ordenes)} órdenes de '{status_name}'")
        else:
            print(f"  ✗ No se pudo acceder a '{status_name}'")
        
        await asyncio.sleep(1)
    
    print("\n" + "=" * 60)
    total_ordenes = sum(len(ordenes) for ordenes in result.values())
    print(f"EXTRACCIÓN COMPLETADA - Total: {total_ordenes} órdenes")
    print("=" * 60)
    
    return result


async def _get_available_status_tabs(page: Page) -> List[str]:
    """
    Obtiene la lista de tabs de estatus disponibles en la página.
    
    Returns:
        Lista de nombres de estatus
    """
    tabs = []
    
    try:
        # Buscar todos los elementos con data-toggle="tab"
        tab_elements = await page.locator('a[data-toggle="tab"]').all()
        
        for tab in tab_elements:
            try:
                text = await tab.text_content()
                if text:
                    # Limpiar el texto (quitar números entre paréntesis)
                    # Ej: "Asignados(126)" -> "Asignados"
                    text_clean = text.strip()
                    # Extraer solo el nombre, sin el número
                    import re
                    match = re.match(r'([^\(]+)', text_clean)
                    if match:
                        nombre = match.group(1).strip()
                        if nombre:
                            tabs.append(nombre)
            except:
                continue
        
    except Exception as e:
        print(f"[GetTabs] Error obteniendo tabs: {e}")
    
    # Si no encontramos tabs, usar lista por defecto
    if not tabs:
        print("[GetTabs] Usando lista de estatus por defecto")
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
    try:
        from app.core.db import get_connection
        
        with get_connection() as conn:
            for orden in all_ordenes:
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
                    total_inserted += 1
                except Exception as e:
                    # Silenciar errores individuales
                    pass
            
            conn.commit()
            print(f"[SaveAll] ✓ {total_inserted} órdenes guardadas en base de datos")
            
    except Exception as e:
        print(f"[SaveAll] Nota: No se pudieron guardar en BD: {e}")
    
    return total_inserted
