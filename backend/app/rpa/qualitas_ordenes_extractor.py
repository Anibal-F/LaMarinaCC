"""
Extractor de órdenes asignadas desde Qualitas.

Este módulo extrae la tabla de órdenes asignadas de Qualitas,
navegando por todas las páginas disponibles.
"""

import asyncio
import json
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional
from playwright.async_api import Page


async def extract_ordenes_from_page(page: Page) -> List[Dict]:
    """
    Extrae las órdenes de la página actual.
    
    Returns:
        Lista de dicts con los datos de cada orden
    """
    ordenes = []
    
    # Múltiples selectores posibles para la tabla de asignados
    selectors = [
        '#tableasig tbody tr',
        'table[id*="asig"] tbody tr',
        '.dataTable tbody tr',
        '.table-hover tbody tr',
        'table.table tbody tr',
        '.table-responsive table tbody tr'
    ]
    
    rows = []
    used_selector = None
    for selector in selectors:
        try:
            await page.wait_for_selector(selector, timeout=3000)
            rows = await page.locator(selector).all()
            if rows:
                used_selector = selector
                print(f"  [Debug] Tabla encontrada con: {selector} ({len(rows)} filas)")
                break
        except:
            continue
    
    if not rows:
        print("  [Warning] No se encontraron filas en la tabla")
        # Debug: guardar HTML para análisis
        try:
            html = await page.content()
            print(f"  [Debug] HTML parcial: {html[:500]}...")
        except:
            pass
        return []
    
    for i, row in enumerate(rows):
        try:
            cells = await row.locator('td').all()
            if len(cells) < 8:  # Mínimo de columnas esperadas
                continue
            
            # Extraer texto de todas las celdas para debugging
            cell_texts = []
            for j, cell in enumerate(cells):
                text = await cell.text_content()
                cell_texts.append(text.strip() if text else "")
            
            # Debug primera fila
            if i == 0:
                print(f"  [Debug] Primera fila: {cell_texts}")
            
            # Mapear columnas según la tabla real
            # Debug muestra: [ID, #Exp, Asignación, Póliza, Siniestro/Reporte, Riesgo, Vehículo, Año, Placas, Estatus, ...]
            # Ejemplo: ['697677', '9300160', '2026-02-27 12:51:06', '0640779497', 'S: 0289408 R: 04 0336432 T1', 'Tercero', 'NISSAN...', '2019', 'VNT113D', 'Asignado', ...]
            id_interno = cell_texts[0] if len(cell_texts) > 0 else ""  # ID interno (no usado)
            num_exp = cell_texts[1] if len(cell_texts) > 1 else ""      # #Exp
            fecha_asig = cell_texts[2] if len(cell_texts) > 2 else ""   # Asignación
            poliza = cell_texts[3] if len(cell_texts) > 3 else ""       # Póliza
            siniestro_reporte = cell_texts[4] if len(cell_texts) > 4 else ""  # Siniestro/Reporte
            riesgo = cell_texts[5] if len(cell_texts) > 5 else ""       # Riesgo
            vehiculo = cell_texts[6] if len(cell_texts) > 6 else ""     # Vehículo
            anio = cell_texts[7] if len(cell_texts) > 7 else ""         # Año
            placas = cell_texts[8] if len(cell_texts) > 8 else ""       # Placas
            estatus = cell_texts[9] if len(cell_texts) > 9 else "Asignado"  # Estatus
            
            # Parsear siniestro y reporte
            siniestro = ""
            reporte = ""
            if siniestro_reporte:
                sr_text = siniestro_reporte.strip()
                if "S:" in sr_text:
                    s_parts = sr_text.split("S:")
                    if len(s_parts) > 1:
                        s_val = s_parts[1]
                        if "R:" in s_val:
                            siniestro = s_val.split("R:")[0].strip()
                            reporte = s_val.split("R:")[1].strip()
                        else:
                            siniestro = s_val.strip()
                if "R:" in sr_text and not reporte:
                    r_parts = sr_text.split("R:")
                    if len(r_parts) > 1:
                        reporte = r_parts[1].strip()
            
            # Parsear año
            try:
                anio_clean = anio.strip().replace(',', '')
                anio_int = int(anio_clean) if anio_clean.isdigit() else None
            except:
                anio_int = None
            
            orden = {
                'num_expediente': num_exp.strip(),
                'fecha_asignacion': parse_fecha(fecha_asig.strip()) if fecha_asig else None,
                'poliza': poliza.strip(),
                'siniestro': siniestro,
                'reporte': reporte,
                'riesgo': riesgo.strip(),
                'vehiculo': vehiculo.strip(),
                'anio': anio_int,
                'placas': placas.strip().upper(),
                'estatus': estatus.strip() or "Asignado"
            }
            
            # Solo agregar si tiene número de expediente válido
            if orden['num_expediente'] and len(orden['num_expediente']) > 3:
                ordenes.append(orden)
                if i < 3:  # Debug primeras 3 órdenes
                    print(f"  [Orden {i+1}] {orden['num_expediente']} - {orden['vehiculo'][:30]}")
                
        except Exception as e:
            print(f"  [Error fila {i}]: {e}")
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
    Guarda las órdenes en JSON (método confiable para evitar problemas de DNS).
    """
    from pathlib import Path
    
    if fecha_extraccion is None:
        fecha_extraccion = datetime.now()
    
    # Siempre guardar en JSON primero
    output_path = Path(__file__).parent / "data" / f"qualitas_ordenes_{fecha_extraccion.strftime('%Y%m%d_%H%M%S')}.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump({
            'fecha_extraccion': fecha_extraccion.isoformat(),
            'total': len(ordenes),
            'ordenes': ordenes
        }, f, indent=2, ensure_ascii=False)
    
    print(f"[JSON] ✓ {len(ordenes)} órdenes guardadas en: {output_path}")
    print(f"[Info] Para importar a BD, ejecuta en EC2:")
    print(f"       cd ~/LaMarinaCC/backend && python3 import_ordenes_json.py {output_path}")
    
    # Intentar guardar en BD (opcional)
    try:
        from app.core.db import get_connection
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
                except Exception as e:
                    pass
            conn.commit()
            print(f"[DB] ✓ Órdenes también guardadas en base de datos")
    except Exception as e:
        print(f"[DB] Nota: No se pudieron guardar en BD automáticamente: {e}")
    
    return len(ordenes)


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
