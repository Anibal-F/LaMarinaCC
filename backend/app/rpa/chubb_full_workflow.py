"""
Workflow completo: Login automático en CHUBB / Audatex (Solera) y extracción de expedientes.

Uso:
    python3 -m app.rpa.chubb_full_workflow
    
Opciones:
    --skip-login    Usar sesión existente (más rápido)
    --headless      Ejecutar sin ventana visible
    --save-json     Guardar datos en archivo JSON
    --use-db        Usar credenciales desde la base de datos (por defecto)
    --use-env       Usar credenciales desde archivo .env
    --extract-data  Extraer datos de expedientes de todas las páginas
"""

import argparse
import asyncio
import json
import os
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any, Optional

from dotenv import load_dotenv
from playwright.async_api import async_playwright
from playwright_stealth import Stealth


# Cargar variables de entorno (fallback)
backend_dir = Path(__file__).resolve().parents[2]
env_chubb = backend_dir / ".envChubb"
if env_chubb.exists():
    load_dotenv(dotenv_path=env_chubb, override=True)


# Intentar importar helper de credenciales
try:
    from app.rpa.credentials_helper import setup_chubb_env, get_chubb_credentials
    CREDENTIALS_HELPER_AVAILABLE = True
except ImportError:
    CREDENTIALS_HELPER_AVAILABLE = False
    print("[Warning] No se pudo importar credentials_helper, se usará .env")


def load_credentials(use_db=True):
    """Carga credenciales desde DB o .env según configuración."""
    if use_db and CREDENTIALS_HELPER_AVAILABLE:
        print("[Credentials] Intentando cargar desde base de datos...")
        if setup_chubb_env():
            return True
        print("[Credentials] Usando credenciales desde archivo .envChubb")
    else:
        print("[Credentials] Usando credenciales desde archivo .envChubb")
    
    # Usar .env (ya cargado arriba)
    return bool(os.getenv("CHUBB_USER"))


def get_credential(key: str, use_db: bool = True) -> str:
    """Obtiene una credencial, priorizando DB si está disponible."""
    if use_db and CREDENTIALS_HELPER_AVAILABLE:
        creds = get_chubb_credentials()
        if creds:
            mapping = {
                "CHUBB_LOGIN_URL": creds.get("plataforma_url"),
                "CHUBB_USER": creds.get("usuario"),
                "CHUBB_PASSWORD": creds.get("password"),
            }
            if key in mapping and mapping[key]:
                return mapping[key]
    
    # Fallback a .env
    return os.getenv(key, "")


async def take_screenshot(page, name):
    """Toma un screenshot para debugging."""
    try:
        screenshot_path = Path(__file__).resolve().parent / "sessions" / f"{name}.png"
        await page.screenshot(path=str(screenshot_path), full_page=True)
        print(f"[Screenshot] {name}.png guardado")
    except Exception as e:
        print(f"[Screenshot] Error: {e}")


async def handle_cookie_banner(page):
    """Maneja el banner de cookies si aparece."""
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
                    print("[Cookies] ✓ Banner de cookies aceptado")
                    await asyncio.sleep(1)
                    return True
            except:
                continue
        return False
    except:
        return False


async def handle_billing_message(page):
    """Maneja el volante/mensaje de billing post-login."""
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


async def handle_multiple_session_modal(page) -> bool:
    """
    Maneja el modal de sesión múltiple que aparece cuando hay otra sesión abierta.
    Retorna True si se manejó el modal.
    """
    try:
        # Buscar el modal por su texto característico
        modal_texts = [
            "ya ha iniciado sesión en otro terminal",
            "Desea continuar",
            "inicio de sesión previo se volverá inválido"
        ]
        
        for text in modal_texts:
            try:
                modal = page.locator(f'text={text}').first
                count = await modal.count()
                if count > 0:
                    is_visible = await modal.is_visible()
                    if is_visible:
                        print(f"[Session Modal] Detectado modal de sesión múltiple ('{text}')")
                        
                        # Buscar botón Aceptar/Continuar
                        accept_buttons = [
                            'button:has-text("Aceptar")',
                            'button:has-text("Continuar")',
                            'button:has-text("Sí")',
                            '.modal-footer button:last-child',
                            '.btn-primary'
                        ]
                        
                        for btn_selector in accept_buttons:
                            try:
                                btn = page.locator(btn_selector).first
                                if await btn.count() > 0 and await btn.is_visible():
                                    await btn.click()
                                    print("[Session Modal] ✓ Click en 'Aceptar' para continuar")
                                    await asyncio.sleep(2)
                                    return True
                            except:
                                continue
                                
                        # Si no encontramos el botón específico, hacer click en cualquier botón visible del modal
                        try:
                            any_button = page.locator('.modal button, .modal-footer button').first
                            if await any_button.count() > 0:
                                await any_button.click()
                                print("[Session Modal] ✓ Click en botón del modal")
                                await asyncio.sleep(2)
                                return True
                        except:
                            pass
            except Exception as inner_e:
                # Ignorar errores de elementos individuales
                continue
                    
        return False
        
    except Exception as e:
        print(f"[Session Modal] Error: {e}")
        return False


async def do_logout(page) -> bool:
    """
    Realiza logout para liberar la sesión.
    Esto evita el problema de sesiones múltiples.
    """
    try:
        print("[Logout] Intentando cerrar sesión...")
        
        # Opción 1: Ejecutar la función JavaScript LogOff() directamente
        try:
            await page.evaluate("() => { if (typeof LogOff === 'function') { LogOff(); return true; } return false; }")
            print("[Logout] ✓ LogOff() ejecutado via JavaScript")
            await asyncio.sleep(3)
            return True
        except:
            pass
        
        # Opción 2: Buscar el link de Log Off por su onclick
        logoff_link = page.locator('a[onclick*="LogOff"]').first
        if await logoff_link.count() > 0 and await logoff_link.is_visible():
            await logoff_link.click()
            print("[Logout] ✓ Click en link Log Off")
            await asyncio.sleep(3)
            return True
        
        # Opción 3: Buscar por texto "Log Off"
        logout_selectors = [
            'a:has-text("Log Off")',
            'a:has-text("Cerrar sesión")',
            'a:has-text("Logout")',
            'a:has-text("Salir")',
            'button:has-text("Cerrar sesión")',
            '.logout',
            '.btn-logout',
            '[href*="logout"]',
            '[href*="Login"]'
        ]
        
        for selector in logout_selectors:
            try:
                logout_btn = page.locator(selector).first
                if await logout_btn.count() > 0 and await logout_btn.is_visible():
                    await logout_btn.click()
                    print("[Logout] ✓ Sesión cerrada")
                    await asyncio.sleep(3)
                    return True
            except:
                continue
        
        # Opción 4: Si no encontramos botón, navegar directamente al login
        print("[Logout] Navegando al login para invalidar sesión...")
        await page.goto("https://acg-prod-mx.audatex.com.mx/Audanet/Site/Login")
        await asyncio.sleep(3)
        return True
        
    except Exception as e:
        print(f"[Logout] Error: {e}")
        return False


async def is_logged_in(page, verbose=True):
    """Verifica si el login fue exitoso mediante múltiples criterios."""
    current_url = page.url
    
    # Criterio 1: No estamos en la página de login
    is_login_page = "/Site/Login" in current_url or "/Login" in current_url
    
    # Criterio 2: Buscar elementos específicos de CHUBB/Audatex post-login
    dashboard_indicators = [
        '#gridMyWorks',           # Tabla principal de expedientes
        '#ui-id-3',               # Acordeón Mi Trabajo
        '.ui-accordion',          # Acordeón
        '#formFilters',           # Formulario de filtros
        '#contentGrid',           # Contenido principal
        '#pageResults',           # Resultados de página
        'a:has-text("Log Off")',  # Link de logout
        'a:has-text("Cerrar sesión")',
        '.navbar-nav',            # Barra de navegación
        '#btnBillingMessage',     # Botón de billing (si aparece)
        'text=MI TRABAJO',        # Menú Mi Trabajo
        'text=Mi Trabajo',
    ]
    
    dashboard_found = False
    found_element = None
    for indicator in dashboard_indicators:
        try:
            count = await page.locator(indicator).count()
            if count > 0:
                found_element = indicator
                dashboard_found = True
                break
        except Exception as e:
            # Ignorar errores de contexto destruido
            continue
    
    # Criterio 3: Verificar que el formulario de login ya NO está visible
    try:
        login_b2c = await page.locator('#loginB2C:visible').count()
        login_form = await page.locator('#loginForm:visible').count()
        password_field = await page.locator('#Password:visible').count()
        login_form_visible = (login_b2c + login_form + password_field) > 0
        
        if verbose and login_form_visible:
            print(f"[Login Check] Formulario visible - loginB2C:{login_b2c}, loginForm:{login_form}, Password:{password_field}")
    except Exception as e:
        if verbose:
            print(f"[Login Check] Error verificando formulario: {e}")
        login_form_visible = False
    
    # Criterio 4: La URL contiene indicadores de estar logueado
    logged_in_url_indicators = [
        '/Home',
        '/Dashboard',
        '/Work',
    ]
    
    url_indicates_logged_in = any(indicator in current_url for indicator in logged_in_url_indicators)
    
    # NUEVO: Si estamos en /Audanet/ sin /Site/Login y NO hay formulario visible, es login exitoso
    is_audanet_root = current_url.rstrip('/').endswith('/Audanet')
    alt_login_success = is_audanet_root and not login_form_visible and not is_login_page
    
    result = (not is_login_page and not login_form_visible) or dashboard_found or url_indicates_logged_in or alt_login_success
    
    if verbose:
        print(f"[Login Check] URL: {current_url}")
        print(f"[Login Check] is_login_page: {is_login_page}, login_form_visible: {login_form_visible}")
        print(f"[Login Check] dashboard_found: {dashboard_found} ({found_element or 'N/A'})")
        print(f"[Login Check] url_indicates_logged_in: {url_indicates_logged_in}, alt_login_success: {alt_login_success}")
        print(f"[Login Check] Result: {result}")
    
    return result


async def do_login(page, use_db: bool = True) -> bool:
    """Realiza el login automático en CHUBB/Audatex."""
    login_url = get_credential("CHUBB_LOGIN_URL", use_db) or "https://acg-prod-mx.audatex.com.mx/Audanet/"
    user = get_credential("CHUBB_USER", use_db)
    password = get_credential("CHUBB_PASSWORD", use_db)
    
    if not user or not password:
        print("[Login] ✗ Error: No se encontraron credenciales de CHUBB")
        print("[Login] Asegúrate de configurarlas en Admin → Credenciales o en el archivo .envChubb")
        return False
    
    print("[Login] Navegando a CHUBB/Audatex...")
    await page.goto(login_url, wait_until="domcontentloaded")
    await asyncio.sleep(3)
    
    await take_screenshot(page, "01_inicial")
    
    # PASO 0: Manejar banner de cookies
    print("[Login] Verificando banner de cookies...")
    await handle_cookie_banner(page)
    await asyncio.sleep(1)
    
    # ============================================
    # PASO 1: Primera pantalla - Usuario
    # ============================================
    print("[Login] PASO 1: Ingresando usuario...")
    
    try:
        await page.wait_for_selector('#loginB2C', timeout=10000)
        print("[Login] ✓ Formulario B2C encontrado")
    except Exception as e:
        print(f"[Login] ✗ No se encontró formulario B2C: {e}")
        await take_screenshot(page, "error_no_form_b2c")
        return False
    
    # Llenar usuario
    await page.fill('#UserName', user)
    print("[Login] ✓ Usuario ingresado")
    await asyncio.sleep(0.5)
    
    # Marcar checkbox de términos
    print("[Login] Marcando términos y condiciones...")
    try:
        terms = page.locator('#AccpetTerms').first
        if await terms.count() > 0:
            is_checked = await terms.is_checked()
            if not is_checked:
                await terms.click()
                print("[Login] ✓ Términos aceptados")
            else:
                print("[Login] Términos ya marcados")
    except Exception as e:
        print(f"[Login] ⚠ Error con checkbox: {e}")
    
    await asyncio.sleep(1)
    await take_screenshot(page, "02_usuario_ingresado")
    
    # Click en botón NEXT
    print("[Login] Clic en botón NEXT...")
    try:
        await page.click('#btnNext')
        print("[Login] ✓ NEXT clickeado")
    except Exception as e:
        print(f"[Login] ✗ Error clickeando NEXT: {e}")
        await take_screenshot(page, "error_next")
        return False
    
    # ESPERAR A QUE CARGUE LA SEGUNDA PANTALLA
    print("[Login] Esperando transición al formulario de contraseña...")
    await asyncio.sleep(3)
    
    # ============================================
    # PASO 2: Segunda pantalla - Contraseña
    # ============================================
    print("[Login] PASO 2: Verificando formulario de contraseña...")
    
    try:
        await page.wait_for_selector('#loginForm:visible', timeout=10000)
        print("[Login] ✓ Formulario loginForm visible")
    except:
        print("[Login] ⚠ Formulario loginForm no está visible")
    
    # Verificar cuántos campos de contraseña hay
    password_fields = await page.locator('input[type="password"]').count()
    print(f"[Login] Total campos password en página: {password_fields}")
    
    password_field_visible = await page.locator('#Password:visible').count()
    print(f"[Login] Campos password visibles: {password_field_visible}")
    
    if password_field_visible == 0:
        print("[Login] ✗ No hay campo de contraseña visible")
        await take_screenshot(page, "error_no_password_field")
        return False
    
    await asyncio.sleep(1)
    await take_screenshot(page, "03_password_screen")
    
    # Ingresar contraseña con método más robusto
    print("[Login] Ingresando contraseña...")
    try:
        # Enfocar el campo primero
        await page.focus('#Password')
        await asyncio.sleep(0.5)
        
        # Limpiar y llenar
        await page.fill('#Password', password)
        
        # Verificar inmediatamente después
        password_value = await page.locator('#Password').input_value()
        print(f"[Login] Valor del campo justo después de fill: '{password_value}' ({len(password_value)} chars)")
        
        # Si está vacío, intentar con type caracter por caracter
        if not password_value:
            print("[Login] Campo vacío, intentando con page.type...")
            await page.click('#Password')
            await asyncio.sleep(0.5)
            await page.type('#Password', password, delay=50)
            
            password_value = await page.locator('#Password').input_value()
            print(f"[Login] Valor después de type: '{password_value}' ({len(password_value)} chars)")
        
        # Verificar una última vez
        if not password_value:
            print("[Login] ✗ No se pudo ingresar la contraseña")
            await take_screenshot(page, "error_password_empty")
            return False
            
        print(f"[Login] ✓ Contraseña ingresada correctamente")
            
    except Exception as e:
        print(f"[Login] ✗ Error ingresando contraseña: {e}")
        await take_screenshot(page, "error_password_fill")
        return False
    
    # ESPERA IMPORTANTE: Dar tiempo a que JavaScript valide el campo
    print("[Login] Esperando 3 segundos para validación de contraseña...")
    await asyncio.sleep(3)
    
    # Verificar que la contraseña sigue estando ahí
    final_password = await page.locator('#Password').input_value()
    if not final_password:
        print("[Login] ⚠ La contraseña se borró, re-ingresando...")
        await page.fill('#Password', password)
        await asyncio.sleep(3)
    
    await take_screenshot(page, "04_password_filled")
    
    # Click en botón ACEPTAR
    print("[Login] Clic en botón ACEPTAR...")
    click_success = False
    initial_url = page.url
    
    try:
        # Verificar que el botón existe y está habilitado
        btn_locator = page.locator('#btnEnter')
        btn_exists = await btn_locator.count() > 0
        
        if btn_exists:
            is_enabled = await btn_locator.is_enabled()
            print(f"[Login] Botón btnEnter existe y está habilitado: {is_enabled}")
            
            # Hacer click y esperar navegación
            try:
                # Intentar esperar navegación
                async with page.expect_navigation(timeout=10000, wait_until="domcontentloaded"):
                    await btn_locator.click(timeout=5000)
                print("[Login] ✓ ACEPTAR clickeado, navegación detectada")
            except Exception as nav_err:
                # Si no detectamos navegación, hacer click sin esperar
                print(f"[Login] Navegación no detectada inmediatamente: {nav_err}")
                await btn_locator.click(timeout=5000, no_wait_after=True)
                print("[Login] ✓ ACEPTAR clickeado (sin espera de navegación)")
            
            click_success = True
        else:
            print("[Login] Botón btnEnter no encontrado, intentando alternativas...")
            # Fallback a input[type="submit"]
            submit_btn = page.locator('input[type="submit"]:visible').first
            if await submit_btn.count() > 0:
                await submit_btn.click(timeout=5000, no_wait_after=True)
                print("[Login] ✓ Botón submit clickeado")
                click_success = True
            else:
                # JavaScript
                print("[Login] Usando JavaScript para enviar formulario...")
                await page.evaluate("""() => {
                    const form = document.getElementById('loginForm');
                    if (form) {
                        form.submit();
                        return true;
                    }
                    return false;
                }""")
                print("[Login] ✓ Formulario enviado vía JavaScript")
                click_success = True
            
    except Exception as e:
        print(f"[Login] ⚠ Advertencia en click: {e}")
        print("[Login] Continuando de todos modos...")
        click_success = True  # Asumimos que el click se realizó
    
    if not click_success:
        await take_screenshot(page, "error_aceptar")
        return False
    
    # Pequeña pausa para permitir que la navegación inicie
    await asyncio.sleep(2)
    
    # Verificar si la URL cambió
    current_url = page.url
    if current_url != initial_url:
        print(f"[Login] URL cambió: {initial_url} → {current_url}")
    
    # ============================================
    # PASO 3: Manejar modal de sesión múltiple (si aparece)
    # ============================================
    print("[Login] Verificando modal de sesión múltiple...")
    try:
        session_modal_handled = await handle_multiple_session_modal(page)
        if session_modal_handled:
            print("[Login] Modal de sesión manejado, esperando navegación...")
            await asyncio.sleep(3)
    except Exception as e:
        print(f"[Login] Error verificando modal (posible navegación): {e}")
        # Esperar un poco más si hubo error de navegación
        await asyncio.sleep(5)
    
    # ============================================
    # PASO 4: Esperar navegación post-login
    # ============================================
    print("[Login] Esperando navegación post-login...")
    
    # Esperar a que la navegación ocurra (puede tardar varios segundos)
    print("[Login] Esperando 8 segundos para navegación inicial...")
    await asyncio.sleep(8)
    
    # Verificar estado inicial después de la navegación
    current_url = page.url
    print(f"[Login] URL después de navegación inicial: {current_url}")
    
    # Si estamos en /Audanet/ sin /Site/Login, verificar si es dashboard o error
    if '/Site/Login' not in current_url:
        print("[Login] URL cambió de /Site/Login, verificando contenido...")
        
        # Verificar si hay formulario de login visible
        try:
            login_form_count = await page.locator('#loginB2C:visible, #loginForm:visible, #Password:visible').count()
            print(f"[Login] Formularios de login visibles: {login_form_count}")
            
            if login_form_count == 0:
                # No hay formulario de login, probablemente estamos logueados
                print("[Login] No se detecta formulario de login, asumiendo login exitoso")
                login_detected = True
            else:
                # Hay formulario de login, puede ser error de credenciales
                print("[Login] Aún hay formulario de login visible, verificando errores...")
        except Exception as e:
            print(f"[Login] Error verificando formulario: {e}")
    
    # Si no detectamos login aún, continuar con verificación normal
    if not login_detected:
        # Esperar hasta 20 segundos adicionales para la navegación completa
        for i in range(20):
            await asyncio.sleep(1)
            
            # Verificar si apareció el modal de sesión durante la espera
            if i == 2:
                try:
                    if not session_modal_handled:
                        modal_appeared = await handle_multiple_session_modal(page)
                        if modal_appeared:
                            print("[Login] Modal de sesión apareció durante espera, continuando...")
                            await asyncio.sleep(3)
                except Exception as e:
                    print(f"[Login] Error verificando modal en espera: {e}")
            
            try:
                if await is_logged_in(page):
                    print(f"[Login] ✓ Login detectado después de {i+9} segundos")
                    login_detected = True
                    break
            except Exception as e:
                print(f"[Login] Error en verificación (intento {i+1}): {e}")
                continue
            
            if i == 19:
                print("[Login] ⚠ Timeout esperando navegación")
    
    # Si no se detectó login, verificar si hay error de credenciales
    if not login_detected:
        print("[Login] Verificando posibles errores...")
        
        # Verificar mensajes de error comunes
        error_selectors = [
            '.validation-summary-errors',
            '.field-validation-error',
            '[class*="error"]',
            'text=contraseña incorrecta',
            'text=password incorrect',
            'text=usuario no válido',
            'text=invalid user',
            '.alert-danger',
            '#error-message'
        ]
        
        for selector in error_selectors:
            try:
                error_elem = page.locator(selector).first
                if await error_elem.count() > 0:
                    error_text = await error_elem.text_content()
                    if error_text and error_text.strip():
                        print(f"[Login] ⚠ Error detectado: {error_text.strip()}")
            except:
                continue
        
        # Verificar si la URL es diferente pero seguimos en página de login
        current_url = page.url
        print(f"[Login] URL actual: {current_url}")
        
        # Si la URL es /Audanet/ sin /Site/Login, puede ser redirect por sesión inválida
        if current_url.rstrip('/').endswith('/Audanet'):
            print("[Login] ⚠ Posible redirección por sesión inválida o error de login")
            
            # Intentar esperar más tiempo por si hay redirección automática
            print("[Login] Esperando 10 segundos adicionales por posible redirección...")
            await asyncio.sleep(10)
            
            # Re-verificar login
            try:
                if await is_logged_in(page):
                    print("[Login] ✓ Login detectado después de espera extendida")
                    login_detected = True
            except:
                pass
    
    # Esperar a que la red se estabilice
    if login_detected:
        print("[Login] Esperando estabilización de red...")
        try:
            await page.wait_for_load_state("networkidle", timeout=15000)
        except:
            pass
        await asyncio.sleep(2)
    
    await take_screenshot(page, "05_post_login")
    
    # Manejar volante de billing si aparece
    billing_handled = await handle_billing_message(page)
    if billing_handled:
        print("[Login] ✓ Volante procesado")
        await take_screenshot(page, "06_after_billing")
    
    # Verificación final de login con reintentos
    print("[Login] Verificación final de login...")
    login_success = False
    
    for attempt in range(3):
        try:
            login_success = await is_logged_in(page)
            if login_success:
                break
        except Exception as e:
            print(f"[Login] Error en verificación {attempt + 1}: {e}")
        
        if not login_success and attempt < 2:
            print(f"[Login] Reintentando verificación en 3 segundos...")
            await asyncio.sleep(3)
    
    # Verificación alternativa: si la URL cambió y no hay formulario de login
    if not login_success:
        try:
            current_url = page.url
            login_form_visible = await page.locator('#loginB2C:visible, #loginForm:visible, #Password:visible').count() > 0
            
            if '/Site/Login' not in current_url and not login_form_visible:
                print("[Login] URL cambió y no hay formulario de login visible, asumiendo login exitoso")
                login_success = True
        except:
            pass
    
    if login_success:
        print("[Login] ✓ Login exitoso!")
    else:
        print("[Login] ✗ Login fallido")
        # Tomar screenshot del estado final para debug
        try:
            await take_screenshot(page, "error_login_failed")
            print(f"[Login] URL final: {page.url}")
        except:
            pass
    
    return login_success


# ============================================================================
# EXTRACCIÓN DE DATOS DE EXPEDIENTES
# ============================================================================

ESTADOS_FILTRO = {
    "por_autorizar": "Por Aprobar",
    "autorizadas": "Autorizado", 
    "rechazadas": "Rechazado",
    "complementos": "Complemento"
}


async def navigate_to_mi_trabajo(page):
    """Navega a la sección 'Mi Trabajo' donde está la tabla de expedientes."""
    try:
        print("[Extract] Navegando a Mi Trabajo...")
        
        # Buscar y hacer clic en "MI TRABAJO" en el menú
        mi_trabajo_selectors = [
            'a:has-text("MI TRABAJO")',
            'a[href*="Work"]:visible',
            '#ui-id-3',  # ID del acordeón según las capturas
            'h3:has-text("Trabajo del Sitio")'
        ]
        
        for selector in mi_trabajo_selectors:
            try:
                elem = page.locator(selector).first
                if await elem.count() > 0 and await elem.is_visible():
                    await elem.click()
                    print(f"[Extract] ✓ Click en Mi Trabajo ({selector})")
                    await asyncio.sleep(3)
                    return True
            except:
                continue
        
        # Si no encontramos el menú, verificar si ya estamos en la página correcta
        table_exists = await page.locator('#gridMyWorks').count() > 0
        if table_exists:
            print("[Extract] Tabla ya visible, no es necesario navegar")
            return True
        
        print("[Extract] ⚠ No se pudo navegar a Mi Trabajo")
        return False
        
    except Exception as e:
        print(f"[Extract] Error navegando a Mi Trabajo: {e}")
        return False


async def apply_estado_filter(page, estado_nombre: str) -> bool:
    """Aplica un filtro de estado en el acordeón."""
    try:
        print(f"[Extract] Aplicando filtro: {estado_nombre}")
        
        # Buscar el filtro en el acordeón
        # Según las capturas, los filtros están en elementos li con onclick="Search(this)"
        filter_selectors = [
            f'li:has-text("{estado_nombre}")',
            f'li.ui-widget-content:has-text("{estado_nombre}")',
            f'p:has-text("{estado_nombre}")',
        ]
        
        for selector in filter_selectors:
            try:
                elem = page.locator(selector).first
                if await elem.count() > 0 and await elem.is_visible():
                    await elem.click()
                    print(f"[Extract] ✓ Filtro '{estado_nombre}' aplicado")
                    await asyncio.sleep(3)  # Esperar carga de la tabla
                    return True
            except:
                continue
        
        # Si no funciona el click directo, intentar con JavaScript
        js_result = await page.evaluate(f"""(estado) => {{
            const items = document.querySelectorAll('li.ui-widget-content');
            for (const item of items) {{
                if (item.textContent.includes(estado)) {{
                    item.click();
                    return true;
                }}
            }}
            return false;
        }}""", estado_nombre)
        
        if js_result:
            print(f"[Extract] ✓ Filtro '{estado_nombre}' aplicado via JS")
            await asyncio.sleep(3)
            return True
        
        print(f"[Extract] ⚠ No se pudo aplicar filtro '{estado_nombre}'")
        return False
        
    except Exception as e:
        print(f"[Extract] Error aplicando filtro '{estado_nombre}': {e}")
        return False


async def get_total_records(page) -> int:
    """Obtiene el total de registros desde el texto de paginación."""
    try:
        # Buscar el texto "Mostrando registros del X al Y de un total de Z registros"
        pagination_text = await page.locator('#table-rateRelations_info').text_content()
        if pagination_text:
            # Extraer el número después de "total de"
            import re
            match = re.search(r'total de (\d+) registros', pagination_text)
            if match:
                return int(match.group(1))
        
        # Alternativa: contar filas de la tabla
        rows = await page.locator('#gridMyWorks tbody tr').count()
        return rows
        
    except Exception as e:
        print(f"[Extract] Error obteniendo total de registros: {e}")
        return 0


async def extract_table_data(page) -> List[Dict[str, Any]]:
    """Extrae los datos de la tabla actual."""
    try:
        print("[Extract] Extrayendo datos de tabla...")
        
        # Esperar a que la tabla esté visible
        await page.wait_for_selector('#gridMyWorks tbody tr', timeout=10000)
        
        # Extraer datos de todas las filas visibles
        rows_data = await page.evaluate("""() => {
            const rows = document.querySelectorAll('#gridMyWorks tbody tr');
            const data = [];
            
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 8) {
                    data.push({
                        num_expediente: cells[1]?.textContent?.trim() || '',
                        tipo_vehiculo: cells[2]?.textContent?.trim() || '',
                        fecha_accidente: cells[3]?.textContent?.trim() || '',
                        estado: cells[4]?.textContent?.trim() || '',
                        fecha_creacion: cells[5]?.textContent?.trim() || '',
                        fecha_inspeccion: cells[6]?.textContent?.trim() || '',
                        fecha_actualizacion: cells[7]?.textContent?.trim() || '',
                        placas: cells[8]?.textContent?.trim() || '',
                        asignado_a: cells[9]?.textContent?.trim() || '',
                        compania: cells[10]?.textContent?.trim() || ''
                    });
                }
            });
            
            return data;
        }""")
        
        print(f"[Extract] ✓ {len(rows_data)} filas extraídas de página actual")
        return rows_data
        
    except Exception as e:
        print(f"[Extract] Error extrayendo datos de tabla: {e}")
        return []


async def has_next_page(page) -> bool:
    """Verifica si hay página siguiente disponible."""
    try:
        # Buscar botón siguiente que NO esté disabled
        next_btn = page.locator('#table-rateRelations_next:not(.paginate_button_disabled)')
        return await next_btn.count() > 0 and await next_btn.is_visible()
    except:
        return False


async def go_to_next_page(page) -> bool:
    """Navega a la siguiente página."""
    try:
        next_btn = page.locator('#table-rateRelations_next').first
        if await next_btn.count() > 0 and await next_btn.is_visible():
            await next_btn.click()
            print("[Extract] → Navegando a siguiente página...")
            await asyncio.sleep(2)  # Esperar carga
            return True
        return False
    except Exception as e:
        print(f"[Extract] Error navegando a siguiente página: {e}")
        return False


async def extract_all_pages(page, estado_key: str) -> List[Dict[str, Any]]:
    """Extrae todos los datos de todas las páginas para un estado específico."""
    all_data = []
    page_num = 1
    max_pages = 50  # Límite de seguridad
    
    while page_num <= max_pages:
        print(f"[Extract] Procesando página {page_num}...")
        
        # Extraer datos de página actual
        page_data = await extract_table_data(page)
        
        # Agregar el estado como metadata
        for item in page_data:
            item['estado_categoria'] = estado_key
        
        all_data.extend(page_data)
        
        # Verificar si hay siguiente página
        if not await has_next_page(page):
            print(f"[Extract] No hay más páginas")
            break
        
        # Ir a siguiente página
        if not await go_to_next_page(page):
            break
        
        page_num += 1
    
    print(f"[Extract] ✓ Total de {len(all_data)} registros extraídos para {estado_key}")
    return all_data


async def extract_expedientes_data(page) -> Dict[str, Any]:
    """
    Extrae todos los expedientes de todos los estados.
    Navega por cada filtro de estado y extrae todas las páginas.
    """
    print("=" * 60)
    print("EXTRACCIÓN DE EXPEDIENTES CHUBB")
    print("=" * 60)
    
    # Navegar a Mi Trabajo
    if not await navigate_to_mi_trabajo(page):
        print("[Extract] ✗ No se pudo navegar a Mi Trabajo")
        return {"indicadores": {}, "expedientes": []}
    
    all_expedientes = []
    indicadores = {
        "por_autorizar": 0,
        "autorizadas": 0,
        "rechazadas": 0,
        "complementos": 0,
        "total": 0
    }
    
    # Extraer datos para cada estado
    for estado_key, estado_nombre in ESTADOS_FILTRO.items():
        print(f"\n{'='*40}")
        print(f"Procesando: {estado_nombre}")
        print(f"{'='*40}")
        
        # Aplicar filtro
        if not await apply_estado_filter(page, estado_nombre):
            print(f"[Extract] ⚠ Saltando {estado_nombre}")
            continue
        
        # Obtener total de registros para este estado
        total_records = await get_total_records(page)
        print(f"[Extract] Total registros en {estado_nombre}: {total_records}")
        indicadores[estado_key] = total_records
        
        # Extraer todos los datos de todas las páginas
        estado_data = await extract_all_pages(page, estado_key)
        all_expedientes.extend(estado_data)
        
        # Pequeña pausa entre estados
        await asyncio.sleep(1)
    
    indicadores["total"] = sum(indicadores.values()) - indicadores["total"]  # Corregir total
    indicadores["total"] = len(all_expedientes)
    
    print(f"\n{'='*60}")
    print(f"EXTRACCIÓN COMPLETADA")
    print(f"Total expedientes: {len(all_expedientes)}")
    print(f"  - Por Autorizar: {indicadores['por_autorizar']}")
    print(f"  - Autorizadas: {indicadores['autorizadas']}")
    print(f"  - Rechazadas: {indicadores['rechazadas']}")
    print(f"  - Complementos: {indicadores['complementos']}")
    print(f"{'='*60}")
    
    return {
        "indicadores": indicadores,
        "expedientes": all_expedientes
    }


def save_data_to_json(data: Dict[str, Any]) -> Path:
    """Guarda los datos extraídos en un archivo JSON."""
    data_dir = Path(__file__).resolve().parent / "data"
    data_dir.mkdir(exist_ok=True)
    
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    file_path = data_dir / f"chubb_data_{timestamp}.json"
    
    # Agregar metadata
    data['fecha_extraccion'] = datetime.now().isoformat()
    data['taller_id'] = 'CHUBB_LA_MARINA'
    data['taller_nombre'] = 'La Marina Collision Center'
    
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"[Data] ✓ Datos guardados en: {file_path}")
    return file_path


# ============================================================================
# WORKFLOW PRINCIPAL
# ============================================================================

async def run_workflow(skip_login: bool = False, headless: bool = False, 
                       save_json: bool = False, use_db: bool = True,
                       extract_data: bool = False):
    """Ejecuta el workflow completo."""
    
    session_path = Path(__file__).resolve().parent / "sessions" / "chubb_session.json"
    
    print("=" * 60)
    print("CHUBB/AUDATEX - WORKFLOW COMPLETO")
    print("=" * 60)
    
    extracted_data = None
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=headless,
            args=["--no-sandbox", "--disable-blink-features=AutomationControlled"]
        )
        
        if skip_login and session_path.exists():
            print("[Workflow] Usando sesión existente...")
            context = await browser.new_context(storage_state=str(session_path))
        else:
            print("[Workflow] Creando nuevo contexto...")
            context = await browser.new_context(viewport={"width": 1920, "height": 1080})
        
        page = await context.new_page()
        
        stealth = Stealth(navigator_languages_override=('es-MX', 'es'))
        await stealth.apply_stealth_async(page)
        
        try:
            if not skip_login or not session_path.exists():
                print("\n[1/2] LOGIN AUTOMÁTICO")
                success = await do_login(page, use_db=use_db)
                if not success:
                    raise RuntimeError("Login fallido - revisa los screenshots en /sessions/")
                
                storage = await context.storage_state()
                session_path.parent.mkdir(parents=True, exist_ok=True)
                with open(session_path, "w") as f:
                    json.dump(storage, f, indent=2)
                print(f"[Login] Sesión guardada")
            else:
                print("\n[1/2] NAVEGANDO CON SESIÓN EXISTENTE")
                await page.goto(get_credential("CHUBB_LOGIN_URL", use_db) or "https://acg-prod-mx.audatex.com.mx/Audanet/", wait_until="networkidle")
                await asyncio.sleep(2)
                await handle_billing_message(page)
            
            print("\n[2/2] SESIÓN ACTIVA")
            print(f"[Info] URL: {page.url}")
            print(f"[Info] Título: {await page.title()}")
            
            # Extraer datos si se solicita
            if extract_data:
                print("\n[3/3] EXTRAYENDO DATOS DE EXPEDIENTES")
                extracted_data = await extract_expedientes_data(page)
                
                # Guardar en JSON
                json_path = save_data_to_json(extracted_data)
                
                if save_json:
                    print(f"[Data] Archivo JSON: {json_path}")
            
            print("\n" + "=" * 60)
            print("✓ WORKFLOW COMPLETADO")
            print("=" * 60)
            
            if not headless:
                print("\n[Navegador abierto 60 segundos...]")
                await asyncio.sleep(60)
            
            return extracted_data or True
            
        except Exception as e:
            await take_screenshot(page, "error_final")
            raise e
            
        finally:
            # Logout para liberar la sesión (evita problemas de sesiones múltiples)
            print("\n[Cleanup] Cerrando sesión...")
            try:
                await do_logout(page)
            except Exception as e:
                print(f"[Cleanup] Error en logout: {e}")
            
            await context.close()
            await browser.close()
            print("[Cleanup] ✓ Recursos liberados")


def main():
    parser = argparse.ArgumentParser(description="CHUBB/Audatex - Workflow Completo")
    parser.add_argument("--skip-login", action="store_true", help="Usar sesión existente")
    parser.add_argument("--headless", action="store_true", help="Modo headless")
    parser.add_argument("--save-json", action="store_true", help="Guardar datos en JSON")
    parser.add_argument("--use-db", action="store_true", default=True, help="Usar credenciales desde la base de datos (default)")
    parser.add_argument("--use-env", action="store_true", help="Usar credenciales desde archivo .envChubb")
    parser.add_argument("--extract-data", action="store_true", help="Extraer datos de expedientes")
    args = parser.parse_args()
    
    # Determinar si usar DB o .env
    use_db = args.use_db and not args.use_env
    
    # Cargar credenciales
    if not load_credentials(use_db=use_db):
        print("[Error] No se pudieron cargar las credenciales de CHUBB")
        print("[Info] Verifica que:")
        print("  1. Tienes credenciales configuradas en Admin → Credenciales (para --use-db)")
        print("  2. O tienes el archivo .envChubb configurado (para --use-env)")
        return
    
    try:
        result = asyncio.run(run_workflow(
            skip_login=args.skip_login,
            headless=args.headless,
            save_json=args.save_json,
            use_db=use_db,
            extract_data=args.extract_data
        ))
        
        # Si se extrajeron datos, mostrar resumen
        if isinstance(result, dict) and 'indicadores' in result:
            print("\n[Resumen de datos extraídos:]")
            print(f"  Indicadores: {result['indicadores']}")
            print(f"  Total expedientes: {len(result['expedientes'])}")
            
    except KeyboardInterrupt:
        print("\n[Interrumpido]")
    except Exception as e:
        print(f"\n[Error] {e}")
        raise


if __name__ == "__main__":
    main()
