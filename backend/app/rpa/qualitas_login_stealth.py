"""
RPA para Qualitas con Playwright Stealth + CDP Avanzado.

Este módulo implementa técnicas de evasión de detección para reCAPTCHA v2:
- Playwright Stealth (oculta propiedades de automatización)
- Chrome DevTools Protocol (CDP) avanzado
- User-Agent y viewport realistas
- Inyección de scripts anti-detección
- Manejo mejorado de iframes del reCAPTCHA
"""

import argparse
import asyncio
import json
import os
import random
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv
from playwright.async_api import CDPSession, Page, TimeoutError as PlaywrightTimeoutError
from playwright.async_api import async_playwright
from playwright_stealth import Stealth


@dataclass
class QualitasRpaConfig:
    """Configuración para el RPA de Qualitas."""

    # URLs y credenciales
    login_url: str
    user: str
    password: str
    taller_id: str

    # Selectores
    email_selector: str
    password_selector: str
    taller_id_selector: str
    terms_selector: str
    recaptcha_iframe_selector: str
    recaptcha_anchor_selector: str
    recaptcha_challenge_selector: str
    recaptcha_checkbox_selector: str
    login_button_selector: str
    post_login_wait_selector: str

    # Timeouts
    recaptcha_timeout_ms: int
    navigation_timeout_ms: int
    element_timeout_ms: int

    # Opciones de navegador
    headless: bool
    slow_mo_ms: int

    # Opciones Stealth avanzadas
    use_stealth: bool = True
    use_cdp_evasion: bool = True
    rotate_user_agent: bool = True
    randomize_viewport: bool = True
    disable_webdriver_indicator: bool = True

    # User agents realistas (rotativos)
    user_agents: list[str] = field(default_factory=lambda: [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    ])

    # Viewports realistas
    viewports: list[dict[str, int]] = field(default_factory=lambda: [
        {"width": 1920, "height": 1080},
        {"width": 1366, "height": 768},
        {"width": 1440, "height": 900},
        {"width": 1536, "height": 864},
        {"width": 1280, "height": 720},
    ])


# Scripts de evasión de detección (CDP)
EVASION_SCRIPTS = {
    # Ocultar navigator.webdriver
    "hide_webdriver": """
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined
        });
    """,
    # Ocultar Chrome runtime
    "hide_chrome_runtime": """
        window.chrome = {
            runtime: {},
            loadTimes: function() {},
            csi: function() {},
            app: {}
        };
    """,
    # Modificar plugins para parecer real
    "modify_plugins": """
        Object.defineProperty(navigator, 'plugins', {
            get: () => [
                { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
                { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: 'Portable Document Format' },
                { name: 'Native Client', filename: 'internal-nacl-plugin', description: 'Native Client module' }
            ]
        });
    """,
    # Modificar languages
    "modify_languages": """
        Object.defineProperty(navigator, 'languages', {
            get: () => ['es-MX', 'es', 'en-US', 'en']
        });
    """,
    # Ocultar automation flags
    "hide_automation": """
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
            parameters.name === 'notifications' ?
                Promise.resolve({ state: Notification.permission }) :
                originalQuery(parameters)
        );
    """,
    # Ocultar Playwright/Automation indicators en iframe
    "hide_iframe_automation": """
        const iframes = document.getElementsByTagName('iframe');
        for (let i = 0; i < iframes.length; i++) {
            try {
                const iframe = iframes[i];
                if (iframe.contentWindow) {
                    Object.defineProperty(iframe.contentWindow.navigator, 'webdriver', {
                        get: () => undefined
                    });
                }
            } catch (e) {}
        }
    """,
}


def load_config() -> QualitasRpaConfig:
    """Carga la configuración desde variables de entorno."""
    backend_dir = Path(__file__).resolve().parents[2]
    env_qualitas = backend_dir / ".envQualitas"
    env_default = backend_dir / ".env"

    if env_qualitas.exists():
        load_dotenv(dotenv_path=env_qualitas)
    else:
        load_dotenv(dotenv_path=env_default)

    return QualitasRpaConfig(
        login_url=os.getenv("QUALITAS_LOGIN_URL", "").strip(),
        user=os.getenv("QUALITAS_USER", "").strip(),
        password=os.getenv("QUALITAS_PASSWORD", "").strip(),
        taller_id=os.getenv("QUALITAS_TALLER_ID", "").strip(),
        email_selector=os.getenv("QUALITAS_EMAIL_SELECTOR", 'input[placeholder="Email"]').strip(),
        password_selector=os.getenv("QUALITAS_PASSWORD_SELECTOR", 'input[placeholder="Password"]').strip(),
        taller_id_selector=os.getenv("QUALITAS_TALLER_ID_SELECTOR", 'input[placeholder="ID-Taller"]').strip(),
        terms_selector=os.getenv(
            "QUALITAS_TERMS_SELECTOR",
            'input[type="checkbox"][name="tyc"][value="1"]',
        ).strip(),
        recaptcha_iframe_selector=os.getenv(
            "QUALITAS_RECAPTCHA_IFRAME_SELECTOR",
            'iframe[title*="reCAPTCHA"]',
        ).strip(),
        recaptcha_anchor_selector=os.getenv(
            "QUALITAS_RECAPTCHA_ANCHOR_SELECTOR",
            "#recaptcha-anchor",
        ).strip(),
        recaptcha_challenge_selector=os.getenv(
            "QUALITAS_RECAPTCHA_CHALLENGE_SELECTOR",
            'iframe[title*="challenge"]',
        ).strip(),
        recaptcha_checkbox_selector=os.getenv(
            "QUALITAS_RECAPTCHA_CHECKBOX_SELECTOR",
            '.recaptcha-checkbox-border',
        ).strip(),
        recaptcha_timeout_ms=int(os.getenv("QUALITAS_RECAPTCHA_TIMEOUT_MS", "180000")),
        navigation_timeout_ms=int(os.getenv("QUALITAS_NAVIGATION_TIMEOUT_MS", "30000")),
        element_timeout_ms=int(os.getenv("QUALITAS_ELEMENT_TIMEOUT_MS", "10000")),
        login_button_selector=os.getenv(
            "QUALITAS_LOGIN_BUTTON_SELECTOR",
            'input[type="submit"][value="Log In"]',
        ).strip(),
        post_login_wait_selector=os.getenv("QUALITAS_POST_LOGIN_SELECTOR", "").strip(),
        headless=os.getenv("QUALITAS_HEADLESS", "false").strip().lower() == "true",
        slow_mo_ms=int(os.getenv("QUALITAS_SLOWMO_MS", "60")),
        use_stealth=os.getenv("QUALITAS_USE_STEALTH", "true").strip().lower() == "true",
        use_cdp_evasion=os.getenv("QUALITAS_USE_CDP_EVASION", "true").strip().lower() == "true",
        rotate_user_agent=os.getenv("QUALITAS_ROTATE_UA", "true").strip().lower() == "true",
        randomize_viewport=os.getenv("QUALITAS_RANDOM_VIEWPORT", "true").strip().lower() == "true",
    )


def validate_config(config: QualitasRpaConfig) -> None:
    """Valida que todas las variables obligatorias estén presentes."""
    missing_vars = []
    if not config.login_url:
        missing_vars.append("QUALITAS_LOGIN_URL")
    if not config.user:
        missing_vars.append("QUALITAS_USER")
    if not config.password:
        missing_vars.append("QUALITAS_PASSWORD")
    if not config.taller_id:
        missing_vars.append("QUALITAS_TALLER_ID")

    if missing_vars:
        raise ValueError(
            f"Faltan variables obligatorias en .env: {', '.join(missing_vars)}"
        )


def get_random_viewport(config: QualitasRpaConfig) -> dict[str, int]:
    """Selecciona un viewport aleatorio de la lista."""
    return random.choice(config.viewports)


def get_random_user_agent(config: QualitasRpaConfig) -> str:
    """Selecciona un User-Agent aleatorio de la lista."""
    return random.choice(config.user_agents)


async def apply_cdp_evasion(page: Page, cdp_session: CDPSession) -> None:
    """Aplica técnicas de evasión usando CDP."""
    # Ejecutar scripts de evasión en cada nuevo documento
    for script_name, script_content in EVASION_SCRIPTS.items():
        try:
            await cdp_session.send("Runtime.evaluate", {
                "expression": script_content,
                "includeCommandLineAPI": True,
                "returnByValue": False,
                "awaitPromise": False
            })
        except Exception as e:
            print(f"[CDP] Advertencia al aplicar {script_name}: {e}")


async def setup_stealth_browser_context(
    playwright, config: QualitasRpaConfig
) -> tuple[Any, Any, Optional[CDPSession]]:
    """
    Configura un navegador y contexto con técnicas anti-detección.
    
    Returns:
        Tupla de (browser, context, cdp_session)
    """
    # Seleccionar viewport y user agent aleatorios
    viewport = get_random_viewport(config) if config.randomize_viewport else {"width": 1920, "height": 1080}
    user_agent = get_random_user_agent(config) if config.rotate_user_agent else config.user_agents[0]

    # Argumentos del navegador para evasión
    browser_args = [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
        "--window-size=1920,1080",
        "--start-maximized",
        "--disable-blink-features=AutomationControlled",
        "--disable-features=IsolateOrigins,site-per-process",
        "--disable-site-isolation-trials",
        "--disable-web-security",
        "--disable-features=BlockInsecurePrivateNetworkRequests",
        "--disable-features=InterestFeedContentSuggestions",
        "--disable-features=OptimizationHints",
        "--disable-features=PasswordManagerEnabled",
    ]

    browser = await playwright.chromium.launch(
        headless=config.headless,
        slow_mo=config.slow_mo_ms if not config.headless else 0,
        args=browser_args,
    )

    context = await browser.new_context(
        viewport=viewport,
        user_agent=user_agent,
        locale="es-MX",
        timezone_id="America/Mexico_City",
        geolocation={"latitude": 19.4326, "longitude": -99.1332},  # CDMX
        permissions=["geolocation"],
        color_scheme="light",
        reduced_motion="no-preference",
    )

    # Añar cookies de primeras partes para parecer más real
    await context.add_init_script("""
        // Ocultar que es automation
        delete navigator.__proto__.webdriver;
        
        // Mock plugins
        Object.defineProperty(navigator, 'plugins', {
            get: function() {
                return [
                    { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
                    { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
                    { name: 'Native Client', filename: 'internal-nacl-plugin' }
                ];
            }
        });
        
        // Mock languages
        Object.defineProperty(navigator, 'languages', {
            get: function() {
                return ['es-MX', 'es', 'en-US', 'en'];
            }
        });
        
        // Ocultar automation flags
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined
        });
        
        // Chrome runtime mock
        window.chrome = {
            runtime: {},
            loadTimes: function() {},
            csi: function() {},
            app: {}
        };
        
        // Notification permission mock
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
            parameters.name === 'notifications' ?
                Promise.resolve({ state: Notification.permission }) :
                originalQuery(parameters)
        );
    """)

    cdp_session: Optional[CDPSession] = None

    return browser, context, cdp_session


async def wait_for_recaptcha_validation(
    page: Page, config: QualitasRpaConfig
) -> bool:
    """
    Espera a que el reCAPTCHA sea validado.
    
    Estrategias:
    1. Esperar al checkbox marcado
    2. Detectar challenge y esperar resolución
    3. Timeout configurable
    """
    print("[reCAPTCHA] Esperando validación...")
    print("[reCAPTCHA] Si aparece challenge de imágenes, resuélvelo manualmente.")

    start_time = time.monotonic()
    timeout_seconds = config.recaptcha_timeout_ms / 1000

    # Buscar el iframe del reCAPTCHA
    recaptcha_frames = await page.locator(config.recaptcha_iframe_selector).all()
    if not recaptcha_frames:
        print("[reCAPTCHA] No se encontró el iframe del reCAPTCHA")
        return False

    print(f"[reCAPTCHA] Encontrados {len(recaptcha_frames)} iframe(s)")

    # Intentar hacer click en el checkbox si es visible y no está marcado
    try:
        checkbox = page.frame_locator(config.recaptcha_iframe_selector).locator(config.recaptcha_checkbox_selector).first
        if await checkbox.is_visible(timeout=5000):
            # Verificar si ya está marcado
            anchor = page.frame_locator(config.recaptcha_iframe_selector).locator(config.recaptcha_anchor_selector).first
            aria_checked = await anchor.get_attribute("aria-checked")
            if aria_checked == "true":
                print("[reCAPTCHA] Ya está validado!")
                return True
            
            # Click humanizado
            print("[reCAPTCHA] Haciendo click en el checkbox...")
            await checkbox.click(delay=random.randint(100, 300))
    except Exception as e:
        print(f"[reCAPTCHA] No se pudo hacer click automático: {e}")

    # Esperar a que se valide (con o sin intervención humana)
    while time.monotonic() - start_time < timeout_seconds:
        try:
            # Verificar si el reCAPTCHA está validado
            recaptcha_anchor = (
                page.frame_locator(config.recaptcha_iframe_selector)
                .locator(config.recaptcha_anchor_selector)
                .first
            )
            
            aria_checked = await recaptcha_anchor.get_attribute("aria-checked")
            if aria_checked == "true":
                print("[reCAPTCHA] ✓ Validación exitosa!")
                return True

            # Detectar si apareció el challenge de imágenes
            challenge_frames = await page.locator(config.recaptcha_challenge_selector).all()
            if challenge_frames:
                elapsed = time.monotonic() - start_time
                remaining = timeout_seconds - elapsed
                print(f"[reCAPTCHA] Challenge de imágenes detectado. Tiempo restante: {remaining:.0f}s")
                print("[reCAPTCHA] Por favor resuelve el challenge manualmente...")

        except Exception:
            pass

        await asyncio.sleep(0.5)

    raise RuntimeError(
        f"[reCAPTCHA] No se validó dentro del tiempo límite ({config.recaptcha_timeout_ms}ms)"
    )


async def humanized_fill(page: Page, selector: str, text: str) -> None:
    """Llena un campo de texto con comportamiento humanizado (typing con delays)."""
    element = page.locator(selector).first
    await element.click()
    await element.clear()
    
    # Typing con delays aleatorios entre caracteres
    for char in text:
        await element.type(char, delay=random.randint(50, 150))
    
    # Pequeña pausa después de escribir
    await asyncio.sleep(random.uniform(0.1, 0.3))


async def run_login(config: QualitasRpaConfig, session_path: Path) -> None:
    """Ejecuta el login con técnicas anti-detección."""
    session_path.parent.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as playwright:
        # Configurar navegador stealth
        browser, context, cdp_session = await setup_stealth_browser_context(playwright, config)
        
        page = await context.new_page()

        # Aplicar stealth si está habilitado
        if config.use_stealth:
            stealth_config = Stealth(
                navigator_languages_override=('es-MX', 'es', 'en-US', 'en'),
                navigator_platform_override='MacIntel',
            )
            await stealth_config.apply_stealth_async(page)
            print("[Stealth] Playwright Stealth aplicado")

        # Crear sesión CDP para evasión adicional
        if config.use_cdp_evasion:
            cdp_session = await page.context.new_cdp_session(page)
            await apply_cdp_evasion(page, cdp_session)
            print("[CDP] Evasión CDP aplicada")

        try:
            # Navegar con timeout extendido
            print(f"[Navegación] Cargando {config.login_url}...")
            await page.goto(
                config.login_url,
                wait_until="domcontentloaded",
                timeout=config.navigation_timeout_ms
            )
            
            # Esperar un momento para que carguen todos los elementos
            await asyncio.sleep(random.uniform(1, 2))

            # Verificar que no estemos detectados
            is_webdriver = await page.evaluate("() => navigator.webdriver")
            print(f"[Evasión] navigator.webdriver = {is_webdriver}")

            # Llenar formulario con comportamiento humanizado
            print("[Formulario] Llenando credenciales...")
            await humanized_fill(page, config.email_selector, config.user)
            await humanized_fill(page, config.password_selector, config.password)
            await humanized_fill(page, config.taller_id_selector, config.taller_id)

            # Términos y condiciones
            if config.terms_selector:
                print("[Formulario] Marcando términos...")
                terms_checkbox = page.locator(config.terms_selector).first
                if not await terms_checkbox.is_checked():
                    await terms_checkbox.click(delay=random.randint(100, 200))
                await asyncio.sleep(random.uniform(0.3, 0.6))

            # Esperar y manejar reCAPTCHA
            await wait_for_recaptcha_validation(page, config)

            # Click en login con comportamiento humanizado
            print("[Login] Haciendo click en botón de login...")
            await page.click(config.login_button_selector, delay=random.randint(150, 300))

            # Esperar navegación post-login
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
            print(f"[Info] Cookies guardadas: {len(storage_state.get('cookies', []))}")
            print(f"[Info] Orígenes con storage: {len(storage_state.get('origins', []))}")

        except PlaywrightTimeoutError as exc:
            # Guardar screenshot para debugging
            debug_screenshot = session_path.parent / "login_error.png"
            await page.screenshot(path=str(debug_screenshot), full_page=True)
            print(f"[Debug] Screenshot guardado en: {debug_screenshot}")
            raise RuntimeError(
                "Timeout en login. Revisa selectores o flujo posterior al botón LOG IN."
            ) from exc
            
        except Exception as exc:
            # Guardar screenshot para debugging
            debug_screenshot = session_path.parent / "login_error.png"
            try:
                await page.screenshot(path=str(debug_screenshot), full_page=True)
                print(f"[Debug] Screenshot guardado en: {debug_screenshot}")
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
        description="RPA Stealth para Qualitas con evasión de reCAPTCHA v2."
    )
    parser.add_argument(
        "--session-path",
        default=str(Path(__file__).resolve().parent / "sessions" / "qualitas_session.json"),
        help="Ruta para guardar el storage state de la sesión.",
    )
    parser.add_argument(
        "--no-stealth",
        action="store_true",
        help="Deshabilitar Playwright Stealth.",
    )
    parser.add_argument(
        "--no-cdp",
        action="store_true",
        help="Deshabilitar evasión CDP avanzada.",
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Ejecutar en modo headless (sin ventana visible).",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    config = load_config()
    
    # Aplicar overrides de CLI
    if args.no_stealth:
        config.use_stealth = False
    if args.no_cdp:
        config.use_cdp_evasion = False
    if args.headless:
        config.headless = True
    
    validate_config(config)
    
    print("=" * 60)
    print("RPA Qualitas - Modo Stealth + CDP Avanzado")
    print("=" * 60)
    print(f"Stealth: {'✓ Activado' if config.use_stealth else '✗ Desactivado'}")
    print(f"CDP Evasión: {'✓ Activado' if config.use_cdp_evasion else '✗ Desactivado'}")
    print(f"Rotación UA: {'✓ Activado' if config.rotate_user_agent else '✗ Desactivado'}")
    print(f"Viewport aleatorio: {'✓ Activado' if config.randomize_viewport else '✗ Desactivado'}")
    print(f"Headless: {'✓ Sí' if config.headless else '✗ No'}")
    print("=" * 60)
    
    asyncio.run(run_login(config=config, session_path=Path(args.session_path)))


if __name__ == "__main__":
    main()
