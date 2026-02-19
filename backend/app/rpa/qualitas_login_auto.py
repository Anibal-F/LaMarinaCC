"""
RPA para Qualitas con resolución automática de reCAPTCHA.

Este módulo extiende qualitas_login_stealth con:
- Resolución automática de reCAPTCHA v2 usando servicios externos (2captcha, anti-captcha)
- Inyección del token de respuesta
- Flujo 100% automatizado (sin intervención humana)

Requiere configurar:
- CAPTCHA_PROVIDER=2captcha (o anti-captcha)
- CAPTCHA_API_KEY=tu_api_key
- QUALITAS_RECAPTCHA_SITE_KEY=el_site_key_del_sitio
"""

import argparse
import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv
from playwright.async_api import TimeoutError as PlaywrightTimeoutError
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

from app.rpa.qualitas_login_stealth import (
    QualitasRpaConfig,
    load_config as load_base_config,
    validate_config,
    setup_stealth_browser_context,
    apply_cdp_evasion,
    humanized_fill,
    EVASION_SCRIPTS,
)
from app.rpa.qualitas_session_manager import QualitasSessionManager
from app.rpa.captcha_solver import get_captcha_provider, CaptchaSolution


def load_config() -> QualitasRpaConfig:
    """Carga configuración extendida con opciones de CAPTCHA."""
    config = load_base_config()
    return config


async def inject_recaptcha_token(page, token: str) -> None:
    """
    Inyecta el token de reCAPTCHA en el formulario.
    
    El token g-recaptcha-response debe ser inyectado en el textarea
    oculto que crea el widget de reCAPTCHA.
    """
    # Múltiples métodos de inyección para mayor robustez
    injection_scripts = [
        # Método 1: Inyección directa en el textarea
        f"""
        document.getElementById('g-recaptcha-response').innerHTML='{token}';
        """,
        # Método 2: Usar el callback de reCAPTCHA si existe
        f"""
        if (typeof grecaptcha !== 'undefined') {{
            grecaptcha.getResponse = function() {{ return '{token}'; }};
        }}
        """,
        # Método 3: Crear el elemento si no existe
        f"""
        (function() {{
            var response = document.getElementById('g-recaptcha-response');
            if (!response) {{
                response = document.createElement('textarea');
                response.id = 'g-recaptcha-response';
                response.style.display = 'none';
                document.body.appendChild(response);
            }}
            response.value = '{token}';
            response.innerHTML = '{token}';
        }})();
        """,
        # Método 4: Trigger del callback
        f"""
        if (typeof ___grecaptcha_cfg !== 'undefined') {{
            var clients = ___grecaptcha_cfg.clients;
            for (var clientId in clients) {{
                var client = clients[clientId];
                if (client && client.O && client.O.callback) {{
                    client.O.callback('{token}');
                }}
            }}
        }}
        """,
    ]
    
    for i, script in enumerate(injection_scripts, 1):
        try:
            await page.evaluate(script)
            print(f"[reCAPTCHA] Inyección método {i} aplicada")
        except Exception as e:
            print(f"[reCAPTCHA] Método {i} falló: {e}")


async def verify_recaptcha_solved(page, timeout: int = 10) -> bool:
    """Verifica si el reCAPTCHA fue resuelto correctamente."""
    import time
    start = time.monotonic()
    
    while time.monotonic() - start < timeout:
        try:
            # Verificar el atributo aria-checked del checkbox
            checkbox = page.frame_locator('iframe[title*="reCAPTCHA"]').locator('#recaptcha-anchor').first
            aria_checked = await checkbox.get_attribute('aria-checked')
            
            if aria_checked == 'true':
                print("[reCAPTCHA] ✓ Verificado como resuelto")
                return True
                
        except Exception:
            pass
        
        # También verificar si existe el token
        try:
            token = await page.evaluate("""
                () => {
                    var el = document.getElementById('g-recaptcha-response');
                    return el ? el.value : null;
                }
            """)
            if token and len(token) > 100:
                print("[reCAPTCHA] ✓ Token detectado en DOM")
                return True
        except Exception:
            pass
            
        await asyncio.sleep(0.5)
    
    return False


async def extract_site_key(page) -> str:
    """
    Extrae el site key del reCAPTCHA de la página.
    
    Busca en:
    - Atributo data-sitekey del div
    - Variable global grecaptcha
    - Scripts de la página
    """
    # Intentar extraer del div del reCAPTCHA
    site_key = await page.evaluate(r"""
        () => {
            // Buscar div con data-sitekey
            var div = document.querySelector('.g-recaptcha');
            if (div) return div.getAttribute('data-sitekey');
            
            // Buscar en cualquier elemento con data-sitekey
            var el = document.querySelector('[data-sitekey]');
            if (el) return el.getAttribute('data-sitekey');
            
            // Buscar en scripts
            var scripts = document.querySelectorAll('script');
            for (var i = 0; i < scripts.length; i++) {
                var match = scripts[i].textContent.match(/sitekey["']?\s*:\s*["']([^"']+)/);
                if (match) return match[1];
            }
            
            return null;
        }
    """)
    
    if site_key:
        print(f"[reCAPTCHA] Site key extraído: {site_key[:10]}...")
        return site_key
    
    raise RuntimeError("No se pudo extraer el site key del reCAPTCHA")


async def run_login_auto(
    config: QualitasRpaConfig, 
    session_path: Path,
    auto_captcha: bool = True
) -> None:
    """
    Ejecuta login con resolución automática de reCAPTCHA.
    
    Args:
        config: Configuración del RPA
        session_path: Ruta para guardar la sesión
        auto_captcha: Si True, usa servicio externo para resolver CAPTCHA
    """
    import json
    import time
    
    session_path.parent.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as playwright:
        browser, context, cdp_session = await setup_stealth_browser_context(playwright, config)
        
        page = await context.new_page()

        # Aplicar stealth
        if config.use_stealth:
            stealth_config = Stealth(
                navigator_languages_override=('es-MX', 'es', 'en-US', 'en'),
                navigator_platform_override='MacIntel',
            )
            await stealth_config.apply_stealth_async(page)
            print("[Stealth] Playwright Stealth aplicado")

        # CDP evasion
        if config.use_cdp_evasion and cdp_session:
            await apply_cdp_evasion(page, cdp_session)
            print("[CDP] Evasión CDP aplicada")

        try:
            # Navegar
            print(f"[Navegación] Cargando {config.login_url}...")
            await page.goto(
                config.login_url,
                wait_until="domcontentloaded",
                timeout=config.navigation_timeout_ms
            )
            await asyncio.sleep(1)

            # Verificar evasión
            is_webdriver = await page.evaluate("() => navigator.webdriver")
            print(f"[Evasión] navigator.webdriver = {is_webdriver}")

            # Llenar formulario
            print("[Formulario] Llenando credenciales...")
            await humanized_fill(page, config.email_selector, config.user)
            await humanized_fill(page, config.password_selector, config.password)
            await humanized_fill(page, config.taller_id_selector, config.taller_id)

            # Términos
            if config.terms_selector:
                print("[Formulario] Marcando términos...")
                terms_checkbox = page.locator(config.terms_selector).first
                if not await terms_checkbox.is_checked():
                    await terms_checkbox.click(delay=100)
                await asyncio.sleep(0.3)

            # === RESOLUCIÓN AUTOMÁTICA DE reCAPTCHA ===
            if auto_captcha:
                print("[reCAPTCHA] Iniciando resolución automática...")
                
                try:
                    # Extraer site key
                    site_key = await extract_site_key(page)
                    
                    # Resolver usando servicio externo
                    provider = get_captcha_provider()
                    print(f"[reCAPTCHA] Usando proveedor: {provider.__class__.__name__}")
                    
                    solution = await provider.solve_recaptcha_v2(
                        site_key=site_key,
                        page_url=config.login_url,
                        invisible=False
                    )
                    
                    print(f"[reCAPTCHA] Token recibido ({len(solution.token)} chars)")
                    print(f"[reCAPTCHA] Costo: ${solution.cost:.4f}, Tiempo: {solution.solve_time_seconds:.1f}s")
                    
                    # Inyectar token
                    await inject_recaptcha_token(page, solution.token)
                    await asyncio.sleep(1)
                    
                    # Verificar que se resolvió
                    solved = await verify_recaptcha_solved(page, timeout=10)
                    if not solved:
                        print("[reCAPTCHA] ⚠ No se pudo verificar resolución, continuando de todos modos...")
                    
                except Exception as e:
                    print(f"[reCAPTCHA] Error en resolución automática: {e}")
                    print("[reCAPTCHA] Cambiando a modo manual...")
                    auto_captcha = False
            
            # === MODO MANUAL (fallback) ===
            if not auto_captcha:
                print("[reCAPTCHA] MODO MANUAL:")
                print("[reCAPTCHA] 1. Haz clic en 'No soy un robot'")
                print("[reCAPTCHA] 2. Resuelve el challenge si aparece")
                print("[reCAPTCHA] 3. Esperando validación...")
                
                # Esperar validación manual
                deadline = time.monotonic() + (config.recaptcha_timeout_ms / 1000)
                while time.monotonic() < deadline:
                    try:
                        checkbox = page.frame_locator(config.recaptcha_iframe_selector).locator(config.recaptcha_anchor_selector).first
                        aria_checked = await checkbox.get_attribute("aria-checked")
                        if aria_checked == "true":
                            print("[reCAPTCHA] ✓ Validado manualmente!")
                            break
                    except Exception:
                        pass
                    await asyncio.sleep(0.5)
                else:
                    raise RuntimeError("Timeout esperando reCAPTCHA manual")

            # Click en login
            print("[Login] Haciendo click en botón de login...")
            await page.click(config.login_button_selector, delay=150)

            # Esperar navegación
            if config.post_login_wait_selector:
                await page.wait_for_selector(
                    config.post_login_wait_selector,
                    timeout=config.navigation_timeout_ms
                )
            else:
                await page.wait_for_load_state("networkidle", timeout=config.navigation_timeout_ms)

            # Guardar sesión
            storage_state = await context.storage_state()
            with open(session_path, "w", encoding="utf-8") as f:
                json.dump(storage_state, f, indent=2, ensure_ascii=False)
            
            print(f"[Éxito] Sesión guardada en: {session_path}")
            print(f"[Info] Cookies: {len(storage_state.get('cookies', []))}")

        except PlaywrightTimeoutError as exc:
            debug_screenshot = session_path.parent / "login_error.png"
            await page.screenshot(path=str(debug_screenshot), full_page=True)
            print(f"[Debug] Screenshot: {debug_screenshot}")
            raise RuntimeError("Timeout en login") from exc
            
        except Exception as exc:
            debug_screenshot = session_path.parent / "login_error.png"
            try:
                await page.screenshot(path=str(debug_screenshot), full_page=True)
                print(f"[Debug] Screenshot: {debug_screenshot}")
            except:
                pass
            raise
            
        finally:
            if cdp_session:
                await cdp_session.detach()
            await context.close()
            await browser.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="RPA Qualitas con resolución automática de reCAPTCHA."
    )
    parser.add_argument(
        "--session-path",
        default=str(Path(__file__).resolve().parent / "sessions" / "qualitas_session.json"),
        help="Ruta para guardar la sesión.",
    )
    parser.add_argument(
        "--manual",
        action="store_true",
        help="Usar modo manual para reCAPTCHA (no usar servicio externo).",
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Ejecutar en modo headless.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    
    # Cargar variables de entorno adicionales
    backend_dir = Path(__file__).resolve().parents[2]
    env_qualitas = backend_dir / ".envQualitas"
    if env_qualitas.exists():
        load_dotenv(dotenv_path=env_qualitas, override=True)
    
    config = load_config()
    
    if args.headless:
        config.headless = True
    
    validate_config(config)
    
    print("=" * 60)
    print("RPA Qualitas - Modo Automático (con resolución de CAPTCHA)")
    print("=" * 60)
    print(f"Auto-CAPTCHA: {'✗ Manual' if args.manual else '✓ Automático'}")
    print(f"Headless: {'✓ Sí' if config.headless else '✗ No'}")
    print("=" * 60)
    
    if not args.manual:
        # Verificar configuración de CAPTCHA
        provider = os.getenv("CAPTCHA_PROVIDER", "2captcha")
        api_key = os.getenv("CAPTCHA_API_KEY")
        site_key = os.getenv("QUALITAS_RECAPTCHA_SITE_KEY")
        
        print(f"Proveedor: {provider}")
        print(f"API Key: {'✓ Configurada' if api_key else '✗ FALTA'}")
        print(f"Site Key: {'✓ Configurada' if site_key else '✗ FALTA'}")
        print("=" * 60)
        
        if not api_key or not site_key:
            print("[Error] Faltan variables CAPTCHA_API_KEY o QUALITAS_RECAPTCHA_SITE_KEY")
            print("[Info] Ejecuta con --manual para modo interactivo")
            return
    
    asyncio.run(run_login_auto(
        config=config,
        session_path=Path(args.session_path),
        auto_captcha=not args.manual
    ))


if __name__ == "__main__":
    main()
