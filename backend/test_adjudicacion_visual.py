#!/usr/bin/env python3
"""
Script para probar la adjudicación de Qualitas en modo VISUAL.
Abre el navegador Chromium para que puedas ver cada paso.

Uso:
    cd backend
    python3 test_adjudicacion_visual.py

Requisitos:
    - Estar conectado al servidor con X11 forwarding o tener display gráfico
    - O usar VNC si estás en EC2
"""

import asyncio
import json
import sys
from pathlib import Path

# Agregar el path del backend
backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from dotenv import load_dotenv
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

# Importar módulos del RPA
from app.rpa.qualitas_adjudicacion_handler import (
    QualitasAdjudicacionHandler,
    DatosAdjudicacion,
    obtener_codigo_marca_qualitas
)
from app.rpa.qualitas_modal_handler import handle_qualitas_modal
from app.rpa.credentials_helper import setup_qualitas_env, get_qualitas_credentials

# Cargar variables de entorno
env_qualitas = backend_dir / ".envQualitas"
if env_qualitas.exists():
    load_dotenv(dotenv_path=env_qualitas, override=True)


# ============================================================
# CONFIGURA AQUÍ LOS DATOS DE LA ORDEN A ADJUDICAR
# ============================================================

DATOS_ORDEN = {
    # Número de reporte/siniestro (obligatorio - se usa para buscar)
    "num_reporte": "04260407947",  # <-- Cambia esto
    
    # Datos del cliente
    "nombre": "JOSE LUIS",
    "apellidos": "TRUJILLO VAZQUEZ",
    "celular": "6671234567",  # <-- Cambia esto (10 dígitos)
    "email_cliente": "",
    
    # Datos del vehículo
    "marca_qualitas_codigo": "DE",  # DE = Dodge
    "placa": "SINPLA",
    "anio_vehiculo": "2023",
    "nro_serie": "",
    
    # Datos de la orden
    "estatus_exp_id": "1",  # 1=Piso, 2=Tránsito, 4=Express
    "ingreso_grua": "0",  # 0=No, 1=Sí
    "ubicacion": "Taller Principal",
}

# ============================================================


def log_paso(numero, descripcion):
    """Imprime un paso con formato."""
    print(f"\n{'='*60}")
    print(f"PASO {numero}: {descripcion}")
    print('='*60)


def log_subpaso(descripcion):
    """Imprime un sub-paso."""
    print(f"  → {descripcion}")


def log_exito(mensaje):
    """Imprime un mensaje de éxito."""
    print(f"  ✓ {mensaje}")


def log_error(mensaje):
    """Imprime un mensaje de error."""
    print(f"  ✗ {mensaje}")


def log_info(mensaje):
    """Imprime información."""
    print(f"  ℹ {mensaje}")


async def do_login(page, use_db=True):
    """Realiza el login automático en Qualitas."""
    from app.rpa.qualitas_full_workflow import (
        extract_recaptcha_sitekey,
        solve_recaptcha_2captcha,
        inject_recaptcha_token
    )
    
    # Obtener credenciales
    creds = get_qualitas_credentials() if use_db else None
    if creds:
        login_url = creds.get("plataforma_url", "https://proordersistem.com.mx/")
        user = creds.get("usuario", "")
        password = creds.get("password", "")
        taller_id = creds.get("taller_id", "")
        log_info(f"Usando credenciales de BD: {user}")
    else:
        import os
        login_url = os.getenv("QUALITAS_LOGIN_URL", "https://proordersistem.com.mx/")
        user = os.getenv("QUALITAS_USER", "")
        password = os.getenv("QUALITAS_PASSWORD", "")
        taller_id = os.getenv("QUALITAS_TALLER_ID", "")
        log_info(f"Usando credenciales de .env: {user}")
    
    if not user or not password:
        log_error("No se encontraron credenciales")
        return False
    
    log_subpaso(f"Navegando a {login_url}...")
    await page.goto(login_url, wait_until="domcontentloaded")
    await asyncio.sleep(2)
    log_exito("Página cargada")
    
    # Extraer sitekey del reCAPTCHA
    log_subpaso("Extrayendo sitekey del reCAPTCHA...")
    try:
        site_key = await extract_recaptcha_sitekey(page)
        log_exito(f"Sitekey obtenido: {site_key[:20]}...")
    except Exception as e:
        log_error(f"No se pudo obtener sitekey: {e}")
        return False
    
    # Llenar credenciales
    log_subpaso("Llenando credenciales...")
    await page.fill('input[placeholder="Email"]', user)
    await page.fill('input[placeholder="Password"]', password)
    await page.fill('input[placeholder="ID-Taller"]', taller_id)
    log_exito("Credenciales llenadas")
    
    # Aceptar términos
    log_subpaso("Aceptando términos...")
    terms = page.locator('input[type="checkbox"][name="tyc"]').first
    if not await terms.is_checked():
        await terms.click()
    log_exito("Términos aceptados")
    
    # Resolver CAPTCHA
    log_subpaso("Resolviendo reCAPTCHA (puede tomar 10-20 segundos)...")
    try:
        token = await solve_recaptcha_2captcha(site_key, login_url)
        await inject_recaptcha_token(page, token)
        log_exito("CAPTCHA resuelto")
    except Exception as e:
        log_error(f"Error con CAPTCHA: {e}")
        return False
    
    # Click en login
    log_subpaso("Haciendo clic en Login...")
    await page.click('input[type="submit"][value="Log In"]')
    await page.wait_for_load_state("networkidle", timeout=30000)
    
    if "dashboard" in page.url.lower():
        log_exito(f"Login exitoso! URL: {page.url}")
        return True
    else:
        log_error(f"Login fallido. URL actual: {page.url}")
        # Tomar screenshot del error
        await page.screenshot(path="/tmp/login_error.png")
        log_info("Screenshot guardado en: /tmp/login_error.png")
        return False


async def main():
    """Función principal."""
    print("\n" + "="*60)
    print("RPA DE ADJUDICACIÓN QUALITAS - MODO VISUAL")
    print("="*60)
    print("\nEste script abrirá el navegador para que veas cada paso.")
    print("Presiona Ctrl+C para cancelar en cualquier momento.")
    print("\nDatos a adjudicar:")
    print(json.dumps(DATOS_ORDEN, indent=2, ensure_ascii=False))
    
    # Verificar credenciales
    log_paso("0", "VERIFICACIÓN DE CREDENCIALES")
    if not setup_qualitas_env():
        log_error("No se pudieron cargar credenciales desde BD")
        log_info("Intentando cargar desde .envQualitas...")
    else:
        creds = get_qualitas_credentials()
        log_exito(f"Credenciales cargadas: {creds.get('usuario', 'N/A')}")
    
    # Iniciar Playwright
    log_paso("1", "INICIANDO NAVEGADOR (MODO VISUAL)")
    log_info("El navegador se abrirá en una ventana nueva...")
    
    async with async_playwright() as p:
        # IMPORTANTE: headless=False para ver el navegador
        browser = await p.chromium.launch(
            headless=False,  # <-- MODO VISUAL
            args=[
                "--no-sandbox",
                "--disable-blink-features=AutomationControlled",
                "--window-size=1920,1080"
            ]
        )
        
        context = await browser.new_context(
            viewport={"width": 1920, "height": 1080}
        )
        page = await context.new_page()
        
        # Aplicar stealth para evitar detección
        stealth = Stealth(navigator_languages_override=('es-MX', 'es'))
        await stealth.apply_stealth_async(page)
        log_exito("Navegador iniciado en modo VISUAL")
        
        try:
            # LOGIN
            log_paso("2", "LOGIN EN QUALITAS")
            success = await do_login(page, use_db=True)
            if not success:
                log_error("No se pudo iniciar sesión")
                await browser.close()
                return
            
            # Esperar a que cargue el dashboard
            await asyncio.sleep(3)
            
            # MANEJAR MODAL DE AVISO
            log_paso("3", "MANEJANDO MODAL DE AVISO")
            modal_handled = await handle_qualitas_modal(page)
            if modal_handled:
                log_exito("Modal de aviso cerrado")
            else:
                log_info("No apareció modal de aviso (o ya estaba cerrado)")
            
            # ADJUDICACIÓN
            log_paso("4", "EJECUTANDO ADJUDICACIÓN")
            
            # Crear datos de adjudicación
            datos = DatosAdjudicacion(**DATOS_ORDEN)
            
            # Ejecutar adjudicación
            handler = QualitasAdjudicacionHandler(page)
            resultado = await handler.adjudicar_orden(datos)
            
            # RESULTADO
            log_paso("5", "RESULTADO")
            if resultado.exito:
                log_exito("¡ADJUDICACIÓN EXITOSA!")
                log_info(f"Mensaje: {resultado.mensaje}")
            else:
                log_error("ADJUDICACIÓN FALLIDA")
                log_info(f"Mensaje: {resultado.mensaje}")
                if resultado.errores:
                    log_info(f"Errores: {resultado.errores}")
            
            # Pausa para que el usuario vea el resultado
            log_paso("6", "FINALIZADO")
            print("\nEl proceso ha terminado. El navegador se mantendrá abierto.")
            print("Presiona Ctrl+C en esta terminal para cerrar.")
            
            # Mantener el navegador abierto indefinidamente
            while True:
                await asyncio.sleep(1)
                
        except KeyboardInterrupt:
            print("\n\n[Usuario canceló el proceso]")
        except Exception as e:
            log_error(f"Error inesperado: {e}")
            import traceback
            print(traceback.format_exc())
        finally:
            print("\nCerrando navegador...")
            await browser.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\nProceso cancelado por el usuario.")
        sys.exit(0)
