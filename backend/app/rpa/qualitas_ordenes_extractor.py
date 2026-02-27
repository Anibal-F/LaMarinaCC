"""
Extractor de órdenes asignadas desde Qualitas.

Este módulo extrae la tabla de órdenes asignadas de Qualitas,
navegando por todas las páginas disponibles.
"""

import asyncio
from datetime import datetime
from typing import List, Dict, Optional
from playwright.async_api import Page


async def extract_ordenes_from_page(page: Page) -> List[Dict]:
    """
    Extrae las órdenes de la página actual.
    
    Returns:
        Lista de dicts con los datos de cada orden
    """
    ordenes = []
    
    # Selector de la tabla de asignados
    selectors = [
        '#tableasig tbody tr',
        'table[id*="asig"] tbody tr',
        '.table tbody tr'
    ]
    
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
        return []
    
    for row in rows:
        try:
            cells = await row.locator('td').all()
            if len(cells) < 9:  # Mínimo de columnas esperadas
                continue
            
            # Extraer datos de cada celda
            # Según la imagen: #Exp, Asignación, Póliza, Siniestro/Reporte, Riesgo, Vehículo, Año, Placas, Estatus
            
            num_exp = await cells[0].text_content()
            fecha_asig = await cells[1].text_content()
            poliza = await cells[2].text_content()
            siniestro_reporte = await cells[3].text_content()
            riesgo = await cells[4].text_content()
            vehiculo = await cells[5].text_content()
            anio = await cells[6].text_content()
            placas = await cells[7].text_content()
            estatus = await cells[8].text_content()
            
            # Parsear siniestro y reporte (vienen juntos en formato: S: XXX R: XXX)
            siniestro = ""
            reporte = ""
            if siniestro_reporte:
                sr_text = siniestro_reporte.strip()
                if "S:" in sr_text:
                    siniestro = sr_text.split("S:")[1].split("R:")[0].strip() if "R:" in sr_text else sr_text.split("S:")[1].strip()
                if "R:" in sr_text:
                    reporte = sr_text.split("R:")[1].strip()
            
            # Parsear año
            try:
                anio_int = int(anio.strip()) if anio and anio.strip().isdigit() else None
            except:
                anio_int = None
            
            orden = {
                'num_expediente': num_expediente.strip() if num_expediente else "",
                'fecha_asignacion': parse_fecha(fecha_asig.strip()) if fecha_asig else None,
                'poliza': poliza.strip() if poliza else "",
                'siniestro': siniestro,
                'reporte': reporte,
                'riesgo': riesgo.strip() if riesgo else "",
                'vehiculo': vehiculo.strip() if vehiculo else "",
                'anio': anio_int,
                'placas': placas.strip() if placas else "",
                'estatus': estatus.strip() if estatus else ""
            }
            
            # Solo agregar si tiene número de expediente
            if orden['num_expediente']:
                ordenes.append(orden)
                
        except Exception as e:
            continue
    
    return ordenes


def parse_fecha(fecha_str: str) -> Optional[datetime]:
    """Parsea fecha en formato español a datetime."""
    if not fecha_str:
        return None
    
    # Formatos comunes: "27-feb, 12:51" o "2026-02-27 12:51:06"
    meses_es = {
        'ene': 1, 'feb': 2, 'mar': 3, 'abr': 4, 'may': 5, 'jun': 6,
        'jul': 7, 'ago': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dic': 12
    }
    
    try:
        fecha_str = fecha_str.strip().lower()
        
        # Formato: "27-feb, 12:51"
        if '-' in fecha_str and ',' in fecha_str:
            partes = fecha_str.split(',')
            fecha_part = partes[0].strip()
            hora_part = partes[1].strip() if len(partes) > 1 else "00:00"
            
            dia_mes = fecha_part.split('-')
            dia = int(dia_mes[0])
            mes = meses_es.get(dia_mes[1], 1)
            
            hora_min = hora_part.split(':')
            hora = int(hora_min[0])
            minuto = int(hora_min[1]) if len(hora_min) > 1 else 0
            
            return datetime(2026, mes, dia, hora, minuto)  # Ajustar año según corresponda
        
        # Formato ISO
        return datetime.fromisoformat(fecha_str.replace('Z', '+00:00'))
        
    except:
        return None


async def click_next_page_ordenes(page: Page) -> bool:
    """
    Clica en el botón 'Siguiente' de la tabla de órdenes.
    
    Returns:
        True si pudo navegar a la siguiente página
    """
    try:
        # Selector basado en el HTML: button#pagina_siguiente_tableasig
        next_button = page.locator('#pagina_siguiente_tableasig').first
        
        if await next_button.count() == 0:
            return False
        
        # Verificar si está deshabilitado
        disabled = await next_button.get_attribute('disabled')
        if disabled:
            return False
        
        # Verificar clase disabled
        class_attr = await next_button.get_attribute('class')
        if class_attr and 'disabled' in class_attr:
            return False
        
        await next_button.click()
        await asyncio.sleep(2)  # Esperar carga
        return True
        
    except Exception as e:
        return False


async def extract_all_ordenes_asignadas(page: Page) -> List[Dict]:
    """
    Extrae todas las órdenes asignadas navegando por todas las páginas.
    
    Args:
        page: Página de Playwright ya logueada
        
    Returns:
        Lista completa de órdenes
    """
    all_ordenes = []
    page_num = 1
    max_pages = 100  # Límite de seguridad
    
    print("[OrdenesExtractor] Iniciando extracción...")
    
    # Navegar a la página de órdenes asignadas
    await page.goto("https://proordersistem.com.mx/BandejaQualitas", wait_until="networkidle")
    await asyncio.sleep(3)
    
    # Esperar a que cargue la tabla
    try:
        await page.wait_for_selector('#tableasig, table[id*="asig"]', timeout=10000)
    except:
        print("[OrdenesExtractor] No se encontró tabla de órdenes")
        return []
    
    # Hacer clic en la pestaña "Asignados" si existe
    try:
        tab_asignados = page.locator('a:has-text("Asignados"), button:has-text("Asignados"), #home-tab').first
        if await tab_asignados.count() > 0 and await tab_asignados.is_visible():
            await tab_asignados.click()
            await asyncio.sleep(2)
    except:
        pass
    
    while page_num <= max_pages:
        print(f"[OrdenesExtractor] Página {page_num}...")
        
        ordenes = await extract_ordenes_from_page(page)
        if ordenes:
            all_ordenes.extend(ordenes)
            print(f"  ✓ {len(ordenes)} órdenes extraídas")
        
        # Intentar ir a la siguiente página
        has_next = await click_next_page_ordenes(page)
        if not has_next:
            print("[OrdenesExtractor] No hay más páginas")
            break
        
        page_num += 1
    
    print(f"[OrdenesExtractor] Total: {len(all_ordenes)} órdenes en {page_num} páginas")
    return all_ordenes


# Función para guardar en base de datos
def save_ordenes_to_db(ordenes: List[Dict], fecha_extraccion: datetime = None) -> int:
    """
    Guarda las órdenes en la base de datos.
    
    Returns:
        Cantidad de órdenes insertadas
    """
    from app.core.db import get_connection
    
    if fecha_extraccion is None:
        fecha_extraccion = datetime.now()
    
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
                    orden['num_expediente'],
                    orden['fecha_asignacion'],
                    orden['poliza'],
                    orden['siniestro'],
                    orden['reporte'],
                    orden['riesgo'],
                    orden['vehiculo'],
                    orden['anio'],
                    orden['placas'],
                    orden['estatus'],
                    fecha_extraccion
                ))
                inserted += 1
            except Exception as e:
                print(f"[DB Error] {orden['num_expediente']}: {e}")
        
        conn.commit()
    
    return inserted


# Función para obtener últimas órdenes
def get_latest_ordenes(limit: int = 100) -> List[Dict]:
    """Obtiene las últimas órdenes extraídas."""
    from app.core.db import get_connection
    from psycopg.rows import dict_row
    
    with get_connection() as conn:
        conn.row_factory = dict_row
        rows = conn.execute("""
            SELECT * FROM v_qualitas_ordenes_recientes
            ORDER BY fecha_asignacion DESC
            LIMIT %s
        """, (limit,)).fetchall()
        return [dict(row) for row in rows]
