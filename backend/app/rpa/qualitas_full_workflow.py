"""
Workflow completo: Login automático + Extracción de datos de Qualitas.

Uso:
    python3 -m app.rpa.qualitas_full_workflow
    
Opciones:
    --skip-login    Usar sesión existente (más rápido)
    --headless      Ejecutar sin ventana visible
    --save-json     Guardar datos en archivo JSON
    --status NAME   Hacer click en un estatus específico y extraer detalle
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


# Cargar variables de entorno
backend_dir = Path(__file__).resolve().parents[2]
env_qualitas = backend_dir / ".envQualitas"
if env_qualitas.exists():
    load_dotenv(dotenv_path=env_qualitas, override=True)


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


async def do_login(page) -> bool:
    """Realiza el login automático."""
    login_url = os.getenv("QUALITAS_LOGIN_URL", "https://proordersistem.com.mx/")
    user = os.getenv("QUALITAS_USER")
    password = os.getenv("QUALITAS_PASSWORD")
    taller_id = os.getenv("QUALITAS_TALLER_ID")
    site_key = os.getenv("QUALITAS_RECAPTCHA_SITE_KEY")
    
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
                       save_json: bool = True, click_status: str = None):
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
                success = await do_login(page)
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
                await page.goto("https://proordersistem.com.mx/dashboard", wait_until="networkidle")
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
    args = parser.parse_args()
    
    try:
        asyncio.run(run_workflow(
            skip_login=args.skip_login,
            headless=args.headless,
            save_json=not args.no_save,
            click_status=args.status
        ))
    except KeyboardInterrupt:
        print("\n[Interrumpido]")
    except Exception as e:
        print(f"\n[Error] {e}")
        raise


if __name__ == "__main__":
    main()
