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
    Usa extract_ordenes_from_table que ya maneja la paginación internamente.
    
    Args:
        page: Página de Playwright
        status_name: Nombre del estatus (ej: "Asignados", "Citados")
        max_pages: Máximo de páginas a recorrer
        
    Returns:
        Lista de órdenes con el campo 'estatus' poblado
    """
    print(f"\n[StatusExtractor] Extrayendo órdenes de: {status_name}")
    
    # Obtener el ID de la tabla para este estatus
    table_id = get_table_id_from_status(status_name)
    print(f"[StatusExtractor] Usando tabla ID: {table_id}")
    
    ordenes = []
    
    try:
        # Esperar a que la tabla cargue
        try:
            await page.wait_for_selector(f'#{table_id}, table[id="{table_id}"]', timeout=10000)
            print(f"  ✓ Tabla #{table_id} encontrada")
        except:
            print(f"  [Warning] No se encontró tabla específica #{table_id}, intentando extraer de todas formas...")
        
        await asyncio.sleep(2)  # Espera para estabilidad
        
        # Extraer órdenes usando el extractor v2 que maneja su propia paginación
        ordenes = await extract_ordenes_from_table(page, table_id, status_name)
        
        # Agregar el estatus a cada orden (por si no lo tiene)
        for orden in ordenes:
            if 'estatus' not in orden or not orden['estatus']:
                orden['estatus'] = status_name
            if 'fecha_extraccion' not in orden:
                orden['fecha_extraccion'] = datetime.now().isoformat()
        
        print(f"[StatusExtractor] {status_name} - Total: {len(ordenes)} órdenes extraídas")
        
    except Exception as e:
        print(f"[StatusExtractor] ERROR extrayendo {status_name}: {e}")
        import traceback
        print(f"[StatusExtractor] Traceback: {traceback.format_exc()}")
    
    return ordenes


async def get_tab_element(page: Page, status_name: str):
    """
    Obtiene el elemento del tab correspondiente a un estatus.
    
    Args:
        page: Página de Playwright
        status_name: Nombre del estatus a buscar
        
    Returns:
        Tupla (tab_element, tab_text) o (None, None) si no se encuentra
    """
    try:
        # Estrategia 1: Buscar por href
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
                if await tab.count() > 0 and await tab.is_visible():
                    text = await tab.text_content()
                    return tab, text.strip() if text else status_name
            except:
                continue
        
        # Estrategia 2: Buscar en todos los enlaces
        all_tabs = await page.locator('a[data-toggle="tab"], .nav-tabs a, .nav-item a').all()
        for tab in all_tabs:
            try:
                text = await tab.text_content()
                if text and status_name.lower() in text.strip().lower():
                    return tab, text.strip()
            except:
                continue
        
        # Estrategia 3: Buscar por onclick
        onclick_tabs = await page.locator('a[onclick*="cargarDataTable"]').all()
        for tab in onclick_tabs:
            try:
                text = await tab.text_content()
                if text and status_name.lower() in text.strip().lower():
                    return tab, text.strip()
            except:
                continue
        
        return None, None
    except Exception as e:
        print(f"[GetTabElement] Error: {e}")
        return None, None


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


def get_db_connection():
    """Obtiene una conexión a la base de datos."""
    import psycopg
    database_url = 'postgresql://LaMarinaCC:A355Fu584$@lamarinacc-db.c7o8imsw0zss.us-east-1.rds.amazonaws.com:5432/postgres?sslmode=require'
    return psycopg.connect(database_url)


def get_last_count_for_status(status_name: str) -> int:
    """
    Obtiene el último conteo de registros para un estatus.
    
    Args:
        status_name: Nombre del estatus
        
    Returns:
        Número de registros de la última extracción, o -1 si no hay datos
    """
    try:
        with get_db_connection() as conn:
            # Crear tabla si no existe
            conn.execute("""
                CREATE TABLE IF NOT EXISTS qualitas_extraccion_conteos (
                    id SERIAL PRIMARY KEY,
                    estatus VARCHAR(100) NOT NULL,
                    total_registros INTEGER NOT NULL,
                    fecha_extraccion TIMESTAMP NOT NULL DEFAULT NOW(),
                    UNIQUE(estatus)
                )
            """)
            
            result = conn.execute(
                "SELECT total_registros FROM qualitas_extraccion_conteos WHERE estatus = %s",
                (status_name,)
            ).fetchone()
            
            return result[0] if result else -1
    except Exception as e:
        print(f"  [CountCache] Error obteniendo conteo para {status_name}: {e}")
        return -1


def save_count_for_status(status_name: str, count: int):
    """
    Guarda el conteo de registros para un estatus.
    
    Args:
        status_name: Nombre del estatus
        count: Número de registros
    """
    try:
        with get_db_connection() as conn:
            conn.execute("""
                INSERT INTO qualitas_extraccion_conteos (estatus, total_registros, fecha_extraccion)
                VALUES (%s, %s, NOW())
                ON CONFLICT (estatus) 
                DO UPDATE SET total_registros = EXCLUDED.total_registros, 
                              fecha_extraccion = EXCLUDED.fecha_extraccion
            """, (status_name, count))
            conn.commit()
    except Exception as e:
        print(f"  [CountCache] Error guardando conteo para {status_name}: {e}")


def extract_count_from_tab_text(tab_text: str) -> int:
    """
    Extrae el número de registros del texto del tab.
    Ej: "Asignados(128)" -> 128, "Tránsito(88)" -> 88
    
    Args:
        tab_text: Texto del tab (ej: "Asignados(128)")
        
    Returns:
        Número de registros, o -1 si no se pudo extraer
    """
    try:
        # Buscar número entre paréntesis
        match = re.search(r'\((\d+)\)', tab_text)
        if match:
            return int(match.group(1))
        return -1
    except Exception:
        return -1


async def save_ordenes_to_db_immediate(ordenes: List[Dict], status_name: str, fecha_extraccion: datetime) -> int:
    """
    Guarda órdenes de un estatus específico inmediatamente en la BD.
    """
    if not ordenes:
        return 0
    
    inserted = 0
    errores = 0
    errores_detalle = []
    
    try:
        import psycopg
        
        # Forzar conexión a la BD correcta (postgres, no lamarinacc)
        database_url = 'postgresql://LaMarinaCC:A355Fu584$@lamarinacc-db.c7o8imsw0zss.us-east-1.rds.amazonaws.com:5432/postgres?sslmode=require'
        
        print(f"  [DB] Intentando guardar {len(ordenes)} órdenes de '{status_name}'...")
        
        with psycopg.connect(database_url, autocommit=True) as conn:
            # Debug: Verificar conexión y esquema
            try:
                db_info = conn.execute("SELECT current_database(), current_schema()").fetchone()
                print(f"    [DB Debug] Base de datos: {db_info[0]}, Esquema: {db_info[1]}")
                
                # Verificar si la tabla existe
                table_check = conn.execute("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = 'public' 
                        AND table_name = 'qualitas_ordenes_asignadas'
                    )
                """).fetchone()
                print(f"    [DB Debug] ¿Tabla existe? {table_check[0]}")
                
                if not table_check[0]:
                    tables = conn.execute("""
                        SELECT table_name FROM information_schema.tables 
                        WHERE table_schema = 'public' 
                        AND table_name LIKE '%qualitas%'
                    """).fetchall()
                    print(f"    [DB Debug] Tablas con 'qualitas': {[t[0] for t in tables]}")
                    print(f"    [DB Debug] ERROR: La tabla no existe en postgres!")
                    return 0
            except Exception as e:
                print(f"    [DB Debug] Error verificando: {e}")
            for i, orden in enumerate(ordenes):
                try:
                    num_exp = orden.get('num_expediente')
                    if not num_exp or len(str(num_exp).strip()) < 3:
                        print(f"    [Warning] Orden {i}: num_expediente inválido '{num_exp}'")
                        errores += 1
                        continue
                    
                    # Debug: mostrar datos de la primera orden
                    if i == 0:
                        print(f"    [Debug] Primera orden: num_exp={num_exp}, estatus={orden.get('estatus')}")
                    
                    conn.execute("""
                        INSERT INTO qualitas_ordenes_asignadas 
                        (num_expediente, fecha_asignacion, poliza, siniestro, reporte, 
                         riesgo, vehiculo, anio, placas, estatus, fecha_extraccion)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (num_expediente, fecha_extraccion) DO NOTHING
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
                        str(orden.get('estatus', status_name))[:50],
                        fecha_extraccion
                    ))
                    inserted += 1
                    
                except Exception as e:
                    errores += 1
                    if len(errores_detalle) < 3:
                        errores_detalle.append(f"Orden {i} ({num_exp}): {str(e)[:100]}")
            
            conn.commit()
            
        print(f"  [DB] {status_name}: {inserted}/{len(ordenes)} órdenes guardadas" + 
              (f" ({errores} errores)" if errores > 0 else ""))
        
        if errores_detalle:
            for err in errores_detalle:
                print(f"    [Error] {err}")
                
        return inserted
        
    except Exception as e:
        print(f"  [DB] ✗ Error general guardando {status_name}: {e}")
        import traceback
        print(f"  [DB] Traceback: {traceback.format_exc()}")
        return 0


async def extract_all_ordenes_all_status(page: Page, force_extract: bool = False) -> Dict[str, List[Dict]]:
    """
    Extrae órdenes de TODOS los estatus disponibles.
    Guarda inmediatamente después de extraer cada estatus.
    
    Args:
        page: Página de Playwright
        force_extract: Si es True, extrae todos los tabs ignorando la optimización de conteos
        
    Returns:
        Dict con las órdenes extraídas por estatus
    """
    result = {}
    fecha_extraccion = datetime.now()
    total_guardadas = 0
    tabs_skipped = 0
    tabs_processed = 0
    
    print("\n" + "=" * 60)
    print("EXTRACCIÓN COMPLETA DE TODOS LOS ESTATUS")
    if force_extract:
        print("[MODO FORZADO] Ignorando optimización de conteos")
    print("=" * 60)
    
    # Navegar a la página de órdenes/bandeja
    print("[AllStatus] Navegando a BandejaQualitas...")
    await page.goto("https://proordersistem.com.mx/BandejaQualitas", wait_until="networkidle")
    await asyncio.sleep(3)
    
    # Debug: Guardar HTML para análisis
    try:
        html = await page.content()
        print(f"[AllStatus] HTML de la página cargada ({len(html)} caracteres)")
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
    
    # Extraer y guardar órdenes de cada tab INMEDIATAMENTE
    # CON OPTIMIZACIÓN: comparar conteos antes de extraer
    print("\n" + "-" * 40)
    print("[OPTIMIZACIÓN] Comparando conteos con extracción anterior")
    print("-" * 40)
    
    for status_name in tabs_disponibles:
        print(f"\n{'='*40}")
        print(f"Procesando: {status_name}")
        print(f"{'='*40}")
        
        try:
            # OBTENER EL TAB Y SU TEXTO COMPLETO (con número de registros)
            tab_element, tab_text = await get_tab_element(page, status_name)
            
            if not tab_element:
                print(f"  ✗ No se pudo encontrar el tab para '{status_name}'")
                continue
            
            # Extraer el conteo del texto del tab (ej: "Asignados(128)" -> 128)
            current_count = extract_count_from_tab_text(tab_text)
            
            if current_count >= 0:
                print(f"  [Count] Tab muestra: {current_count} registros")
                
                # OPTIMIZACIÓN 1: Saltar tabs con 0 registros
                if current_count == 0:
                    print(f"  ⏭️  SKIPPING: Tab '{status_name}' tiene 0 registros")
                    tabs_skipped += 1
                    # Guardar conteo 0 para mantener consistencia
                    save_count_for_status(status_name, 0)
                    continue
                
                # Obtener el último conteo guardado
                last_count = get_last_count_for_status(status_name)
                print(f"  [Count] Última extracción: {last_count if last_count >= 0 else 'N/A'} registros")
                
                # OPTIMIZACIÓN 2: Si el conteo es igual al anterior Y no estamos forzando, saltar este tab
                if not force_extract and current_count == last_count and last_count >= 0:
                    print(f"  ⏭️  SKIPPING: El conteo no ha cambiado desde la última extracción")
                    print(f"      No es necesario extraer '{status_name}' nuevamente")
                    tabs_skipped += 1
                    continue
                
                if force_extract:
                    print(f"  [Count] Modo forzado: extrayendo aunque el conteo sea igual")
                else:
                    print(f"  [Count] Conteo diferente o primera extracción, procediendo...")
            else:
                print(f"  [Count] No se pudo extraer conteo del tab, procediendo con extracción completa")
            
            # Hacer clic en el tab
            try:
                # Verificar que el tab sea visible antes de intentar clic
                is_visible = await tab_element.is_visible()
                is_enabled = await tab_element.is_enabled()
                
                if not is_visible:
                    print(f"  ⚠ Tab '{status_name}' no es visible, saltando...")
                    tabs_skipped += 1
                    continue
                    
                if not is_enabled:
                    print(f"  ⚠ Tab '{status_name}' está deshabilitado, saltando...")
                    tabs_skipped += 1
                    continue
                
                await tab_element.click()
                print(f"[TabNavigator] ✓ Click en tab '{status_name}'")
                await asyncio.sleep(2)
            except Exception as e:
                print(f"  ✗ Error haciendo click en tab '{status_name}': {e}")
                print(f"  ⚠ Saltando a siguiente estatus...")
                tabs_skipped += 1
                continue
            
            # Extraer órdenes de este estatus
            try:
                ordenes = await extract_ordenes_from_status_tab(page, status_name)
                
                if ordenes:
                    result[status_name] = ordenes
                    actual_count = len(ordenes)
                    print(f"  ✓ {actual_count} órdenes extraídas de '{status_name}'")
                    tabs_processed += 1
                    
                    # GUARDAR INMEDIATAMENTE EN BD
                    try:
                        guardadas = await save_ordenes_to_db_immediate(ordenes, status_name, fecha_extraccion)
                        total_guardadas += guardadas
                        print(f"  ✓ {guardadas} órdenes guardadas en BD")
                        
                        # Guardar el conteo actual para la próxima comparación
                        # Usar el conteo real extraído, no el del tab (puede haber diferencias)
                        save_count_for_status(status_name, actual_count)
                        print(f"  [Count] Conteo guardado para próxima comparación: {actual_count}")
                    except Exception as e:
                        print(f"  ✗ Error guardando en BD: {e}")
                else:
                    print(f"  ⚠ No se encontraron órdenes en '{status_name}'")
                    tabs_processed += 1
                    # Guardar conteo 0 para evitar reintentos innecesarios
                    save_count_for_status(status_name, 0)
            except Exception as e:
                print(f"  ✗ Error extrayendo '{status_name}': {e}")
                import traceback
                print(f"  [Traceback] {traceback.format_exc()}")
                
        except Exception as e:
            print(f"  ✗ Error CRÍTICO en '{status_name}': {e}")
            import traceback
            print(f"  [Traceback] {traceback.format_exc()}")
            print(f"  ⚠ Continuando con el siguiente estatus...")
        
        await asyncio.sleep(1)  # Pausa entre tabs para estabilidad
    
    print("\n" + "=" * 60)
    total_extraidas = sum(len(ordenes) for ordenes in result.values())
    print(f"EXTRACCIÓN COMPLETADA")
    print(f"  Tabs procesados: {tabs_processed}")
    print(f"  Tabs omitidos (sin cambios): {tabs_skipped}")
    print(f"  Total extraídas: {total_extraidas}")
    print(f"  Total guardadas: {total_guardadas}")
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


async def save_all_ordenes_to_db(ordenes_by_status: Dict[str, List[Dict]], fecha_extraccion: datetime = None) -> int:
    """
    Guarda el JSON final con todas las órdenes.
    NOTA: Las órdenes ya se guardaron en BD durante la extracción.
    
    Args:
        ordenes_by_status: Dict con key=estatus, value=lista_de_ordenes
        fecha_extraccion: Fecha de extracción (opcional)
        
    Returns:
        Número total de órdenes
    """
    from pathlib import Path
    
    if fecha_extraccion is None:
        fecha_extraccion = datetime.now()
    
    # Aplanar todas las órdenes
    all_ordenes = flatten_ordenes_by_status(ordenes_by_status)
    
    if not all_ordenes:
        print("[SaveAll] No hay órdenes para guardar")
        return 0
    
    # Guardar en JSON de respaldo
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
    
    print(f"[SaveAll] ✓ JSON de respaldo guardado: {output_path}")
    print(f"[SaveAll] Total de órdenes procesadas: {len(all_ordenes)}")
    
    return len(all_ordenes)
