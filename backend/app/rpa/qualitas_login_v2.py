"""
RPA Qualitas v2 - Login 100% Automático con reCAPTCHA.

Flujo:
1. Navega al login
2. Llena credenciales
3. Envía reCAPTCHA a 2captcha para resolución
4. Inyecta el token recibido
5. Hace submit del formulario
"""

import argparse
import asyncio
import json
import os
import random
import time
from pathlib import Path

from dotenv import load_dotenv
from playwright.async_api import TimeoutError as PlaywrightTimeoutError
from playwright.async_api import async_playwright
from playwright_stealth import Stealth


# Cargar variables de entorno
backend_dir = Path(__file__).resolve().parents[2]
env_qualitas = backend_dir / ".envQualitas"
if env_qualitas.exists():
    load_dotenv(dotenv_path=env_qualitas, override=True)


async def solve_recaptcha_2captcha(site_key: str, page_url: str) -> str:
    """Resuelve reCAPTCHA usando 2captcha y retorna el token."""
    import aiohttp
    
    api_key = os.getenv("CAPTCHA_API_KEY")
    if not api_key:
        raise ValueError("CAPTCHA_API_KEY no configurada")
    
    async with aiohttp.ClientSession() as session:
        # Enviar CAPTCHA
        submit_url = "https://2captcha.com/in.php"
        payload = {
            "key": api_key,
            "method": "userrecaptcha",
            "googlekey": site_key,
            "pageurl": page_url,
            "json": 1,
        }
        
        async with session.post(submit_url, data=payload) as resp:
            result = await resp.json()
        
        if result.get("status") != 1:
            raise RuntimeError(f"2captcha error: {result.get('request')}")
        
        captcha_id = result["request"]
        print(f"[2captcha] CAPTCHA enviado, ID: {captcha_id}")
        
        # Esperar resultado
        result_url = "https://2captcha.com/res.php"
        for attempt in range(36):  # 3 minutos max
            await asyncio.sleep(5)
            
            params = {
                "key": api_key,
                "action": "get",
                "id": captcha_id,
                "json": 1,
            }
            
            async with session.get(result_url, params=params) as resp:
                result = await resp.json()
            
            if result.get("status") == 1:
                token = result["request"]
                print(f"[2captcha] ✓ Resuelto en {(attempt + 1) * 5}s")
                return token
            
            if result.get("request") != "CAPCHA_NOT_READY":
                raise RuntimeError(f"2captcha error: {result.get('request')}")
            
            print(f"[2captcha] Esperando... ({(attempt + 1) * 5}s)")
        
        raise TimeoutError("2captcha timeout")


async def inject_recaptcha_token(page, token: str) -> bool:
    """
    Inyecta el token de reCAPTCHA en el formulario.
    
    El token debe inyectarse en el textarea #g-recaptcha-response
    y luego disparar el callback de reCAPTCHA si existe.
    """
    print(f"[reCAPTCHA] Inyectando token ({len(token)} chars)...")
    
    # Script de inyección completo
    script = f"""
    (function() {{
        // 1. Inyectar token en el textarea
        var responseElement = document.getElementById('g-recaptcha-response');
        if (!responseElement) {{
            responseElement = document.createElement('textarea');
            responseElement.id = 'g-recaptcha-response';
            responseElement.name = 'g-recaptcha-response';
            responseElement.style.display = 'none';
            document.body.appendChild(responseElement);
        }}
        responseElement.value = '{token}';
        responseElement.innerHTML = '{token}';
        
        // 2. Disparar evento de cambio
        var event = new Event('change', {{ bubbles: true }});
        responseElement.dispatchEvent(event);
        
        // 3. Intentar encontrar y llamar al callback de reCAPTCHA
        if (typeof grecaptcha !== 'undefined') {{
            try {{
                // Método 1: Llamar al callback directamente
                var widgets = Object.keys(___grecaptcha_cfg.clients || {{}});
                for (var i = 0; i < widgets.length; i++) {{
                    var client = ___grecaptcha_cfg.clients[widgets[i]];
                    if (client && client.O && client.O.callback) {{
                        client.O.callback('{token}');
                        return 'callback_called';
                    }}
                }}
            }} catch(e) {{}}
        }}
        
        return 'token_injected';
    }})();
    """
    
    result = await page.evaluate(script)
    print(f"[reCAPTCHA] Resultado: {result}")
    
    # Esperar un momento para que el reCAPTCHA procese
    await asyncio.sleep(2)
    
    # Verificar que el checkbox está marcado
    try:
        checkbox = page.frame_locator('iframe[title*="reCAPTCHA"]').locator('#recaptcha-anchor').first
        aria_checked = await checkbox.get_attribute("aria-checked")
        if aria_checked == "true":
            print("[reCAPTCHA] ✓ Checkbox marcado como válido")
            return True
    except Exception as e:
        print(f"[reCAPTCHA] No se pudo verificar checkbox: {e}")
    
    return True  # Asumir éxito aunque no se pueda verificar visualmente


async def humanized_fill(page, selector: str, text: str):
    """Llena un campo con comportamiento humanizado."""
    element = page.locator(selector).first
    await element.click()
    await element.clear()
    for char in text:
        await element.type(char, delay=random.randint(50, 150))
    await asyncio.sleep(random.uniform(0.1, 0.3))


async def run_auto_login():
    """Ejecuta el login completamente automático."""
    
    # Configuración
    login_url = os.getenv("QUALITAS_LOGIN_URL", "https://proordersistem.com.mx/")
    user = os.getenv("QUALITAS_USER")
    password = os.getenv("QUALITAS_PASSWORD")
    taller_id = os.getenv("QUALITAS_TALLER_ID")
    site_key = os.getenv("QUALITAS_RECAPTCHA_SITE_KEY")
    headless = os.getenv("QUALITAS_HEADLESS", "false").lower() == "true"
    
    if not all([user, password, taller_id, site_key]):
        raise ValueError("Faltan variables de entorno requeridas")
    
    session_path = Path(__file__).resolve().parent / "sessions" / "qualitas_session.json"
    session_path.parent.mkdir(parents=True, exist_ok=True)
    
    print("=" * 60)
    print("RPA Qualitas - Login Automático (2captcha)")
    print("=" * 60)
    
    async with async_playwright() as p:
        # Launch browser
        browser = await p.chromium.launch(
            headless=headless,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-blink-features=AutomationControlled",
            ]
        )
        
        context = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            locale="es-MX",
        )
        
        page = await context.new_page()
        
        # Aplicar stealth
        stealth = Stealth(
            navigator_languages_override=('es-MX', 'es', 'en-US', 'en'),
            navigator_platform_override='MacIntel',
        )
        await stealth.apply_stealth_async(page)
        
        try:
            # 1. Navegar al login
            print(f"[1/5] Navegando a {login_url}...")
            await page.goto(login_url, wait_until="domcontentloaded")
            await asyncio.sleep(2)
            
            # 2. Llenar credenciales
            print("[2/5] Llenando credenciales...")
            await humanized_fill(page, 'input[placeholder="Email"]', user)
            await humanized_fill(page, 'input[placeholder="Password"]', password)
            await humanized_fill(page, 'input[placeholder="ID-Taller"]', taller_id)
            
            # Marcar términos
            terms = page.locator('input[type="checkbox"][name="tyc"]').first
            if not await terms.is_checked():
                await terms.click(delay=100)
            await asyncio.sleep(0.5)
            
            # 3. Resolver reCAPTCHA con 2captcha
            print("[3/5] Enviando reCAPTCHA a 2captcha...")
            token = await solve_recaptcha_2captcha(site_key, login_url)
            
            # 4. Inyectar token
            print("[4/5] Inyectando token...")
            await inject_recaptcha_token(page, token)
            await asyncio.sleep(1)
            
            # 5. Hacer login
            print("[5/5] Haciendo login...")
            await page.click('input[type="submit"][value="Log In"]', delay=150)
            
            # Esperar navegación
            await page.wait_for_load_state("networkidle", timeout=30000)
            
            # Verificar éxito
            current_url = page.url
            print(f"[Éxito] URL actual: {current_url}")
            
            if "login" in current_url.lower():
                raise RuntimeError("Login fallido - aún en página de login")
            
            # Guardar sesión
            storage = await context.storage_state()
            with open(session_path, "w") as f:
                json.dump(storage, f, indent=2)
            
            print(f"[Éxito] Sesión guardada: {session_path}")
            print(f"[Éxito] Cookies: {len(storage.get('cookies', []))}")
            
            # Mantener navegador abierto un momento para verificación
            if not headless:
                print("\n[Navegador abierto por 10 segundos para verificación...]")
                await asyncio.sleep(10)
            
            return True
            
        except Exception as e:
            # Screenshot de error
            try:
                error_path = session_path.parent / "login_error.png"
                await page.screenshot(path=str(error_path), full_page=True)
                print(f"[Error] Screenshot guardado: {error_path}")
            except:
                pass
            raise
            
        finally:
            await context.close()
            await browser.close()


def main():
    parser = argparse.ArgumentParser(description="RPA Qualitas - Login Automático")
    parser.add_argument("--headless", action="store_true", help="Modo headless")
    args = parser.parse_args()
    
    if args.headless:
        os.environ["QUALITAS_HEADLESS"] = "true"
    
    try:
        asyncio.run(run_auto_login())
    except KeyboardInterrupt:
        print("\n[Interrumpido por usuario]")
    except Exception as e:
        print(f"\n[Error] {e}")
        raise


if __name__ == "__main__":
    main()
