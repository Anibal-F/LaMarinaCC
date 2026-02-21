"""
Workflow completo: Login automático en CHUBB / Audatex (Solera).

Uso:
    python3 -m app.rpa.chubb_full_workflow
    
Opciones:
    --skip-login    Usar sesión existente (más rápido)
    --headless      Ejecutar sin ventana visible
    --save-json     Guardar datos en archivo JSON
    --use-db        Usar credenciales desde la base de datos (por defecto)
    --use-env       Usar credenciales desde archivo .env
"""

import argparse
import asyncio
import json
import os
from pathlib import Path

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
        print("[Credentials] No se encontraron en DB, usando .env como fallback...")
    
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


async def is_logged_in(page):
    """Verifica si el login fue exitoso mediante múltiples criterios."""
    current_url = page.url
    
    # Criterio 1: No estamos en la página de login
    is_login_page = "/Site/Login" in current_url
    
    # Criterio 2: Buscar elementos del dashboard/página principal
    dashboard_indicators = [
        '.dashboard',
        '.menu',
        '.navbar',
        '#main-content',
        '.container-fluid',
        'nav',
    ]
    
    dashboard_found = False
    for indicator in dashboard_indicators:
        try:
            count = await page.locator(indicator + ':visible').count()
            if count > 0:
                dashboard_found = True
                break
        except:
            continue
    
    # Criterio 3: Verificar que el formulario de login ya NO está visible
    login_form_visible = await page.locator('#loginB2C:visible, #loginForm:visible, #Password:visible').count() > 0
    
    return (not is_login_page and not login_form_visible) or dashboard_found


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
    try:
        # Verificar que el botón existe y está habilitado
        btn_locator = page.locator('#btnEnter')
        btn_exists = await btn_locator.count() > 0
        
        if btn_exists:
            is_enabled = await btn_locator.is_enabled()
            print(f"[Login] Botón btnEnter existe y está habilitado: {is_enabled}")
            
            # Hacer click con más tiempo de espera
            await btn_locator.click(timeout=10000)
            print("[Login] ✓ ACEPTAR clickeado")
        else:
            print("[Login] Botón btnEnter no encontrado, intentando alternativas...")
            # Fallback a input[type="submit"]
            submit_btn = page.locator('input[type="submit"]:visible').first
            if await submit_btn.count() > 0:
                await submit_btn.click()
                print("[Login] ✓ Botón submit clickeado")
            else:
                # JavaScript
                print("[Login] Usando JavaScript para enviar formulario...")
                await page.evaluate("""() => {
                    const form = document.getElementById('loginForm');
                    if (form) {
                        // Disparar evento submit manualmente
                        const event = new Event('submit', { bubbles: true, cancelable: true });
                        form.dispatchEvent(event);
                        // También intentar submit directo
                        setTimeout(() => form.submit(), 100);
                        return true;
                    }
                    return false;
                }""")
                print("[Login] ✓ Formulario enviado vía JavaScript")
            
    except Exception as e:
        print(f"[Login] ✗ Error clickeando ACEPTAR: {e}")
        await take_screenshot(page, "error_aceptar")
        return False
    
    # ============================================
    # PASO 3: Esperar navegación post-login
    # ============================================
    print("[Login] Esperando navegación post-login...")
    
    # Esperar hasta 20 segundos para la navegación
    for i in range(20):
        await asyncio.sleep(1)
        
        if await is_logged_in(page):
            print(f"[Login] ✓ Login detectado después de {i+1} segundos")
            break
        
        if i == 19:
            print("[Login] ⚠ Timeout esperando navegación")
    
    try:
        await page.wait_for_load_state("networkidle", timeout=10000)
    except:
        pass
    
    await take_screenshot(page, "05_post_login")
    
    # Manejar volante de billing si aparece
    billing_handled = await handle_billing_message(page)
    if billing_handled:
        print("[Login] ✓ Volante procesado")
        await take_screenshot(page, "06_after_billing")
    
    # Verificación final de login
    login_success = await is_logged_in(page)
    
    if login_success:
        print("[Login] ✓ Login exitoso!")
    else:
        print("[Login] ✗ Login fallido")
        await take_screenshot(page, "error_login_failed")
    
    return login_success


async def run_workflow(skip_login: bool = False, headless: bool = False, 
                       save_json: bool = False, use_db: bool = True):
    """Ejecuta el workflow completo."""
    
    session_path = Path(__file__).resolve().parent / "sessions" / "chubb_session.json"
    
    print("=" * 60)
    print("CHUBB/AUDATEX - WORKFLOW COMPLETO")
    print("=" * 60)
    
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
            
            print("\n" + "=" * 60)
            print("✓ WORKFLOW COMPLETADO")
            print("=" * 60)
            
            if not headless:
                print("\n[Navegador abierto 60 segundos...]")
                await asyncio.sleep(60)
            
            return True
            
        except Exception as e:
            await take_screenshot(page, "error_final")
            raise e
            
        finally:
            await context.close()
            await browser.close()


def main():
    parser = argparse.ArgumentParser(description="CHUBB/Audatex - Workflow Completo")
    parser.add_argument("--skip-login", action="store_true", help="Usar sesión existente")
    parser.add_argument("--headless", action="store_true", help="Modo headless")
    parser.add_argument("--save-json", action="store_true", help="Guardar datos en JSON")
    parser.add_argument("--use-db", action="store_true", default=True, help="Usar credenciales desde la base de datos (default)")
    parser.add_argument("--use-env", action="store_true", help="Usar credenciales desde archivo .envChubb")
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
        asyncio.run(run_workflow(
            skip_login=args.skip_login,
            headless=args.headless,
            save_json=args.save_json,
            use_db=use_db
        ))
    except KeyboardInterrupt:
        print("\n[Interrumpido]")
    except Exception as e:
        print(f"\n[Error] {e}")
        raise


if __name__ == "__main__":
    main()
