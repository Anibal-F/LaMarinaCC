"""
Workflow completo: Login automático + Extracción de datos de Qualitas.

Uso:
    python3 -m app.rpa.qualitas_full_workflow
    
Opciones:
    --skip-login    Usar sesión existente (más rápido)
    --headless      Ejecutar sin ventana visible
    --save-json     Guardar datos en archivo JSON
    --status NAME   Hacer click en un estatus específico y extraer detalle
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

from app.rpa.qualitas_extractor import QualitasExtractor, DashboardData
from app.rpa.qualitas_modal_handler import handle_qualitas_modal


# Cargar variables de entorno (fallback)
backend_dir = Path(__file__).resolve().parents[2]
env_qualitas = backend_dir / ".envQualitas"
if env_qualitas.exists():
    load_dotenv(dotenv_path=env_qualitas, override=True)


# Intentar importar helper de credenciales
try:
    from app.rpa.credentials_helper import setup_qualitas_env, get_qualitas_credentials
    CREDENTIALS_HELPER_AVAILABLE = True
except ImportError:
    CREDENTIALS_HELPER_AVAILABLE = False
    print("[Warning] No se pudo importar credentials_helper, se usará .env")


def load_credentials(use_db=True):
    """Carga credenciales desde DB o .env según configuración."""
    if use_db and CREDENTIALS_HELPER_AVAILABLE:
        print("[Credentials] Intentando cargar desde base de datos...")
        if setup_qualitas_env():
            return True
        print("[Credentials] No se encontraron en DB, usando .env como fallback...")
    
    # Usar .env (ya cargado arriba)
    return bool(os.getenv("QUALITAS_USER"))


def get_credential(key: str, use_db: bool = True) -> str:
    """Obtiene una credencial, priorizando DB si está disponible."""
    if use_db and CREDENTIALS_HELPER_AVAILABLE:
        creds = get_qualitas_credentials()
        if creds:
            mapping = {
                "QUALITAS_LOGIN_URL": creds.get("plataforma_url"),
                "QUALITAS_USER": creds.get("usuario"),
                "QUALITAS_PASSWORD": creds.get("password"),
                "QUALITAS_TALLER_ID": creds.get("taller_id"),
            }
            if key in mapping and mapping[key]:
                return mapping[key]
    
    # Fallback a .env
    return os.getenv(key, "")


async def solve_recaptcha_2captcha(site_key: str, page_url: str) -> str:
    """Resuelve reCAPTCHA usando 2captcha con reintentos."""
    import aiohttp
    
    api_key = os.getenv("CAPTCHA_API_KEY")
    if not api_key:
        raise ValueError("CAPTCHA_API_KEY no configurada")
    
    # Headers para evitar compresión Brotli
    headers = {
        "Accept-Encoding": "gzip, deflate",
        "Accept": "application/json",
    }
    
    async with aiohttp.ClientSession(headers=headers) as session:
        submit_url = "https://2captcha.com/in.php"
        payload = {
            "key": api_key,
            "method": "userrecaptcha",
            "googlekey": site_key,
            "pageurl": page_url,
            "json": 1,
        }
        
        # Enviar CAPTCHA con reintentos
        for attempt in range(3):
            try:
                async with session.post(submit_url, data=payload, timeout=30) as resp:
                    result = await resp.json()
                
                if result.get("status") == 1:
                    break
                
                error = result.get("request", "unknown")
                if "ERROR" in str(error).upper():
                    print(f"[2captcha] Error enviando: {error}, reintento {attempt + 1}/3")
                    await asyncio.sleep(2)
                    continue
                
                raise RuntimeError(f"2captcha error: {error}")
                
            except Exception as e:
                if attempt == 2:
                    raise RuntimeError(f"No se pudo enviar CAPTCHA: {e}")
                print(f"[2captcha] Error de conexión, reintento {attempt + 1}/3...")
                await asyncio.sleep(2)
        
        captcha_id = result["request"]
        print(f"[2captcha] CAPTCHA enviado, ID: {captcha_id}")
        
        # Poll por resultado con manejo de errores
        result_url = "https://2captcha.com/res.php"
        max_wait = 180
        consecutive_errors = 0
        
        for attempt in range(max_wait // 5):
            await asyncio.sleep(5)
            
            params = {
                "key": api_key,
                "action": "get",
                "id": captcha_id,
                "json": 1,
            }
            
            try:
                async with session.get(result_url, params=params, timeout=10) as resp:
                    # Manejar respuestas no-JSON (errores de servidor)
                    content_type = resp.headers.get('Content-Type', '')
                    if 'json' not in content_type:
                        text = await resp.text()
                        print(f"[2captcha] Respuesta no-JSON (intento {attempt + 1}): {text[:100]}...")
                        consecutive_errors += 1
                        if consecutive_errors >= 5:
                            raise RuntimeError("Demasiados errores consecutivos del servidor")
                        continue
                    
                    result = await resp.json()
                    consecutive_errors = 0  # Reset contador
                
                if result.get("status") == 1:
                    print(f"[2captcha] ✓ Resuelto en {(attempt + 1) * 5}s")
                    return result["request"]
                
                if result.get("request") != "CAPCHA_NOT_READY":
                    raise RuntimeError(f"2captcha error: {result.get('request')}")
                
                print(f"[2captcha] Esperando... ({(attempt + 1) * 5}s)")
                
            except Exception as e:
                consecutive_errors += 1
                print(f"[2captcha] Error en poll (intento {attempt + 1}): {e}")
                if consecutive_errors >= 5:
                    raise RuntimeError("Demasiados errores consecutivos del servidor")
        
        raise TimeoutError(f"2captcha timeout después de {max_wait}s")


async def inject_recaptcha_token(page, token: str):
    """Inyecta el token de reCAPTCHA."""
    script = f"""
    (function() {{
        var responseElement = document.getElementById('g-recaptcha-response');
        if (!responseElement) {{
            responseElement = document.createElement('textarea');
            responseElement.id = 'g-recaptcha-response';
            responseElement.name = 'g-recaptcha-response';
            responseElement.style.display = 'none';
            document.body.appendChild(responseElement);
        }}
        responseElement.value = '{token}';
        
        if (typeof grecaptcha !== 'undefined') {{
            try {{
                var widgets = Object.keys(___grecaptcha_cfg.clients || {{}});
                for (var i = 0; i < widgets.length; i++) {{
                    var client = ___grecaptcha_cfg.clients[widgets[i]];
                    if (client && client.O && client.O.callback) {{
                        client.O.callback('{token}');
                    }}
                }}
            }} catch(e) {{}}
        }}
    }})();
    """
    await page.evaluate(script)
    await asyncio.sleep(2)


async def do_login(page, use_db: bool = True) -> bool:
    """Realiza el login automático."""
    login_url = get_credential("QUALITAS_LOGIN_URL", use_db) or "https://proordersistem.com.mx/"
    user = get_credential("QUALITAS_USER", use_db)
    password = get_credential("QUALITAS_PASSWORD", use_db)
    taller_id = get_credential("QUALITAS_TALLER_ID", use_db)
    site_key = os.getenv("QUALITAS_RECAPTCHA_SITE_KEY")  # Esta solo está en .env por seguridad
    
    if not user or not password:
        print("[Login] ✗ Error: No se encontraron credenciales de QUALITAS")
        print("[Login] Asegúrate de configurarlas en Admin → Credenciales o en el archivo .envQualitas")
        return False
    
    print("[Login] Navegando...")
    await page.goto(login_url, wait_until="domcontentloaded")
    await asyncio.sleep(2)
    
    print("[Login] Llenando credenciales...")
    await page.fill('input[placeholder="Email"]', user)
    await page.fill('input[placeholder="Password"]', password)
    await page.fill('input[placeholder="ID-Taller"]', taller_id)
    
    # Términos
    terms = page.locator('input[type="checkbox"][name="tyc"]').first
    if not await terms.is_checked():
        await terms.click()
    
    # CAPTCHA
    print("[Login] Resolviendo reCAPTCHA...")
    token = await solve_recaptcha_2captcha(site_key, login_url)
    await inject_recaptcha_token(page, token)
    
    # Login
    print("[Login] Enviando formulario...")
    await page.click('input[type="submit"][value="Log In"]')
    await page.wait_for_load_state("networkidle", timeout=30000)
    
    return "dashboard" in page.url.lower()


async def run_workflow(skip_login: bool = False, headless: bool = False, 
                       save_json: bool = True, click_status: str = None, use_db: bool = True):
    """Ejecuta el workflow completo."""
    
    session_path = Path(__file__).resolve().parent / "sessions" / "qualitas_session.json"
    
    print("=" * 60)
    print("QUALITAS - WORKFLOW COMPLETO")
    print("=" * 60)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=headless,
            args=["--no-sandbox", "--disable-blink-features=AutomationControlled"]
        )
        
        # Contexto
        if skip_login and session_path.exists():
            print("[Workflow] Usando sesión existente...")
            context = await browser.new_context(storage_state=str(session_path))
        else:
            print("[Workflow] Creando nuevo contexto...")
            context = await browser.new_context(viewport={"width": 1920, "height": 1080})
        
        page = await context.new_page()
        
        # Stealth
        stealth = Stealth(navigator_languages_override=('es-MX', 'es'))
        await stealth.apply_stealth_async(page)
        
        try:
            # Login si es necesario
            if not skip_login or not session_path.exists():
                print("\n[1/4] LOGIN AUTOMÁTICO")
                success = await do_login(page, use_db=use_db)
                if not success:
                    raise RuntimeError("Login fallido")
                
                # Guardar sesión
                storage = await context.storage_state()
                session_path.parent.mkdir(parents=True, exist_ok=True)
                with open(session_path, "w") as f:
                    json.dump(storage, f, indent=2)
                print(f"[Login] Sesión guardada")
            else:
                print("\n[1/4] NAVEGANDO AL DASHBOARD")
                dashboard_url = get_credential("QUALITAS_LOGIN_URL", use_db) or "https://proordersistem.com.mx/"
                await page.goto(f"{dashboard_url.rstrip('/')}/dashboard", wait_until="networkidle")
                await asyncio.sleep(2)
            
            # Manejar modal de aviso (si aparece)
            print("\n[2/4] VERIFICANDO MODAL DE AVISO")
            modal_handled = await handle_qualitas_modal(page)
            if modal_handled:
                print("[Modal] Procesado correctamente")
            else:
                print("[Modal] No se requirió o no se pudo procesar")
            
            # Extracción
            print("\n[3/4] EXTRAYENDO DATOS DEL DASHBOARD")
            extractor = QualitasExtractor(page)
            data = await extractor.extract_full_dashboard()
            
            # Mostrar resultados
            print("\n" + "-" * 60)
            print(f"Taller: {data.taller_nombre}")
            print(f"ID: {data.taller_id}")
            print(f"Total órdenes: {data.total_ordenes}")
            print("-" * 60)
            print(f"{'Estatus':<35} {'Cantidad':>10}")
            print("-" * 60)
            for est in data.estatus:
                print(f"{est.nombre:<35} {est.cantidad:>10}")
            print("-" * 60)
            
            # Guardar JSON
            if save_json:
                filepath = extractor.save_to_file(data)
                print(f"\n[JSON] Guardado en: {filepath}")
            
            # Guardar en base de datos
            try:
                print("\n[DB] Guardando en base de datos...")
                print(f"[DB] Datos a guardar: {data.to_dict()}")
                from app.modules.administracion.qualitas_indicadores import save_indicadores
                record_id = save_indicadores(data.to_dict())
                print(f"[DB] ✓ Guardado con ID: {record_id}")
            except Exception as e:
                print(f"[DB] ✗ Error guardando en DB: {e}")
                import traceback
                print(f"[DB] Traceback: {traceback.format_exc()}")
                # No fallar el workflow por error en DB
            
            # Click en estatus específico si se solicitó
            if click_status:
                print(f"\n[4/4] EXPLORANDO ESTATUS: {click_status}")
                clicked = await extractor.click_on_status_card(click_status)
                if clicked:
                    await asyncio.sleep(2)
                    modal_data = await extractor.extract_modal_data()
                    print(f"[Modal] Título: {modal_data['titulo']}")
                    print(f"[Modal] Registros en tabla: {len(modal_data['tabla'])}")
                    if modal_data['tabla']:
                        print("\nPrimeros registros:")
                        for row in modal_data['tabla'][:3]:
                            print(f"  {row}")
                else:
                    print(f"[Modal] No se pudo abrir {click_status}")
            else:
                print("\n[4/4] Omitido (usar --status NAME para explorar)")
            
            print("\n" + "=" * 60)
            print("✓ WORKFLOW COMPLETADO")
            print("=" * 60)
            
            # Mantener abierto para verificación
            if not headless:
                print("\n[Navegador abierto por 30 segundos...]")
                await asyncio.sleep(30)
            
            return data
            
        finally:
            await context.close()
            await browser.close()


def main():
    parser = argparse.ArgumentParser(description="Qualitas - Workflow Completo")
    parser.add_argument("--skip-login", action="store_true", help="Usar sesión existente")
    parser.add_argument("--headless", action="store_true", help="Modo headless")
    parser.add_argument("--no-save", action="store_true", help="No guardar JSON")
    parser.add_argument("--status", type=str, help="Estatus a explorar (ej: 'Asignados')")
    parser.add_argument("--use-db", action="store_true", default=True, help="Usar credenciales desde la base de datos (default)")
    parser.add_argument("--use-env", action="store_true", help="Usar credenciales desde archivo .envQualitas")
    args = parser.parse_args()
    
    # Determinar si usar DB o .env
    use_db = args.use_db and not args.use_env
    
    # Cargar credenciales
    if not load_credentials(use_db=use_db):
        print("[Error] No se pudieron cargar las credenciales de QUALITAS")
        print("[Info] Verifica que:")
        print("  1. Tienes credenciales configuradas en Admin → Credenciales (para --use-db)")
        print("  2. O tienes el archivo .envQualitas configurado (para --use-env)")
        return
    
    try:
        asyncio.run(run_workflow(
            skip_login=args.skip_login,
            headless=args.headless,
            save_json=not args.no_save,
            click_status=args.status,
            use_db=use_db
        ))
    except KeyboardInterrupt:
        print("\n[Interrumpido]")
    except Exception as e:
        print(f"\n[Error] {e}")
        raise


if __name__ == "__main__":
    main()
