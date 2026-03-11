#!/usr/bin/env python3
"""
Script para debug visual de adjudicación de Qualitas.
ABRE CHROMIUM Y MUESTRA CADA PASO EN TIEMPO REAL.

Uso:
    # Desde tu Mac, con X11 forwarding:
    ssh -X -i LaMarinaCC.pem ubuntu@<IP_SERVIDOR>
    
    # Luego en el servidor:
    cd ~/LaMarinaCC/backend
    python3 test_adjudicacion_visual_debug.py 04260407947

Requisitos:
    - Conexión SSH con X11 forwarding: ssh -X
    - XQuartz instalado en Mac (https://www.xquartz.org/)
    - Una orden de Qualitas existente en la BD
"""

import argparse
import asyncio
import json
import sys
import os
from pathlib import Path
from datetime import datetime

backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from dotenv import load_dotenv
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

from app.rpa.qualitas_adjudicacion_handler import (
    QualitasAdjudicacionHandler,
    DatosAdjudicacion,
    obtener_codigo_marca_qualitas
)
from app.rpa.qualitas_modal_handler import handle_qualitas_modal
from app.rpa.credentials_helper import setup_qualitas_env, get_qualitas_credentials

env_qualitas = backend_dir / ".envQualitas"
if env_qualitas.exists():
    load_dotenv(dotenv_path=env_qualitas, override=True)


class DebugColors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    END = '\033[0m'
    BOLD = '\033[1m'


def log_step(num, desc):
    print(f"\n{DebugColors.HEADER}{'='*70}{DebugColors.END}")
    print(f"{DebugColors.BOLD}PASO {num}: {desc}{DebugColors.END}")
    print(f"{DebugColors.HEADER}{'='*70}{DebugColors.END}")


def log_action(desc):
    print(f"{DebugColors.CYAN}  → {desc}{DebugColors.END}")


def log_success(desc):
    print(f"{DebugColors.GREEN}  ✓ {desc}{DebugColors.END}")


def log_error(desc):
    print(f"{DebugColors.RED}  ✗ {desc}{DebugColors.END}")


def log_info(desc):
    print(f"{DebugColors.YELLOW}  ℹ {desc}{DebugColors.END}")


def obtener_datos_desde_bd(num_reporte: str) -> dict:
    """Obtiene datos de la orden desde la BD."""
    try:
        from app.core.db import get_db_connection
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT 
                reporte_siniestro,
                nb_cliente,
                tel_cliente,
                email_cliente,
                marca_vehiculo,
                tipo_vehiculo,
                modelo_anio,
                color_vehiculo,
                serie_auto,
                placas,
                seguro_comp
            FROM recepcion_ordenes_admision
            WHERE reporte_siniestro = %s
            LIMIT 1
        """, (num_reporte,))
        
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        
        if not row:
            return None
        
        # Procesar nombre
        nombre_completo = row[1] or ""
        partes_nombre = nombre_completo.strip().split()
        
        if len(partes_nombre) >= 3:
            nombre = " ".join(partes_nombre[:2])
            apellidos = " ".join(partes_nombre[2:])
        elif len(partes_nombre) == 2:
            nombre = partes_nombre[0]
            apellidos = partes_nombre[1]
        elif len(partes_nombre) == 1:
            nombre = partes_nombre[0]
            apellidos = ""
        else:
            nombre = "CLIENTE"
            apellidos = "GENERICO"
        
        # Limpiar teléfono
        telefono = (row[2] or "").replace("-", "").replace(" ", "").replace("(", "").replace(")", "")
        telefono = ''.join(c for c in telefono if c.isdigit())
        
        # Mapear marca
        marca_codigo = obtener_codigo_marca_qualitas(row[4] or "")
        
        return {
            "num_reporte": row[0],
            "nombre": nombre.upper(),
            "apellidos": apellidos.upper(),
            "celular": telefono[-10:] if len(telefono) > 10 else telefono,
            "email_cliente": row[3] or "",
            "marca_qualitas_codigo": marca_codigo,
            "marca_vehiculo": row[4] or "",
            "tipo_vehiculo": row[5] or "",
            "anio_vehiculo": str(row[6]) if row[6] else "",
            "color_vehiculo": row[7] or "",
            "nro_serie": row[8] or "",
            "placa": (row[9] or "").upper(),
            "estatus_exp_id": "1",
            "ingreso_grua": "0",
            "ubicacion": "Taller Principal",
            "contratante": nombre_completo.upper(),
            "vehiculo_referencia": f"{row[4] or ''} {row[5] or ''} {row[6] or ''}".strip(),
        }
    except Exception as e:
        log_error(f"Error obteniendo datos de BD: {e}")
        return None


async def capture_screenshot(page, step_name, screenshot_dir):
    """Captura screenshot y la guarda."""
    timestamp = datetime.now().strftime('%H%M%S')
    filename = f"{timestamp}_{step_name}.png"
    filepath = screenshot_dir / filename
    await page.screenshot(path=str(filepath), full_page=False)
    log_info(f"Screenshot guardado: {filepath.name}")
    return filepath


async def do_login_with_debug(page, use_db=True, screenshot_dir=None):
    """Login con capturas de pantalla en cada paso."""
    from app.rpa.qualitas_full_workflow import (
        extract_recaptcha_sitekey,
        solve_recaptcha_2captcha,
        inject_recaptcha_token
    )
    
    creds = get_qualitas_credentials() if use_db else None
    if creds:
        login_url = creds.get("plataforma_url", "https://proordersistem.com.mx/")
        user = creds.get("usuario", "")
        password = creds.get("password", "")
        taller_id = creds.get("taller_id", "")
    else:
        import os
        login_url = os.getenv("QUALITAS_LOGIN_URL", "https://proordersistem.com.mx/")
        user = os.getenv("QUALITAS_USER", "")
        password = os.getenv("QUALITAS_PASSWORD", "")
        taller_id = os.getenv("QUALITAS_TALLER_ID", "")
    
    log_action(f"Navegando a {login_url}")
    await page.goto(login_url, wait_until="domcontentloaded")
    await asyncio.sleep(2)
    
    if screenshot_dir:
        await capture_screenshot(page, "01_pagina_login", screenshot_dir)
    
    log_success("Página de login cargada")
    log_info(f"URL actual: {page.url}")
    
    # Verificar elementos del formulario
    log_action("Verificando campos del formulario...")
    email_field = page.locator('input[placeholder="Email"]')
    pass_field = page.locator('input[placeholder="Password"]')
    taller_field = page.locator('input[placeholder="ID-Taller"]')
    
    if await email_field.count() == 0:
        log_error("No se encontró campo de Email")
        return False
    
    log_success("Campos del formulario encontrados")
    
    # Llenar credenciales
    log_action(f"Llenando credenciales (usuario: {user})")
    await email_field.fill(user)
    await pass_field.fill(password)
    await taller_field.fill(taller_id)
    log_success("Credenciales llenadas")
    
    if screenshot_dir:
        await capture_screenshot(page, "02_credenciales_llenas", screenshot_dir)
    
    # Aceptar términos
    log_action("Aceptando términos y condiciones...")
    terms = page.locator('input[type="checkbox"][name="tyc"]').first
    if await terms.count() > 0 and not await terms.is_checked():
        await terms.click()
        log_success("Términos aceptados")
    
    # Extraer sitekey
    log_action("Extrayendo sitekey del reCAPTCHA...")
    try:
        site_key = await extract_recaptcha_sitekey(page)
        log_success(f"Sitekey obtenida: {site_key[:30]}...")
    except Exception as e:
        log_error(f"Error obteniendo sitekey: {e}")
        return False
    
    # Resolver CAPTCHA
    log_action("Resolviendo reCAPTCHA con 2captcha (espera ~60-120s)...")
    log_info("Puedes ver el progreso en tiempo real arriba ☝️")
    
    try:
        token = await solve_recaptcha_2captcha(site_key, login_url)
        await inject_recaptcha_token(page, token)
        log_success("CAPTCHA resuelto exitosamente")
    except Exception as e:
        log_error(f"Error resolviendo CAPTCHA: {e}")
        return False
    
    if screenshot_dir:
        await capture_screenshot(page, "03_captcha_resuelto", screenshot_dir)
    
    # Click en login
    log_action("Haciendo clic en botón Login...")
    await page.click('input[type="submit"][value="Log In"]')
    
    log_info("Esperando navegación...")
    await page.wait_for_load_state("networkidle", timeout=30000)
    
    if screenshot_dir:
        await capture_screenshot(page, "04_despues_login", screenshot_dir)
    
    if "dashboard" in page.url.lower():
        log_success(f"¡LOGIN EXITOSO! URL: {page.url}")
        return True
    else:
        log_error(f"Login fallido. URL actual: {page.url}")
        return False


async def main():
    parser = argparse.ArgumentParser(
        description="Debug Visual - RPA Adjudicación Qualitas",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos:
  # Ejecutar con una orden específica
  python3 test_adjudicacion_visual_debug.py 04260407947
  
  # Solo login (para verificar credenciales)
  python3 test_adjudicacion_visual_debug.py --solo-login
  
  # Sin screenshots (más rápido)
  python3 test_adjudicacion_visual_debug.py 04260407947 --no-screenshots
        """
    )
    
    parser.add_argument("reporte", nargs="?", help="Número de reporte a adjudicar")
    parser.add_argument("--solo-login", action="store_true", help="Solo hacer login y parar")
    parser.add_argument("--no-screenshots", action="store_true", help="No capturar screenshots")
    parser.add_argument("--esperar", type=int, default=0, help="Segundos a esperar al final (para inspeccionar)")
    
    args = parser.parse_args()
    
    if not args.reporte and not args.solo_login:
        parser.print_help()
        print(f"\n{DebugColors.RED}ERROR: Debes proporcionar un número de reporte o usar --solo-login{DebugColors.END}")
        return
    
    # Crear directorio para screenshots
    screenshot_dir = None
    if not args.no_screenshots:
        screenshot_dir = backend_dir / "debug_screenshots" / datetime.now().strftime('%Y%m%d_%H%M%S')
        screenshot_dir.mkdir(parents=True, exist_ok=True)
        log_info(f"Screenshots se guardarán en: {screenshot_dir}")
    
    # Obtener datos
    datos = None
    if args.reporte:
        datos = obtener_datos_desde_bd(args.reporte)
        if not datos:
            log_error(f"No se encontró la orden {args.reporte}")
            return
        
        print(f"\n{DebugColors.BOLD}Datos a adjudicar:{DebugColors.END}")
        print(json.dumps(datos, indent=2, ensure_ascii=False))
        print()
    
    # Confirmar
    if not args.solo_login:
        confirm = input(f"{DebugColors.YELLOW}¿Proceder con la adjudicación? (s/n): {DebugColors.END}").strip().lower()
        if confirm not in ['s', 'si', 'yes', 'y']:
            print("Cancelado")
            return
    
    # Iniciar navegador
    log_step("1", "INICIANDO NAVEGADOR CHROMIUM (MODO VISUAL)")
    log_info("Se abrirá una ventana de Chromium en tu Mac")
    log_info("Asegúrate de tener XQuartz corriendo si es necesario")
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=False,  # MODO VISUAL - Muestra la ventana
            args=[
                "--no-sandbox",
                "--disable-blink-features=AutomationControlled",
                "--window-size=1920,1080",
                "--window-position=0,0"
            ]
        )
        
        context = await browser.new_context(viewport={"width": 1920, "height": 1080})
        page = await context.new_page()
        
        # Stealth
        stealth = Stealth(navigator_languages_override=('es-MX', 'es'))
        await stealth.apply_stealth_async(page)
        
        log_success("Navegador iniciado - Ventana visible abierta")
        
        try:
            # LOGIN
            log_step("2", "LOGIN EN QUALITAS")
            success = await do_login_with_debug(page, use_db=True, screenshot_dir=screenshot_dir)
            
            if not success:
                log_error("No se pudo iniciar sesión")
                await browser.close()
                return
            
            if args.solo_login:
                log_success("Login exitoso - Modo solo-login activado")
                if args.esperar > 0:
                    log_info(f"Esperando {args.esperar} segundos...")
                    await asyncio.sleep(args.esperar)
                await browser.close()
                return
            
            # MODAL DE AVISO
            log_step("3", "MANEJANDO MODAL DE AVISO")
            await asyncio.sleep(2)
            modal_result = await handle_qualitas_modal(page)
            if modal_result:
                log_success("Modal manejado")
            
            if screenshot_dir:
                await capture_screenshot(page, "05_dashboard", screenshot_dir)
            
            # ADJUDICACIÓN
            log_step("4", "ADJUDICANDO ORDEN")
            
            datos_adj = DatosAdjudicacion(**datos)
            handler = QualitasAdjudicacionHandler(page)
            
            # Modificar handler para screenshots
            original_buscar = handler.buscar_expediente
            
            async def buscar_con_screenshot(id_expediente=None, num_reporte=None):
                log_action(f"Buscando expediente: {num_reporte or id_expediente}")
                if screenshot_dir:
                    await capture_screenshot(page, "06_antes_busqueda", screenshot_dir)
                result = await original_buscar(id_expediente, num_reporte)
                if screenshot_dir:
                    await capture_screenshot(page, "07_despues_busqueda", screenshot_dir)
                return result
            
            handler.buscar_expediente = buscar_con_screenshot
            
            resultado = await handler.adjudicar_orden(datos_adj)
            
            # RESULTADO
            log_step("5", "RESULTADO FINAL")
            if resultado.exito:
                log_success("¡ADJUDICACIÓN EXITOSA!")
                print(f"{DebugColors.GREEN}Mensaje: {resultado.mensaje}{DebugColors.END}")
            else:
                log_error("ADJUDICACIÓN FALLIDA")
                print(f"{DebugColors.RED}Mensaje: {resultado.mensaje}{DebugColors.END}")
                if resultado.errores:
                    print(f"{DebugColors.RED}Errores: {resultado.errores}{DebugColors.END}")
            
            if screenshot_dir:
                await capture_screenshot(page, "08_resultado_final", screenshot_dir)
            
            # Esperar para inspección
            if args.esperar > 0:
                log_info(f"Esperando {args.esperar} segundos para inspección...")
                print(f"{DebugColors.YELLOW}Puedes interactuar con el navegador ahora{DebugColors.END}")
                await asyncio.sleep(args.esperar)
            
            log_step("6", "FINALIZADO")
            if screenshot_dir:
                log_info(f"Screenshots guardados en: {screenshot_dir}")
            
        except KeyboardInterrupt:
            print(f"\n{DebugColors.YELLOW}[Usuario canceló]{DebugColors.END}")
        except Exception as e:
            log_error(f"Error: {e}")
            import traceback
            print(traceback.format_exc())
        finally:
            print(f"\n{DebugColors.CYAN}Cerrando navegador...{DebugColors.END}")
            await browser.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print(f"\n{DebugColors.YELLOW}Cancelado{DebugColors.END}")
