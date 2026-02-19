"""
Ejemplo de uso del RPA Stealth para Qualitas.

Este script demuestra cómo usar las capacidades avanzadas del RPA
para automatizar el login y extracción de datos de Qualitas.
"""

import asyncio
from pathlib import Path

from playwright.async_api import async_playwright
from playwright_stealth import Stealth

from qualitas_login_stealth import (
    QualitasRpaConfig,
    load_config,
    setup_stealth_browser_context,
    apply_cdp_evasion,
    wait_for_recaptcha_validation,
    humanized_fill,
)
from qualitas_session_manager import QualitasSessionManager, verify_session_active


async def extract_dashboard_data(page) -> dict:
    """
    Ejemplo: Extrae datos del dashboard de Qualitas.
    
    Implementa aquí la lógica específica para extraer:
    - Estatus de órdenes
    - Información de cargas
    - Información de descargas
    """
    data = {
        "url": page.url,
        "timestamp": asyncio.get_event_loop().time(),
        "extracted_data": []
    }
    
    # Ejemplo: Extraer todas las tablas visibles
    tables = await page.locator("table").all()
    for i, table in enumerate(tables):
        try:
            rows = await table.locator("tr").all()
            table_data = []
            for row in rows[:10]:  # Limitar a 10 filas
                cells = await row.locator("td, th").all()
                row_data = []
                for cell in cells:
                    text = await cell.text_content()
                    row_data.append(text.strip() if text else "")
                if row_data:
                    table_data.append(row_data)
            if table_data:
                data["extracted_data"].append({
                    f"table_{i}": table_data
                })
        except Exception as e:
            print(f"[Extractor] Error en tabla {i}: {e}")
    
    return data


async def run_with_session_reuse():
    """
    Ejemplo: Ejecuta el RPA reutilizando sesiones guardadas.
    """
    config = load_config()
    session_manager = QualitasSessionManager()
    
    print("=" * 60)
    print("RPA Qualitas - Ejemplo con reutilización de sesión")
    print("=" * 60)
    
    # Verificar si tenemos una sesión fresca
    if session_manager.is_session_fresh(max_age_hours=8):
        print("[Main] Sesión fresca encontrada, intentando reutilizar...")
        
        async with async_playwright() as playwright:
            browser, context, cdp_session = await setup_stealth_browser_context(playwright, config)
            
            # Cargar sesión guardada
            loaded = await session_manager.load_session(context)
            if loaded:
                page = await context.new_page()
                stealth_config = Stealth(
                    navigator_languages_override=('es-MX', 'es', 'en-US', 'en'),
                    navigator_platform_override='MacIntel',
                )
                await stealth_config.apply_stealth_async(page)
                
                # Verificar si la sesión sigue activa
                is_active = await verify_session_active(page)
                
                if is_active:
                    print("[Main] ¡Sesión reutilizada exitosamente!")
                    
                    # Extraer datos
                    data = await extract_dashboard_data(page)
                    print(f"[Main] Datos extraídos: {len(data['extracted_data'])} tablas")
                    
                    await context.close()
                    await browser.close()
                    return data
                else:
                    print("[Main] Sesión expirada, se requiere nuevo login")
            
            await context.close()
            await browser.close()
    
    # Si no hay sesión o expiró, hacer login nuevo
    print("[Main] Iniciando proceso de login...")
    
    # Aquí llamarías al login stealth completo
    from qualitas_login_stealth import run_login
    await run_login(config, Path("sessions/qualitas_session_default.json"))
    
    return {"status": "login_completed"}


async def run_data_extraction_workflow():
    """
    Ejemplo: Flujo completo de extracción de datos.
    """
    config = load_config()
    session_manager = QualitasSessionManager()
    
    async with async_playwright() as playwright:
        browser, context, cdp_session = await setup_stealth_browser_context(playwright, config)
        
        # Intentar cargar sesión existente
        session_loaded = await session_manager.load_session(context)
        
        page = await context.new_page()
        await stealth_async(page)
        
        if cdp_session:
            await apply_cdp_evasion(page, cdp_session)
        
        # Navegar al sitio
        await page.goto(config.login_url, wait_until="domcontentloaded")
        
        # Verificar si necesitamos login
        if "login" in page.url.lower() or not session_loaded:
            print("[Workflow] Login requerido")
            
            # Llenar formulario
            await humanized_fill(page, config.email_selector, config.user)
            await humanized_fill(page, config.password_selector, config.password)
            await humanized_fill(page, config.taller_id_selector, config.taller_id)
            
            # Términos
            if config.terms_selector:
                terms = page.locator(config.terms_selector).first
                if not await terms.is_checked():
                    await terms.click()
            
            # reCAPTCHA
            await wait_for_recaptcha_validation(page, config)
            
            # Login
            await page.click(config.login_button_selector)
            await page.wait_for_load_state("networkidle")
            
            # Guardar nueva sesión
            await session_manager.save_session(context)
        
        print(f"[Workflow] URL actual: {page.url}")
        
        # Aquí implementarías la navegación específica para:
        # - Consultar estatus de órdenes
        # - Descargar reportes
        # - Cargar información
        
        # Ejemplo: Esperar a que cargue el dashboard
        await asyncio.sleep(2)
        
        # Extraer datos
        data = await extract_dashboard_data(page)
        print(f"[Workflow] Extracción completada: {data}")
        
        await context.close()
        await browser.close()
        
        return data


def main():
    """Punto de entrada principal."""
    import sys
    
    if len(sys.argv) < 2:
        print("Uso: python qualitas_example_usage.py <comando>")
        print("")
        print("Comandos disponibles:")
        print("  session-reuse    - Ejemplo de reutilización de sesión")
        print("  extract          - Ejemplo de extracción de datos")
        print("")
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "session-reuse":
        result = asyncio.run(run_with_session_reuse())
        print(f"\nResultado: {result}")
    
    elif command == "extract":
        result = asyncio.run(run_data_extraction_workflow())
        print(f"\nResultado: {result}")
    
    else:
        print(f"Comando desconocido: {command}")


if __name__ == "__main__":
    main()
