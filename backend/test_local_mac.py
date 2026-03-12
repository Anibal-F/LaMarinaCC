#!/usr/bin/env python3
"""
RPA de Adjudicación Qualitas - EJECUCIÓN LOCAL EN MAC
No necesita conexión a base de datos, los datos se ingresan manualmente.

Uso:
    # Instalar dependencias primero:
    cd ~/Documents/VSC/LaMarinaCC/backend
    python3 -m venv venv
    source venv/bin/activate
    pip install playwright python-dotenv
    playwright install chromium
    
    # Ejecutar:
    python3 test_local_mac.py

Este script abrirá Chromium en tu Mac y mostrará todo el proceso visualmente.
"""

import asyncio
import json
import os
import sys
from pathlib import Path
from datetime import datetime

backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from dotenv import load_dotenv
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

# Cargar credenciales desde .envQualitas
env_qualitas = backend_dir / ".envQualitas"
if env_qualitas.exists():
    load_dotenv(dotenv_path=env_qualitas, override=True)
    print("✅ Credenciales cargadas desde .envQualitas")
else:
    print("⚠️  No se encontró .envQualitas")
    print("   Crea el archivo con:")
    print("   QUALITAS_LOGIN_URL=https://proordersistem.com.mx/")
    print("   QUALITAS_USER=tu_usuario")
    print("   QUALITAS_PASSWORD=tu_password")
    print("   QUALITAS_TALLER_ID=tu_taller_id")
    sys.exit(1)

# ============================================================
# CONFIGURA AQUÍ LOS DATOS DE LA ORDEN
# ============================================================

DATOS_ORDEN = {
    # Número de reporte/siniestro (obligatorio)
    "num_reporte": "407947",  # <-- Cambia esto
    
    # Datos del cliente
    "nombre": "JOSE LUIS",
    "apellidos": "TRUJILLO VAZQUEZ",
    "celular": "6671234567",  # <-- 10 dígitos
    "email_cliente": "",
    
    # Datos del vehículo
    "marca_qualitas_codigo": "DE",  # DE = Dodge, KA = KIA, CT = Chevrolet, etc.
    "placa": "SINPLA",
    "anio_vehiculo": "2023",
    "nro_serie": "",
    
    # Datos de la orden
    "estatus_exp_id": "1",  # 1=Piso, 2=Tránsito, 4=Express
    "ingreso_grua": "0",    # 0=No, 1=Sí
    "ubicacion": "Taller Principal",
    
    # Datos adicionales
    "contratante": "JOSE LUIS TRUJILLO VAZQUEZ",
    "vehiculo_referencia": "Dodge RAM 1500 2023",
}

# Códigos de marca Qualitas
MARCAS_QUALITAS = {
    "ACURA": "AC", "AUDI": "AI", "BMW": "BW", "BUICK": "BK",
    "CADILLAC": "CC", "CHEVROLET": "CT", "CHRYSLER": "CR", "DODGE": "DE",
    "FIAT": "FT", "FORD": "FD", "HONDA": "HA", "HYUNDAI": "HI",
    "INFINITI": "II", "JAC": "JC", "JAGUAR": "JR", "JEEP": "JP",
    "KIA": "KA", "LAMBORGHINI": "LA", "LAND ROVER": "LR", "LEXUS": "LX",
    "MAZDA": "MA", "MERCEDES": "MZ", "MITSUBISHI": "MI", "NISSAN": "NN",
    "PEUGEOT": "PT", "PORSCHE": "PE", "RENAULT": "RT", "SEAT": "ST",
    "SMART": "SM", "SUBARU": "SU", "SUZUKI": "SI", "TESLA": "TE",
    "TOYOTA": "TY", "VOLKSWAGEN": "VW", "VOLVO": "VO", "OTRO": "BS"
}

# ============================================================

class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    END = '\033[0m'
    BOLD = '\033[1m'


def log_step(num, desc):
    print(f"\n{Colors.HEADER}{'='*70}{Colors.END}")
    print(f"{Colors.BOLD}PASO {num}: {desc}{Colors.END}")
    print(f"{Colors.HEADER}{'='*70}{Colors.END}")


def log_action(desc):
    print(f"{Colors.CYAN}  → {desc}{Colors.END}")


def log_success(desc):
    print(f"{Colors.GREEN}  ✓ {desc}{Colors.END}")


def log_error(desc):
    print(f"{Colors.RED}  ✗ {desc}{Colors.END}")


def log_info(desc):
    print(f"{Colors.YELLOW}  ℹ {desc}{Colors.END}")


def pause(message="Presiona ENTER para continuar..."):
    input(f"\n{Colors.YELLOW}{message}{Colors.END}")


async def do_login(page):
    """Login en Qualitas con logs detallados."""
    from app.rpa.qualitas_full_workflow import (
        extract_recaptcha_sitekey,
        solve_recaptcha_2captcha,
        inject_recaptcha_token
    )
    
    login_url = os.getenv("QUALITAS_LOGIN_URL", "https://proordersistem.com.mx/")
    user = os.getenv("QUALITAS_USER", "")
    password = os.getenv("QUALITAS_PASSWORD", "")
    taller_id = os.getenv("QUALITAS_TALLER_ID", "")
    
    if not user or not password:
        log_error("No se encontraron credenciales en .envQualitas")
        return False
    
    log_action(f"Navegando a {login_url}")
    await page.goto(login_url, wait_until="domcontentloaded")
    await asyncio.sleep(2)
    log_success("Página cargada")
    log_info(f"URL actual: {page.url}")
    
    # Verificar campos
    email_field = page.locator('input[placeholder="Email"]')
    if await email_field.count() == 0:
        log_error("No se encontró campo de Email")
        return False
    
    # Llenar credenciales
    log_action(f"Llenando credenciales (usuario: {user})")
    await email_field.fill(user)
    await page.fill('input[placeholder="Password"]', password)
    await page.fill('input[placeholder="ID-Taller"]', taller_id)
    log_success("Credenciales llenadas")
    
    # Aceptar términos
    terms = page.locator('input[type="checkbox"][name="tyc"]').first
    if await terms.count() > 0 and not await terms.is_checked():
        await terms.click()
        log_success("Términos aceptados")
    
    # CAPTCHA
    log_action("Extrayendo sitekey del reCAPTCHA...")
    try:
        site_key = await extract_recaptcha_sitekey(page)
        log_success(f"Sitekey: {site_key[:30]}...")
    except Exception as e:
        log_error(f"Error: {e}")
        return False
    
    log_action("Resolviendo CAPTCHA con 2captcha (~60-120s)...")
    log_info("Esperando respuesta del servicio...")
    try:
        token = await solve_recaptcha_2captcha(site_key, login_url)
        await inject_recaptcha_token(page, token)
        log_success("CAPTCHA resuelto")
    except Exception as e:
        log_error(f"Error CAPTCHA: {e}")
        return False
    
    # Login
    log_action("Haciendo clic en Login...")
    await page.click('input[type="submit"][value="Log In"]')
    await page.wait_for_load_state("networkidle", timeout=30000)
    
    if "dashboard" in page.url.lower():
        log_success(f"¡LOGIN EXITOSO! URL: {page.url}")
        return True
    else:
        log_error(f"Login fallido. URL: {page.url}")
        return False


async def main():
    print(f"\n{Colors.BOLD}{'='*70}{Colors.END}")
    print(f"{Colors.BOLD}  RPA ADJUDICACIÓN QUALITAS - MODO DEBUG LOCAL (MAC){Colors.END}")
    print(f"{Colors.BOLD}{'='*70}{Colors.END}")
    
    print("\n📋 Datos a adjudicar:")
    print(json.dumps(DATOS_ORDEN, indent=2, ensure_ascii=False))
    print()
    
    confirm = input(f"{Colors.YELLOW}¿Proceder? (s/n): {Colors.END}").strip().lower()
    if confirm not in ['s', 'si', 'yes', 'y']:
        print("Cancelado")
        return
    
    # Crear directorio para screenshots
    screenshot_dir = backend_dir / "debug_screenshots" / datetime.now().strftime('%Y%m%d_%H%M%S')
    screenshot_dir.mkdir(parents=True, exist_ok=True)
    log_info(f"Screenshots: {screenshot_dir}")
    
    log_step("1", "INICIANDO CHROMIUM (MODO VISUAL)")
    log_info("Se abrirá una ventana de Chromium en tu Mac...")
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=False,  # MODO VISUAL - Muestra ventana
            args=[
                "--no-sandbox",
                "--disable-blink-features=AutomationControlled",
                "--window-size=1920,1080"
            ]
        )
        
        context = await browser.new_context(viewport={"width": 1920, "height": 1080})
        page = await context.new_page()
        
        stealth = Stealth(navigator_languages_override=('es-MX', 'es'))
        await stealth.apply_stealth_async(page)
        
        log_success("Navegador iniciado - Mira la ventana de Chromium 👀")
        
        try:
            # LOGIN
            log_step("2", "LOGIN EN QUALITAS")
            if not await do_login(page):
                log_error("Login fallido")
                await browser.close()
                return
            
            pause("Login exitoso. Presiona ENTER para continuar con el modal...")
            
            # MODAL
            log_step("3", "MANEJANDO MODAL DE AVISO")
            from app.rpa.qualitas_modal_handler import handle_qualitas_modal
            await handle_qualitas_modal(page)
            log_success("Modal cerrado")
            
            pause("Presiona ENTER para iniciar la búsqueda...")
            
            # ADJUDICACIÓN
            log_step("4", "Navegando a Órdenes Asignadas y Buscando")
            from app.rpa.qualitas_adjudicacion_handler import QualitasAdjudicacionHandler, DatosAdjudicacion
            
            datos_adj = DatosAdjudicacion(**DATOS_ORDEN)
            handler = QualitasAdjudicacionHandler(page)
            
            # Buscar (ahora navega automáticamente a BandejaQualitas)
            log_action(f"Navegando a Bandeja Qualitas y buscando reporte: {DATOS_ORDEN['num_reporte']}")
            encontrado = await handler.buscar_expediente(num_reporte=DATOS_ORDEN['num_reporte'])
            
            if not encontrado:
                log_error("Orden no encontrada en Qualitas")
                log_info("Posibles causas:")
                log_info("  - La orden no está asignada a tu taller")
                log_info("  - El número de reporte es incorrecto")
                log_info("  - La orden ya fue adjudicada")
                pause("Presiona ENTER para cerrar...")
                await browser.close()
                return
            
            log_success("Orden encontrada!")
            pause("Presiona ENTER para abrir el modal de adjudicación...")
            
            # Abrir modal
            log_action("Abriendo modal de adjudicación...")
            if not await handler.abrir_modal_adjudicacion(DATOS_ORDEN['num_reporte']):
                log_error("No se pudo abrir el modal")
                pause()
                await browser.close()
                return
            
            log_success("Modal abierto")
            pause("Presiona ENTER para llenar el formulario...")
            
            # Llenar formulario
            log_action("Llenando formulario...")
            if not await handler.llenar_formulario_adjudicacion(datos_adj):
                log_error("Error llenando formulario")
                pause()
                await browser.close()
                return
            
            log_success("Formulario llenado")
            pause("Presiona ENTER para guardar (ADJUDICAR)...")
            
            # Guardar
            log_action("Guardando adjudicación...")
            if await handler.guardar_adjudicacion():
                log_success("¡¡¡ADJUDICACIÓN EXITOSA!!! 🎉")
            else:
                log_error("No se pudo guardar")
            
            pause("Presiona ENTER para cerrar el navegador...")
            
        except KeyboardInterrupt:
            print(f"\n{Colors.YELLOW}[Cancelado]{Colors.End}")
        except Exception as e:
            log_error(f"Error: {e}")
            import traceback
            print(traceback.format_exc())
        finally:
            print(f"\n{Colors.CYAN}Cerrando navegador...{Colors.END}")
            await browser.close()
            log_info(f"Screenshots guardados en: {screenshot_dir}")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print(f"\n{Colors.YELLOW}Cancelado{Colors.END}")
