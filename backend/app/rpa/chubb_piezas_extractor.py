"""
RPA para extraer información de piezas (Inpart) de expedientes CHUBB.

Este módulo extrae el estatus de piezas de los expedientes autorizados
que no tengan información de AudaTrace.
"""

import argparse
import asyncio
import json
import os
import re
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any, Optional
from playwright.async_api import async_playwright, Page, Browser, TimeoutError

# Agregar el backend al path para importar el módulo de DB
import sys
backend_dir = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(backend_dir))

from app.rpa.credentials_helper import get_chubb_credentials

# Configuración de timeouts
NAVIGATION_TIMEOUT = 30000  # 30 segundos
ELEMENT_TIMEOUT = 10000     # 10 segundos


async def get_expedientes_pendientes() -> List[Dict[str, Any]]:
    """
    Obtiene de la base de datos los expedientes CHUBB autorizados
    con Estatus AudaTrace vacío o NULL.
    Solo incluye expedientes del año actual (2026) y ordena por fecha de creación más reciente.
    """
    from app.core.db import get_connection
    
    try:
        with get_connection() as conn:
            rows = conn.execute("""
                SELECT DISTINCT ON (num_expediente) 
                    id,
                    num_expediente,
                    tipo_vehiculo,
                    estado,
                    placas,
                    fecha_extraccion,
                    fecha_creacion
                FROM chubb_expedientes
                WHERE estado = 'Autorizado'
                  AND (estatus_audatrace IS NULL OR estatus_audatrace = '')
                  AND num_expediente LIKE 'PA26%'  -- Solo expedientes del 2026
                ORDER BY num_expediente, fecha_creacion DESC NULLS LAST
                LIMIT 200
            """).fetchall()
            
            return [
                {
                    'id': row[0],
                    'num_expediente': row[1],
                    'tipo_vehiculo': row[2],
                    'estado': row[3],
                    'placas': row[4],
                    'fecha_extraccion': row[5],
                    'fecha_creacion': row[6]
                }
                for row in rows
            ]
    except Exception as e:
        print(f"[DB] Error obteniendo expedientes: {e}")
        return []


async def do_login(page: Page, use_db: bool = True) -> bool:
    """
    Realiza el login en CHUBB/Audatex.
    Copiado exactamente de chubb_full_workflow.py
    """
    try:
        # Cargar credenciales primero
        if use_db:
            creds = get_chubb_credentials()
            if creds:
                os.environ['CHUBB_USER'] = creds['usuario']
                os.environ['CHUBB_PASSWORD'] = creds['password']
                print(f"[Login] Usando credenciales de DB: {creds['usuario']}")
        
        user = os.getenv('CHUBB_USER', '')
        password = os.getenv('CHUBB_PASSWORD', '')
        
        if not user or not password:
            print("[Login] ✗ No hay credenciales configuradas")
            return False
        
        print("[Login] Navegando a CHUBB/Audatex...")
        await page.goto('https://acg-prod-mx.audatex.com.mx/Audanet/', 
                       timeout=NAVIGATION_TIMEOUT, wait_until='domcontentloaded')
        await asyncio.sleep(3)
        
        # Manejar banner de cookies
        try:
            cookie_selectors = [
                'button:has-text("Aceptar cookies")',
                'button:has-text("Aceptar")',
            ]
            for selector in cookie_selectors:
                try:
                    btn = page.locator(selector).first
                    if await btn.count() > 0 and await btn.is_visible():
                        await btn.click()
                        print("[Login] ✓ Cookies aceptadas")
                        await asyncio.sleep(1)
                        break
                except:
                    continue
        except:
            pass
        
        # PASO 1: Primera pantalla - Usuario
        print("[Login] PASO 1: Ingresando usuario...")
        
        try:
            await page.wait_for_selector('#loginB2C', timeout=10000)
            print("[Login] ✓ Formulario B2C encontrado")
        except Exception as e:
            print(f"[Login] ✗ No se encontró formulario B2C: {e}")
            return False
        
        # Llenar usuario
        await page.fill('#UserName', user)
        print("[Login] ✓ Usuario ingresado")
        await asyncio.sleep(0.5)
        
        # Marcar checkbox de términos (nota: ID tiene typo 'Accpet')
        print("[Login] Marcando términos y condiciones...")
        try:
            terms = page.locator('#AccpetTerms').first
            if await terms.count() > 0:
                is_checked = await terms.is_checked()
                if not is_checked:
                    await terms.click()
                    print("[Login] ✓ Términos aceptados")
        except Exception as e:
            print(f"[Login] ⚠ Error con checkbox: {e}")
        
        await asyncio.sleep(1)
        
        # Click en botón NEXT (#btnNext no #continueButton)
        print("[Login] Clic en botón NEXT...")
        try:
            await page.click('#btnNext')
            print("[Login] ✓ NEXT clickeado")
        except Exception as e:
            print(f"[Login] ✗ Error clickeando NEXT: {e}")
            return False
        
        # ESPERAR A QUE CARGUE LA SEGUNDA PANTALLA
        print("[Login] Esperando transición al formulario de contraseña...")
        await asyncio.sleep(3)
        
        # PASO 2: Segunda pantalla - Contraseña
        print("[Login] PASO 2: Ingresando contraseña...")
        
        # Verificar campo password visible
        password_field_visible = await page.locator('#Password:visible').count()
        if password_field_visible == 0:
            print("[Login] ✗ No hay campo de contraseña visible")
            return False
        
        # Ingresar contraseña
        print("[Login] Ingresando contraseña...")
        await page.focus('#Password')
        await asyncio.sleep(0.5)
        await page.fill('#Password', password)
        print("[Login] ✓ Contraseña ingresada")
        
        # ESPERA IMPORTANTE: Dar tiempo a que JavaScript valide el campo
        print("[Login] Esperando 3 segundos para validación...")
        await asyncio.sleep(3)
        
        # Click en botón ACEPTAR (#btnEnter)
        print("[Login] Clic en botón ACEPTAR...")
        try:
            btn_locator = page.locator('#btnEnter')
            btn_exists = await btn_locator.count() > 0
            
            if btn_exists:
                try:
                    async with page.expect_navigation(timeout=10000, wait_until="domcontentloaded"):
                        await btn_locator.click(timeout=5000)
                    print("[Login] ✓ ACEPTAR clickeado, navegación detectada")
                except Exception as nav_err:
                    print(f"[Login] Navegación no detectada inmediatamente: {nav_err}")
                    await btn_locator.click(timeout=5000, no_wait_after=True)
                    print("[Login] ✓ ACEPTAR clickeado")
            else:
                # Fallback
                submit_btn = page.locator('input[type="submit"]:visible').first
                if await submit_btn.count() > 0:
                    await submit_btn.click(timeout=5000, no_wait_after=True)
                    print("[Login] ✓ Botón submit clickeado")
        except Exception as e:
            print(f"[Login] ⚠ Advertencia en click: {e}")
        
        await asyncio.sleep(5)
        print("[Login] ✓ Login exitoso")
        return True
        
    except Exception as e:
        print(f"[Login] ✗ Error: {e}")
        import traceback
        print(f"[Login] Traceback: {traceback.format_exc()}")
        return False


async def handle_session_alert(page: Page) -> bool:
    """
    Maneja el alert/dialog de 'sesión iniciada en otro terminal'.
    Este es un alert del navegador, no un modal HTML.
    """
    print("[SessionAlert] Configurando handler para alert de sesión...")
    
    alert_accepted = False
    
    def handle_dialog(dialog):
        nonlocal alert_accepted
        print(f"[SessionAlert] Dialog detectado: {dialog.type} - {dialog.message[:100]}...")
        
        # Si el mensaje contiene palabras clave de sesión previa
        if any(keyword in dialog.message.lower() for keyword in ['sesión', 'terminal', 'otro equipo', 'continuar']):
            print("[SessionAlert] ✓ Detectado alert de sesión previa - Aceptando...")
            asyncio.create_task(dialog.accept())
            alert_accepted = True
        else:
            # Para otros dialogs, también aceptar por defecto
            asyncio.create_task(dialog.accept())
    
    # Registrar el handler
    page.on('dialog', handle_dialog)
    
    # Esperar un momento por si aparece el alert
    await asyncio.sleep(3)
    
    if alert_accepted:
        print("[SessionAlert] ✓ Alert de sesión manejado")
        await asyncio.sleep(2)
    else:
        print("[SessionAlert] No se detectó alert de sesión")
    
    # Remover el handler después de usarlo
    page.remove_listener('dialog', handle_dialog)
    
    return alert_accepted


async def set_fecha_desde(page: Page, fecha_str: str) -> bool:
    """
    Configura la fecha 'Desde' en el filtro de Última Fecha de Actualización.
    Formato de entrada: YYYY-MM-DD (ej: 2026-01-01)
    Formato en CHUBB: DD/MM/YYYY (ej: 01/01/2026)
    """
    try:
        print(f"[FechaFilter] Configurando fecha desde: {fecha_str}")
        
        # Convertir formato YYYY-MM-DD a DD/MM/YYYY
        try:
            from datetime import datetime
            fecha_dt = datetime.strptime(fecha_str, "%Y-%m-%d")
            fecha_chubb = fecha_dt.strftime("%d/%m/%Y")
        except:
            print(f"[FechaFilter] Error parseando fecha {fecha_str}, usando default")
            fecha_chubb = "01/01/2026"
        
        # Hacer click en el campo de fecha para abrir el datepicker
        # Usar force=True para click aunque no sea visible
        fecha_input = page.locator('#ListFilters_9__ParameterValue')
        if await fecha_input.count() == 0:
            print("[FechaFilter] ✗ Campo de fecha no encontrado")
            return False
        
        # Intentar click normal primero, luego con force
        try:
            await fecha_input.click(timeout=5000)
        except:
            try:
                await fecha_input.click(force=True, timeout=5000)
            except:
                # Fallback: usar JavaScript para hacer click
                await page.evaluate("""() => {
                    const input = document.getElementById('ListFilters_9__ParameterValue');
                    if (input) input.click();
                }""")
        
        print("[FechaFilter] Datepicker abierto")
        await asyncio.sleep(1)
        
        # Esperar a que aparezca el datepicker
        await page.wait_for_selector('#ui-datepicker-div', timeout=5000)
        
        # Extraer año, mes, día
        year = fecha_dt.year
        month = fecha_dt.month - 1  # El datepicker usa 0-11
        day = fecha_dt.day
        
        # Seleccionar año
        year_select = page.locator('.ui-datepicker-year')
        if await year_select.count() > 0:
            await year_select.select_option(str(year))
            print(f"[FechaFilter] Año seleccionado: {year}")
        
        await asyncio.sleep(0.5)
        
        # Seleccionar mes
        month_select = page.locator('.ui-datepicker-month')
        if await month_select.count() > 0:
            await month_select.select_option(str(month))
            print(f"[FechaFilter] Mes seleccionado: {month + 1}")
        
        await asyncio.sleep(0.5)
        
        # Click en el día
        day_selector = f'td[data-handler="selectDay"] a[data-date="{day}"]'
        day_link = page.locator(day_selector)
        if await day_link.count() > 0:
            await day_link.click()
            print(f"[FechaFilter] Día seleccionado: {day}")
        else:
            # Fallback: buscar por texto
            day_links = await page.locator('td[data-handler="selectDay"] a').all()
            for link in day_links:
                text = await link.text_content()
                if text.strip() == str(day):
                    await link.click()
                    print(f"[FechaFilter] Día seleccionado (fallback): {day}")
                    break
        
        await asyncio.sleep(1)
        
        # Verificar que se seteó correctamente
        current_value = await fecha_input.input_value()
        print(f"[FechaFilter] Fecha seteada: {current_value}")
        
        return True
        
    except Exception as e:
        print(f"[FechaFilter] Error: {e}")
        import traceback
        print(f"[FechaFilter] Traceback: {traceback.format_exc()}")
        return False


async def handle_billing_modal(page: Page) -> bool:
    """
    Maneja el volante/mensaje de billing post-login.
    Copiado exactamente de chubb_full_workflow.py
    """
    try:
        print("[Billing] Verificando volante informativo...")
        
        try:
            await page.wait_for_selector('#btnBillingMessage', state="visible", timeout=5000)
        except:
            print("[Billing] No se detectó volante")
            return False
        
        print("[Billing] Volante detectado, clickeando 'Al Corriente'...")
        await page.click('#btnBillingMessage')
        print("[Billing] ✓ Botón 'Al Corriente' clickeado")
        await asyncio.sleep(2)
        return True
        
    except Exception as e:
        print(f"[Billing] Error manejando volante: {e}")
        return False


async def navigate_to_advanced_search(page: Page) -> bool:
    """Navega a la Búsqueda Avanzada de expedientes."""
    try:
        print("[Navigate] Navegando a Búsqueda Avanzada...")
        
        # OPCIÓN 1: Intentar navegación directa primero
        print("[Navigate] Intentando navegación directa...")
        try:
            response = await page.goto('https://acg-prod-mx.audatex.com.mx/Audanet/AdvancedSearch', 
                           timeout=30000, wait_until='domcontentloaded')
            await asyncio.sleep(3)
            
            # Verificar si cargó correctamente
            exp_input = await page.locator('#ListFilters_0__ParameterValue').count()
            if exp_input > 0:
                print("[Navigate] ✓ Búsqueda Avanzada cargada (navegación directa)")
                return True
        except Exception as e:
            print(f"[Navigate] Navegación directa falló: {e}")
        
        # OPCIÓN 2: Navegar por el menú
        print("[Navigate] Intentando navegación por menú...")
        
        # Primero ir a la página principal
        await page.goto('https://acg-prod-mx.audatex.com.mx/Audanet/Home', 
                       timeout=30000, wait_until='domcontentloaded')
        await asyncio.sleep(3)
        
        # Buscar y hacer clic en el menú "BUSCAR" (mayúsculas)
        menu_buscar_selectors = [
            'a:has-text("BUSCAR")',
            '.dropdown-toggle:has-text("BUSCAR")',
            'a[href="#"]:has-text("BUSCAR")'
        ]
        
        menu_clicked = False
        for selector in menu_buscar_selectors:
            try:
                menu = page.locator(selector).first
                if await menu.count() > 0 and await menu.is_visible():
                    await menu.click()
                    print(f"[Navigate] ✓ Menú BUSCAR clickeado ({selector})")
                    await asyncio.sleep(2)
                    menu_clicked = True
                    break
            except Exception as e:
                print(f"[Navigate] Selector {selector} falló: {e}")
                continue
        
        if not menu_clicked:
            print("[Navigate] ⚠ No se pudo clickear el menú BUSCAR con selectores estándar")
            # Intentar con JavaScript más específico
            js_result = await page.evaluate("""() => {
                // Buscar en el navbar/header
                const nav = document.querySelector('.navbar') || document.querySelector('header') || document.body;
                const links = Array.from(nav.querySelectorAll('a'));
                
                // Primero: buscar exacto
                let buscarLink = links.find(a => a.textContent.trim() === 'BUSCAR');
                
                // Segundo: buscar que incluya BUSCAR
                if (!buscarLink) {
                    buscarLink = links.find(a => a.textContent.toUpperCase().includes('BUSCAR'));
                }
                
                // Tercero: buscar por href que contenga Search o Buscar
                if (!buscarLink) {
                    buscarLink = links.find(a => {
                        const href = (a.getAttribute('href') || '').toLowerCase();
                        return href.includes('search') || href.includes('buscar');
                    });
                }
                
                if (buscarLink) {
                    // Hacer hover primero (para menús dropdown)
                    buscarLink.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                    setTimeout(() => buscarLink.click(), 100);
                    return {success: true, text: buscarLink.textContent, href: buscarLink.getAttribute('href')};
                }
                
                return {success: false, available: links.slice(0,15).map(a => ({
                    text: a.textContent.trim(),
                    href: a.getAttribute('href')
                }))};
            }""")
            print(f"[Navigate] Resultado JS para menú: {js_result}")
            if js_result.get('success'):
                await asyncio.sleep(3)
                menu_clicked = True
        
        if menu_clicked:
            # Esperar a que aparezca el dropdown
            await asyncio.sleep(2)
            
            # Buscar opción "EXPEDIENTES" (mayúsculas según la imagen)
            opcion_selectors = [
                'a:has-text("EXPEDIENTES")',
                'a:has-text("Expedientes")',
                '.dropdown-menu a:has-text("EXPEDIENTE")',
                '.dropdown-menu a:has-text("Expediente")',
                'a[href*="AdvancedSearch"]',
                '.dropdown-menu a'
            ]
            
            for selector in opcion_selectors:
                try:
                    opcion = page.locator(selector).first
                    if await opcion.count() > 0 and await opcion.is_visible():
                        text = await opcion.text_content()
                        print(f"[Navigate] Opción encontrada: {text}")
                        await opcion.click()
                        print(f"[Navigate] ✓ Opción clickeada ({selector})")
                        await asyncio.sleep(4)
                        
                        # Verificar si estamos en AdvancedSearch
                        exp_input = await page.locator('#ListFilters_0__ParameterValue').count()
                        if exp_input > 0:
                            print("[Navigate] ✓ Búsqueda Avanzada cargada (vía menú)")
                            return True
                        break
                except Exception as e:
                    print(f"[Navigate] Error con selector {selector}: {e}")
                    continue
            
            # Fallback: usar JavaScript para encontrar y clickar EXPEDIENTES
            if not await page.locator('#ListFilters_0__ParameterValue').count() > 0:
                print("[Navigate] Intentando clic en EXPEDIENTES vía JS...")
                js_result = await page.evaluate("""() => {
                    const links = Array.from(document.querySelectorAll('a'));
                    const expLink = links.find(a => 
                        a.textContent.trim() === 'EXPEDIENTES' || 
                        a.textContent.trim().toUpperCase() === 'EXPEDIENTE' ||
                        a.textContent.toUpperCase().includes('EXPEDIENTE')
                    );
                    if (expLink) {
                        expLink.click();
                        return {success: true, text: expLink.textContent};
                    }
                    return {success: false};
                }""")
                print(f"[Navigate] Resultado JS EXPEDIENTES: {js_result}")
                if js_result.get('success'):
                    await asyncio.sleep(4)
                    exp_input = await page.locator('#ListFilters_0__ParameterValue').count()
                    if exp_input > 0:
                        print("[Navigate] ✓ Búsqueda Avanzada cargada (vía JS)")
                        return True
        
        # Si todo falla, verificar estado actual
        current_url = page.url
        print(f"[Navigate] URL actual: {current_url}")
        
        # Hacer screenshot para debug
        try:
            await page.screenshot(path="/tmp/chubb_navigate_error.png")
            print("[Navigate] Screenshot guardado: /tmp/chubb_navigate_error.png")
        except:
            pass
        
        return False
        
    except Exception as e:
        print(f"[Navigate] Error navegando a Búsqueda Avanzada: {e}")
        import traceback
        print(f"[Navigate] Traceback: {traceback.format_exc()}")
        return False


async def apply_autorizado_filter(page: Page) -> bool:
    """Aplica el filtro 'Autorizado' en Mi Trabajo."""
    try:
        print("[Filter] Aplicando filtro 'Autorizado'...")
        
        # Primero, hacer clic en el acordeón "Trabajo del Sitio" si está cerrado
        try:
            accordion = page.locator('h3:has-text("Trabajo del Sitio")')
            if await accordion.count() > 0:
                # Verificar si está colapsado
                content = page.locator('#ui-id-4')
                is_visible = await content.is_visible() if await content.count() > 0 else False
                if not is_visible:
                    await accordion.click()
                    await asyncio.sleep(1)
                    print("[Filter] Acordeón 'Trabajo del Sitio' expandido")
        except Exception as e:
            print(f"[Filter] Nota: No se pudo expandir acordeón: {e}")
        
        # Usar JavaScript para hacer clic en el elemento li correcto
        js_result = await page.evaluate("""() => {
            // Buscar en el acordeón de "Trabajo del Sitio"
            const accordion = document.getElementById('ui-id-4');
            if (!accordion) {
                console.log('No se encontró acordeón ui-id-4');
                // Buscar en todo el documento
                const allItems = document.querySelectorAll('li.ui-widget-content, .selectable li');
                for (const item of allItems) {
                    const text = item.textContent.trim();
                    if (text.toLowerCase().includes('autorizado')) {
                        console.log('Click en (fallback):', text);
                        item.click();
                        return {success: true, text: text};
                    }
                }
                return {success: false, error: 'No se encontró el elemento'};
            }
            
            // Buscar dentro del acordeón
            const items = accordion.querySelectorAll('li.ui-widget-content, li');
            console.log('Items encontrados en acordeón:', items.length);
            
            for (const item of items) {
                const text = item.textContent.trim();
                if (text.toLowerCase().includes('autorizado')) {
                    console.log('Haciendo click en:', text);
                    item.click();
                    return {success: true, text: text};
                }
            }
            
            return {success: false, error: 'Autorizado no encontrado'};
        }""")
        
        print(f"[Filter] Resultado JS: {js_result}")
        
        if js_result.get('success'):
            print(f"[Filter] ✓ Filtro 'Autorizado' aplicado")
            await asyncio.sleep(4)
            return True
        else:
            print(f"[Filter] ✗ No se pudo aplicar filtro: {js_result.get('error')}")
            return False
            
    except Exception as e:
        print(f"[Filter] Error: {e}")
        import traceback
        print(f"[Filter] Traceback: {traceback.format_exc()}")
        return False


async def search_expediente(page: Page, num_expediente: str, fecha_desde: str = None) -> bool:
    """Busca un expediente específico usando la búsqueda avanzada."""
    try:
        print(f"[Search] Buscando expediente: {num_expediente}")
        
        # Verificar que estamos en AdvancedSearch
        exp_input = page.locator('#ListFilters_0__ParameterValue')
        if await exp_input.count() == 0:
            print("[Search] ⚠ No estamos en Búsqueda Avanzada, navegando...")
            if not await navigate_to_advanced_search(page):
                return False
            exp_input = page.locator('#ListFilters_0__ParameterValue')
        
        # Expandir el acordeón de Filtros si está colapsado (PRIMERO!)
        print("[Search] Verificando acordeón de Filtros...")
        try:
            # El acordeón tiene id ui-id-1 (header) y ui-id-2 (content)
            accordion_content = page.locator('#ui-id-2')
            is_visible = await accordion_content.is_visible() if await accordion_content.count() > 0 else False
            
            if not is_visible:
                print("[Search] Acordeón colapsado, expandiendo...")
                accordion_header = page.locator('#ui-id-1')
                if await accordion_header.count() > 0:
                    await accordion_header.click()
                    await asyncio.sleep(2)
                    print("[Search] ✓ Acordeón expandido")
        except Exception as e:
            print(f"[Search] Nota: No se pudo verificar acordeón: {e}")
        
        # Configurar fecha desde si se proporciona (DESPUÉS de expandir acordeón)
        if fecha_desde:
            fecha_ok = await set_fecha_desde(page, fecha_desde)
            if not fecha_ok:
                print("[Search] ⚠ No se pudo configurar fecha, continuando sin filtro de fecha...")
        
        # Esperar a que el input sea visible
        print("[Search] Esperando a que el campo sea visible...")
        try:
            await page.wait_for_selector('#ListFilters_0__ParameterValue:visible', timeout=10000)
            print("[Search] ✓ Campo visible")
        except:
            print("[Search] ⚠ El campo no se hizo visible, intentando con JavaScript...")
        
        # Intentar llenar el campo con JavaScript si no es visible para Playwright
        try:
            # Primero intentar fill normal
            await exp_input.fill('')
            await asyncio.sleep(0.3)
            await exp_input.fill(num_expediente)
            print("[Search] ✓ Expediente ingresado (fill normal)")
        except Exception as fill_error:
            print(f"[Search] Fill normal falló: {fill_error}")
            # Fallback: usar JavaScript
            js_result = await page.evaluate(f"""() => {{
                const input = document.getElementById('ListFilters_0__ParameterValue');
                if (input) {{
                    input.value = '{num_expediente}';
                    input.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    input.dispatchEvent(new Event('change', {{ bubbles: true }}));
                    return {{success: true}};
                }}
                return {{success: false, error: 'Input no encontrado'}};
            }}""")
            print(f"[Search] Resultado JS fill: {js_result}")
            if not js_result.get('success'):
                raise Exception(f"No se pudo llenar el campo: {js_result.get('error')}")
        
        await asyncio.sleep(1)
        
        # Click en botón Buscar
        btn_search = page.locator('#btnSearch')
        if await btn_search.count() > 0:
            await btn_search.click()
            print("[Search] ✓ Botón Buscar clickeado")
        else:
            # Fallback: usar Enter
            await exp_input.press('Enter')
            print("[Search] ✓ Búsqueda enviada con Enter")
        
        # ESPERAR A QUE CARGUEN LOS RESULTADOS (aumentado de 4 a 8 segundos)
        print("[Search] Esperando resultados...")
        await asyncio.sleep(6)
        
        # Verificar si se encontraron resultados
        # Buscar la tabla de resultados (gridAssesmentAdvanced en AdvancedSearch)
        result_selectors = ['#gridAssesmentAdvanced tbody tr', '#gridMyWorks tbody tr', '.grid tbody tr']
        
        print("[Search] Verificando resultados...")
        for selector in result_selectors:
            try:
                rows = await page.locator(selector).count()
                print(f"[Search]   Selector '{selector}': {rows} filas")
                if rows > 0:
                    # Verificar que no sea la fila de "No hay datos"
                    first_row_text = await page.locator(f"{selector}:first-child").text_content()
                    print(f"[Search]   Texto primera fila: {first_row_text[:100] if first_row_text else 'N/A'}")
                    if first_row_text and 'Ningún dato' not in first_row_text and 'No se encontraron' not in first_row_text:
                        print(f"[Search] ✓ Expediente encontrado ({rows} filas)")
                        return True
            except Exception as e:
                print(f"[Search]   Error con selector {selector}: {e}")
                continue
        
        # Si no hay filas, verificar si hay mensaje de "No se encontraron resultados" o "Ningún dato"
        no_results_selectors = [
            'text=No se encontraron',
            'text=Ningún dato',
            '.dataTables_empty'
        ]
        
        for no_result_selector in no_results_selectors:
            try:
                no_results = await page.locator(no_result_selector).count()
                if no_results > 0:
                    print(f"[Search] ✗ Expediente no encontrado ({no_result_selector})")
                    # Screenshot para debug
                    try:
                        await page.screenshot(path=f"/tmp/chubb_no_results_{num_expediente}.png")
                        print(f"[Search] Screenshot: /tmp/chubb_no_results_{num_expediente}.png")
                    except:
                        pass
                    return False
            except:
                continue
        
        print("[Search] ⚠ No se detectaron resultados, pero tampoco mensaje de vacío")
        # Screenshot para debug
        try:
            await page.screenshot(path=f"/tmp/chubb_undetermined_{num_expediente}.png")
            print(f"[Search] Screenshot: /tmp/chubb_undetermined_{num_expediente}.png")
        except:
            pass
        return False
            
    except Exception as e:
        print(f"[Search] Error: {e}")
        import traceback
        print(f"[Search] Traceback: {traceback.format_exc()}")
        return False


async def search_expediente_advanced(page: Page, num_expediente: str) -> bool:
    """
    Función legacy - ahora la búsqueda avanzada es el método principal.
    Esta función redirige a search_expediente para mantener compatibilidad.
    """
    return await search_expediente(page, num_expediente)


async def open_expediente_details(page: Page) -> bool:
    """Abre el expediente haciendo click en la lupa."""
    try:
        print("[Open] Abriendo detalle del expediente...")
        
        # Esperar a que la tabla esté cargada
        await asyncio.sleep(2)
        
        # Click en el icono de la lupa (img.buttonView con onclick)
        lupa_selectors = [
            '#gridAssesmentAdvanced img.buttonView',
            '#gridAssesmentAdvanced img[title="Visualizar"]',
            '#gridAssesmentAdvanced .buttonView',
            'img.buttonView',
            'img[title="Visualizar"]'
        ]
        
        lupa_clicked = False
        for selector in lupa_selectors:
            try:
                lupa = page.locator(selector).first
                if await lupa.count() > 0:
                    # Esperar a que sea visible
                    try:
                        await lupa.wait_for(state='visible', timeout=5000)
                        await lupa.click()
                        print(f"[Open] ✓ Lupa clickeada ({selector})")
                        await asyncio.sleep(4)  # Más tiempo para cargar
                        lupa_clicked = True
                        break
                    except:
                        continue
            except Exception as e:
                print(f"[Open] Selector {selector} falló: {e}")
                continue
        
        if not lupa_clicked:
            print("[Open] ✗ No se encontró el botón de visualizar")
            # Screenshot para debug
            try:
                await page.screenshot(path="/tmp/chubb_no_lupa.png")
                print("[Open] Screenshot guardado: /tmp/chubb_no_lupa.png")
            except:
                pass
            return False
        
        # Esperar a que cargue la página del expediente
        await asyncio.sleep(3)
        
        # Manejar modal de confirmación "Sí" (si aparece)
        try:
            # Esperar un momento a que aparezca el modal
            await asyncio.sleep(2)
            
            btn_si_selectors = [
                'button:has-text("Si")',
                'button:has-text("Sí")',
                '.ui-button:has-text("Si")',
                'button.ui-button:has-text("Si")'
            ]
            
            for selector in btn_si_selectors:
                try:
                    btn_si = page.locator(selector).first
                    if await btn_si.count() > 0 and await btn_si.is_visible():
                        await btn_si.click()
                        print("[Open] ✓ Modal confirmación aceptado")
                        await asyncio.sleep(4)
                        break
                except:
                    continue
        except Exception as e:
            print(f"[Open] Nota: No se detectó modal de confirmación: {e}")
        
        # Esperar a que cargue completamente
        await asyncio.sleep(3)
        
        return True
            
    except Exception as e:
        print(f"[Open] Error: {e}")
        import traceback
        print(f"[Open] Traceback: {traceback.format_exc()}")
        return False


async def navigate_to_inpart(page: Page) -> bool:
    """Navega a la pestaña Inpart."""
    try:
        print("[Inpart] Navegando a pestaña Inpart...")
        
        # Esperar un momento para que carguen las tabs
        await asyncio.sleep(2)
        
        # Buscar la tab con varios selectores
        tab_selectors = [
            '#tabAsmtInpartInt',
            'a:has-text("Inpart")',
            'li:has-text("Inpart")',
            '[id*="Inpart"]'
        ]
        
        for selector in tab_selectors:
            try:
                tab = page.locator(selector).first
                if await tab.count() > 0:
                    # Verificar si es visible
                    is_visible = await tab.is_visible()
                    if is_visible:
                        await tab.click()
                        await asyncio.sleep(4)  # Dar más tiempo para cargar
                        print(f"[Inpart] ✓ Tab Inpart seleccionado ({selector})")
                        return True
            except:
                continue
        
        # Si no encontramos la tab, puede que no haya Inpart para este expediente
        print("[Inpart] ⚠ Tab Inpart no encontrada (puede que no haya piezas para este expediente)")
        
        # Screenshot para debug
        try:
            await page.screenshot(path="/tmp/chubb_no_inpart.png")
            print("[Inpart] Screenshot guardado: /tmp/chubb_no_inpart.png")
        except:
            pass
        
        return False
            
    except Exception as e:
        print(f"[Inpart] Error: {e}")
        return False


async def open_estatus_piezas(page: Page) -> bool:
    """Abre el modal de Estatus de Piezas."""
    try:
        print("[Estatus] Abriendo Estatus de Piezas...")
        
        btn_estatus = page.locator('#btnViewStatus')
        if await btn_estatus.count() > 0:
            await btn_estatus.click()
            await asyncio.sleep(3)
            print("[Estatus] ✓ Modal de Estatus de Piezas abierto")
            return True
        else:
            print("[Estatus] ✗ Botón Estatus de Piezas no encontrado")
            return False
            
    except Exception as e:
        print(f"[Estatus] Error: {e}")
        return False


async def extract_piezas_data(page: Page, num_expediente: str) -> List[Dict[str, Any]]:
    """Extrae los datos de la tabla de piezas."""
    piezas = []
    
    try:
        print("[Extract] Extrayendo datos de piezas...")
        
        # Esperar a que la tabla esté visible
        await page.wait_for_selector('#gridStatusOfParts tbody tr', timeout=10000)
        
        # Extraer datos de la tabla
        rows_result = await page.evaluate("""() => {
            const rows = document.querySelectorAll('#gridStatusOfParts tbody tr');
            const data = [];
            
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 18) {
                    data.push({
                        proveedor: cells[0]?.textContent?.trim() || '',
                        rfc_proveedor: cells[1]?.textContent?.trim() || '',
                        estado_proveedor: cells[2]?.textContent?.trim() || '',
                        descripcion: cells[3]?.textContent?.trim() || '',
                        precio: cells[4]?.textContent?.trim() || '',
                        estatus: cells[5]?.textContent?.trim() || '',
                        num_cotizacion: cells[6]?.textContent?.trim() || '',
                        num_orden: cells[7]?.textContent?.trim() || '',
                        fecha_envio_inpart: cells[8]?.textContent?.trim() || '',
                        fecha_pedido_generado: cells[9]?.textContent?.trim() || '',
                        fecha_promesa_entrega: cells[10]?.textContent?.trim() || '',
                        fecha_en_procesamiento: cells[11]?.textContent?.trim() || '',
                        fecha_entregado: cells[12]?.textContent?.trim() || '',
                        entregado_por: cells[13]?.textContent?.trim() || '',
                        fecha_recibido: cells[14]?.textContent?.trim() || '',
                        recibido_por: cells[15]?.textContent?.trim() || '',
                        fecha_cancelado_devuelto: cells[16]?.textContent?.trim() || '',
                        cancelado_devuelto_por: cells[17]?.textContent?.trim() || ''
                    });
                }
            });
            
            return data;
        }""")
        
        piezas = rows_result if rows_result else []
        print(f"[Extract] ✓ {len(piezas)} piezas extraídas")
        
    except Exception as e:
        print(f"[Extract] Error: {e}")
    
    return piezas


async def close_expediente_and_return(page: Page) -> bool:
    """Cierra el expediente y vuelve a la búsqueda."""
    try:
        print("[Close] Cerrando expediente...")
        
        # Click en botón Cerrar
        btn_cerrar_selectors = [
            'button:has-text("Cerrar")',
            'button:has-text("Close")',
            '.ui-button:has-text("Cerrar")',
            'input[value="Cerrar"]'
        ]
        
        for selector in btn_cerrar_selectors:
            try:
                btn_cerrar = page.locator(selector).first
                if await btn_cerrar.count() > 0 and await btn_cerrar.is_visible():
                    await btn_cerrar.click()
                    print("[Close] Botón Cerrar clickeado")
                    await asyncio.sleep(3)
                    break
            except:
                continue
        
        # En lugar de navegar por menú, ir directo a AdvancedSearch
        # Esto es más confiable
        await asyncio.sleep(2)
        
        # Verificar si ya estamos en AdvancedSearch
        exp_input = await page.locator('#ListFilters_0__ParameterValue').count()
        if exp_input > 0:
            print("[Close] ✓ Ya estamos en pantalla de búsqueda")
            return True
        
        # Si no, navegar directo
        print("[Close] Navegando directo a AdvancedSearch...")
        try:
            await page.goto('https://acg-prod-mx.audatex.com.mx/Audanet/AdvancedSearch', 
                          timeout=30000, wait_until='domcontentloaded')
            await asyncio.sleep(3)
            
            # Verificar
            exp_input = await page.locator('#ListFilters_0__ParameterValue').count()
            if exp_input > 0:
                print("[Close] ✓ Vuelto a pantalla de búsqueda")
                return True
        except Exception as e:
            print(f"[Close] Error navegando: {e}")
        
        print("[Close] ⚠ No se pudo confirmar regreso a búsqueda")
        return False
        
    except Exception as e:
        print(f"[Close] Error: {e}")
        return False


def parse_chubb_date(value):
    """Convierte fecha de formato CHUBB español a datetime."""
    if not value or value == '' or value == '-----' or value == '-':
        return None
    
    import re
    from datetime import datetime
    
    try:
        value = value.strip()
        
        # Patrón para fechas en español: DD/MM/YYYY HH:MM:SS a. m./p. m.
        pattern = r'(\d{2})/(\d{2})/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s+(a\.?\s*m\.?|p\.?\s*m\.?)'
        match = re.match(pattern, value, re.IGNORECASE)
        
        if match:
            day, month, year, hour, minute, second, ampm = match.groups()
            hour = int(hour)
            minute = int(minute)
            second = int(second)
            
            # Convertir a formato 24 horas
            ampm_clean = ampm.lower().replace('.', '').replace(' ', '')
            if ampm_clean == 'pm' and hour != 12:
                hour += 12
            elif ampm_clean == 'am' and hour == 12:
                hour = 0
            
            # Crear fecha en formato ISO
            dt = datetime(int(year), int(month), int(day), hour, minute, second)
            return dt.isoformat()
        
        return None
    except Exception:
        return None


async def save_piezas_to_db(num_expediente: str, piezas: List[Dict[str, Any]], 
                            fecha_extraccion: str) -> int:
    """Guarda las piezas extraídas en la tabla bitacora_piezas."""
    from app.core.db import get_connection
    
    if not piezas:
        return 0
    
    count = 0
    try:
        with get_connection() as conn:
            # Insertar piezas en bitacora_piezas
            for pieza in piezas:
                # Mapear estatus de CHUBB al formato de la bitácora
                estatus_chubb = pieza.get('estatus', '')
                estatus_map = {
                    'Recibido': 'Recibido',
                    'En Procesamiento': 'En Proceso',
                    'Entregado': 'Entregado',
                    'Cancelado': 'Cancelada',
                    'Devuelto': 'Cancelada'
                }
                estatus = estatus_map.get(estatus_chubb, estatus_chubb)
                
                # Determinar tipo de registro basado en el estatus
                tipo_registro = 'Proceso de Surtido' if estatus not in ['Cancelada', 'Devuelto'] else 'Reasignada/Cancelada'
                
                # Generar id_externo único
                id_externo = f"CHUBB_{num_expediente}_{pieza.get('num_orden', count)}_{count}"
                
                # Fecha promesa
                fecha_promesa = parse_chubb_date(pieza.get('fecha_promesa_entrega'))
                
                # Fecha de estatus (usar fecha_entregado, fecha_recibido o fecha_en_procesamiento)
                fecha_estatus = None
                if estatus == 'Recibido':
                    fecha_estatus = parse_chubb_date(pieza.get('fecha_recibido'))
                elif estatus == 'Entregado':
                    fecha_estatus = parse_chubb_date(pieza.get('fecha_entregado'))
                elif estatus == 'En Proceso':
                    fecha_estatus = parse_chubb_date(pieza.get('fecha_en_procesamiento'))
                
                conn.execute("""
                    INSERT INTO bitacora_piezas (
                        nombre, origen, numero_parte, observaciones,
                        numero_orden, numero_reporte,
                        fecha_promesa, fecha_estatus, estatus,
                        ubicacion, recibido, entregado, portal,
                        fuente, tipo_registro, num_expediente, id_externo
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id_externo, fuente) DO UPDATE SET
                        nombre = EXCLUDED.nombre,
                        estatus = EXCLUDED.estatus,
                        fecha_promesa = EXCLUDED.fecha_promesa,
                        fecha_estatus = EXCLUDED.fecha_estatus,
                        recibido = EXCLUDED.recibido,
                        entregado = EXCLUDED.entregado,
                        updated_at = CURRENT_TIMESTAMP
                """, (
                    pieza.get('descripcion', 'Sin descripción')[:250],
                    pieza.get('proveedor', 'CHUBB'),
                    None,  # numero_parte (no viene en CHUBB)
                    f"Cotización: {pieza.get('num_cotizacion', 'N/A')}",
                    pieza.get('num_orden'),
                    num_expediente,  # numero_reporte = num_expediente para CHUBB
                    fecha_promesa,
                    fecha_estatus,
                    estatus,
                    'ND',  # ubicación por defecto
                    estatus == 'Recibido',
                    estatus == 'Entregado',
                    True,  # portal = true para CHUBB
                    'CHUBB',
                    tipo_registro,
                    num_expediente,
                    id_externo
                ))
                count += 1
            
            conn.commit()
            
            print(f"[DB] ✓ {count} piezas guardadas en bitacora_piezas")
            
    except Exception as e:
        print(f"[DB] Error guardando piezas: {e}")
        import traceback
        print(f"[DB] Traceback: {traceback.format_exc()}")
    
    return count


async def process_single_expediente(page: Page, expediente: Dict[str, Any], 
                                    fecha_extraccion: str, fecha_desde: str = None) -> Dict[str, Any]:
    """Procesa un solo expediente extrayendo sus piezas."""
    num_exp = expediente['num_expediente']
    print(f"\n{'='*60}")
    print(f"Procesando expediente: {num_exp}")
    print(f"{'='*60}")
    
    result = {
        'num_expediente': num_exp,
        'success': False,
        'piezas_count': 0,
        'error': None
    }
    
    try:
        # 1. Buscar expediente (con fecha_desde para filtrar)
        if not await search_expediente(page, num_exp, fecha_desde):
            result['error'] = 'Expediente no encontrado'
            return result
        
        # 2. Abrir detalle
        if not await open_expediente_details(page):
            result['error'] = 'No se pudo abrir el expediente'
            return result
        
        # 3. Navegar a Inpart
        if not await navigate_to_inpart(page):
            result['error'] = 'No se pudo navegar a Inpart'
            # Cerrar y volver
            await close_expediente_and_return(page)
            return result
        
        # 4. Abrir Estatus de Piezas
        if not await open_estatus_piezas(page):
            result['error'] = 'No se pudo abrir Estatus de Piezas'
            # Cerrar y volver
            await close_expediente_and_return(page)
            return result
        
        # 5. Extraer piezas
        piezas = await extract_piezas_data(page, num_exp)
        
        # 6. Guardar en BD
        count = await save_piezas_to_db(num_exp, piezas, fecha_extraccion)
        
        result['success'] = True
        result['piezas_count'] = count
        
        # 7. Cerrar y volver
        await close_expediente_and_return(page)
        
    except Exception as e:
        result['error'] = str(e)
        print(f"[Process] Error procesando {num_exp}: {e}")
        # Intentar cerrar y volver
        await close_expediente_and_return(page)
    
    return result


async def run_piezas_extraction(headless: bool = True, use_db: bool = True, fecha_desde: str = "2026-01-01", max_expedientes: int = None):
    """Ejecuta la extracción completa de piezas."""
    print("="*70)
    print("RPA CHUBB - EXTRACCIÓN DE PIEZAS (INPART)")
    print("="*70)
    print(f"[Init] Fecha desde: {fecha_desde}")
    
    # Obtener expedientes pendientes
    print("\n[Init] Obteniendo expedientes pendientes...")
    expedientes = await get_expedientes_pendientes()
    
    # Limitar expedientes si se especifica
    if max_expedientes and len(expedientes) > max_expedientes:
        expedientes = expedientes[:max_expedientes]
        print(f"[Init] Limitado a {max_expedientes} expedientes")
    
    if not expedientes:
        print("[Init] No hay expedientes pendientes para procesar")
        return {
            'success': True,
            'message': 'No hay expedientes pendientes',
            'processed': 0,
            'errors': []
        }
    
    print(f"[Init] {len(expedientes)} expedientes pendientes del 2026 encontrados (más recientes primero)")
    
    fecha_extraccion = datetime.now().isoformat()
    results = []
    errors = []
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=headless,
            args=["--no-sandbox", "--disable-blink-features=AutomationControlled"]
        )
        
        context = await browser.new_context(viewport={"width": 1920, "height": 1080})
        page = await context.new_page()
        
        # Stealth no disponible en este entorno
        
        try:
            # Configurar handler para alert de sesión ANTES del login
            session_alert_handler = None
            
            def handle_dialog(dialog):
                print(f"[DialogHandler] {dialog.type}: {dialog.message[:80]}...")
                if any(keyword in dialog.message.lower() for keyword in ['sesión', 'terminal', 'otro equipo']):
                    print("[DialogHandler] ✓ Alert de sesión previa - Aceptando")
                    asyncio.create_task(dialog.accept())
                else:
                    asyncio.create_task(dialog.accept())
            
            page.on('dialog', handle_dialog)
            
            # Login
            if not await do_login(page, use_db=use_db):
                raise RuntimeError("Login fallido")
            
            # Esperar un momento por si aparece alert de sesión
            await asyncio.sleep(3)
            
            # Remover handler temporal
            page.remove_listener('dialog', handle_dialog)
            
            # Manejar modal post-login (billing)
            await handle_billing_modal(page)
            
            # Esperar a que la página cargue completamente
            print("[Init] Esperando carga completa de la página...")
            await asyncio.sleep(5)
            
            # Navegar directamente a Búsqueda Avanzada
            print("[Init] Navegando a Búsqueda Avanzada...")
            search_page_ok = await navigate_to_advanced_search(page)
            if not search_page_ok:
                print("[Init] ⚠ No se pudo navegar a Búsqueda Avanzada")
                # Tomar screenshot para debugging
                try:
                    await page.screenshot(path="/tmp/chubb_error_navigate.png")
                    print("[Init] Screenshot guardado: /tmp/chubb_error_navigate.png")
                except:
                    pass
            
            # Procesar cada expediente
            for idx, expediente in enumerate(expedientes, 1):
                print(f"\n[Progress] {idx}/{len(expedientes)}")
                
                result = await process_single_expediente(page, expediente, fecha_extraccion, fecha_desde)
                results.append(result)
                
                if result['error']:
                    errors.append(f"{expediente['num_expediente']}: {result['error']}")
                
                # Pequeña pausa entre expedientes
                await asyncio.sleep(2)
            
        except Exception as e:
            print(f"\n[Error] {e}")
            
        finally:
            # Logout
            try:
                await page.evaluate("LogOff()")
                print("\n[Cleanup] Sesión cerrada")
            except:
                pass
            
            await browser.close()
    
    # Resumen
    successful = sum(1 for r in results if r['success'])
    total_piezas = sum(r['piezas_count'] for r in results)
    
    print("\n" + "="*70)
    print("RESUMEN DE EXTRACCIÓN")
    print("="*70)
    print(f"Expedientes procesados: {len(results)}")
    print(f"Exitosos: {successful}")
    print(f"Errores: {len(errors)}")
    print(f"Total piezas extraídas: {total_piezas}")
    
    if errors:
        print("\nErrores:")
        for error in errors:
            print(f"  - {error}")
    
    return {
        'success': True,
        'expedientes_processed': len(results),
        'successful': successful,
        'errors': errors,
        'total_piezas': total_piezas,
        'results': results
    }


def main():
    parser = argparse.ArgumentParser(description="RPA CHUBB - Extracción de Piezas (Inpart)")
    parser.add_argument("--headless", action="store_true", help="Modo headless")
    parser.add_argument("--use-db", action="store_true", default=True, 
                       help="Usar credenciales desde la base de datos")
    parser.add_argument("--fecha-desde", type=str, default="2026-01-01",
                       help="Fecha desde la cual buscar expedientes (YYYY-MM-DD)")
    parser.add_argument("--max-expedientes", type=int, default=None,
                       help="Máximo número de expedientes a procesar")
    args = parser.parse_args()
    
    result = asyncio.run(run_piezas_extraction(
        headless=args.headless,
        use_db=args.use_db,
        fecha_desde=args.fecha_desde,
        max_expedientes=args.max_expedientes
    ))
    
    print("\n[Done] Extracción completada")
    print(f"Resultado: {json.dumps(result, indent=2, default=str)}")


if __name__ == "__main__":
    main()
