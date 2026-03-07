"""
Runner para ejecutar adjudicaciones de Qualitas desde línea de comandos.

Este script es llamado por el endpoint de RPA para ejecutar adjudicaciones.
Lee los datos desde un archivo JSON y ejecuta el proceso de adjudicación.

Uso:
    python3 -m app.rpa.qualitas_adjudicacion_runner <archivo_datos.json> [--headless] [--use-db]
"""

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Dict, List, Any

from dotenv import load_dotenv
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

# Intentar importar el handler de adjudicación
try:
    from app.rpa.qualitas_adjudicacion_handler import (
        QualitasAdjudicacionHandler,
        DatosAdjudicacion,
        ResultadoAdjudicacion,
        obtener_codigo_marca_qualitas
    )
    from app.rpa.qualitas_modal_handler import handle_qualitas_modal
    from app.rpa.credentials_helper import setup_qualitas_env, get_qualitas_credentials
    HANDLER_AVAILABLE = True
except ImportError as e:
    print(f"[Error] No se pudo importar el handler: {e}")
    HANDLER_AVAILABLE = False
    sys.exit(1)


# Cargar variables de entorno
backend_dir = Path(__file__).resolve().parents[2]
env_qualitas = backend_dir / ".envQualitas"
if env_qualitas.exists():
    load_dotenv(dotenv_path=env_qualitas, override=True)


def get_credential(key: str, use_db: bool = True) -> str:
    """Obtiene una credencial, priorizando DB si está disponible."""
    if use_db:
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
    
    return os.getenv(key, "")


async def do_login(page, use_db: bool = True) -> bool:
    """Realiza el login automático en Qualitas."""
    from app.rpa.qualitas_full_workflow import (
        extract_recaptcha_sitekey,
        solve_recaptcha_2captcha,
        inject_recaptcha_token
    )
    
    login_url = get_credential("QUALITAS_LOGIN_URL", use_db) or "https://proordersistem.com.mx/"
    user = get_credential("QUALITAS_USER", use_db)
    password = get_credential("QUALITAS_PASSWORD", use_db)
    taller_id = get_credential("QUALITAS_TALLER_ID", use_db)
    
    if not user or not password:
        print("[Login] ✗ Error: No se encontraron credenciales")
        return False
    
    print("[Login] Navegando...")
    await page.goto(login_url, wait_until="domcontentloaded")
    await asyncio.sleep(2)
    
    # Extraer sitekey
    try:
        site_key = await extract_recaptcha_sitekey(page)
    except Exception as e:
        print(f"[Login] ✗ Error obteniendo sitekey: {e}")
        return False
    
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


def dict_to_datos_adjudicacion(data: Dict[str, Any]) -> DatosAdjudicacion:
    """Convierte un diccionario a DatosAdjudicacion."""
    return DatosAdjudicacion(
        id_expediente=str(data.get('id_expediente', '')),
        wsreportid=str(data.get('wsreportid', '')),
        num_reporte=str(data.get('num_reporte', '')),
        nombre=data.get('nombre', ''),
        apellidos=data.get('apellidos', ''),
        lada=data.get('lada', '521'),
        celular=data.get('celular', ''),
        tel_fijo=data.get('tel_fijo', ''),
        email_cliente=data.get('email_cliente', ''),
        marca_qualitas_codigo=data.get('marca_qualitas_codigo', ''),
        marca_taller_id=data.get('marca_taller_id'),
        modelo_id=data.get('modelo_id', ''),
        anio_vehiculo=str(data.get('anio_vehiculo', '')),
        color_vehiculo=data.get('color_vehiculo', ''),
        placa=data.get('placa', ''),
        economico=data.get('economico', ''),
        nro_serie=data.get('nro_serie', ''),
        es_hibrido_electrico=data.get('es_hibrido_electrico', False),
        tipo_danio_id=data.get('tipo_danio_id', '1'),
        estatus_exp_id=data.get('estatus_exp_id', ''),
        ingreso_grua=data.get('ingreso_grua', '0'),
        ubicacion=data.get('ubicacion', ''),
        contratante=data.get('contratante', ''),
        vehiculo_referencia=data.get('vehiculo_referencia', ''),
        registered_f_app=str(data.get('registered_f_app', '0')),
        qr_flag=str(data.get('qr_flag', '0'))
    )


async def run_single_adjudicacion(
    page,
    datos: DatosAdjudicacion,
    handler: QualitasAdjudicacionHandler
) -> ResultadoAdjudicacion:
    """Ejecuta una sola adjudicación."""
    return await handler.adjudicar_orden(datos)


async def run_adjudicacion_from_file(
    datos_file: Path,
    headless: bool = True,
    use_db: bool = True
) -> List[ResultadoAdjudicacion]:
    """
    Ejecuta adjudicaciones desde un archivo JSON.
    
    El archivo puede contener:
    - Una sola orden (objeto simple)
    - Múltiples órdenes (objeto con clave "ordenes" que contiene un array)
    """
    print(f"[Runner] Leyendo datos desde: {datos_file}")
    
    with open(datos_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Determinar si es batch o single
    if 'ordenes' in data:
        # Batch de órdenes
        ordenes_data = data['ordenes']
        headless = data.get('headless', headless)
        stop_on_error = data.get('stop_on_error', False)
        is_batch = True
    else:
        # Single orden
        ordenes_data = [data]
        stop_on_error = True
        is_batch = False
    
    print(f"[Runner] {'Batch de ' if is_batch else ''}{len(ordenes_data)} orden(es) a adjudicar")
    
    # Cargar credenciales
    if use_db and not setup_qualitas_env():
        print("[Runner] ⚠ No se pudieron cargar credenciales desde DB, usando .env")
    
    resultados = []
    session_path = Path(__file__).resolve().parent / "sessions" / "qualitas_session.json"
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=headless,
            args=["--no-sandbox", "--disable-blink-features=AutomationControlled"]
        )
        
        # Usar sesión existente si está disponible
        if session_path.exists():
            context = await browser.new_context(storage_state=str(session_path))
        else:
            context = await browser.new_context(viewport={"width": 1920, "height": 1080})
        
        page = await context.new_page()
        
        # Stealth
        stealth = Stealth(navigator_languages_override=('es-MX', 'es'))
        await stealth.apply_stealth_async(page)
        
        try:
            # Login si es necesario
            if not session_path.exists():
                print("\n[1/3] LOGIN AUTOMÁTICO")
                success = await do_login(page, use_db=use_db)
                if not success:
                    raise RuntimeError("Login fallido")
                
                # Guardar sesión
                storage = await context.storage_state()
                session_path.parent.mkdir(parents=True, exist_ok=True)
                with open(session_path, "w") as f:
                    json.dump(storage, f, indent=2)
                print("[Login] Sesión guardada")
            else:
                print("\n[1/3] USANDO SESIÓN EXISTENTE")
                dashboard_url = get_credential("QUALITAS_LOGIN_URL", use_db) or "https://proordersistem.com.mx/"
                await page.goto(f"{dashboard_url.rstrip('/')}/dashboard", wait_until="networkidle")
                await asyncio.sleep(2)
                
                # Verificar si sesión sigue válida
                if "dashboard" not in page.url.lower():
                    print("[Session] Sesión expirada, re-login...")
                    success = await do_login(page, use_db=use_db)
                    if not success:
                        raise RuntimeError("Login fallido")
                    
                    storage = await context.storage_state()
                    with open(session_path, "w") as f:
                        json.dump(storage, f, indent=2)
            
            # Manejar modal de aviso
            print("\n[2/3] VERIFICANDO MODAL DE AVISO")
            modal_handled = await handle_qualitas_modal(page)
            if modal_handled:
                print("[Modal] Procesado correctamente")
            
            # Ejecutar adjudicaciones
            print(f"\n[3/3] ADJUDICANDO {len(ordenes_data)} ORDEN(ES)")
            print("=" * 60)
            
            handler = QualitasAdjudicacionHandler(page)
            
            for i, orden_data in enumerate(ordenes_data, 1):
                print(f"\n[{i}/{len(ordenes_data)}] Procesando orden...")
                
                datos = dict_to_datos_adjudicacion(orden_data)
                resultado = await run_single_adjudicacion(page, datos, handler)
                resultados.append(resultado)
                
                print(f"  Resultado: {'✓ ÉXITO' if resultado.exito else '✗ FALLIDO'}")
                print(f"  Mensaje: {resultado.mensaje}")
                
                if not resultado.exito:
                    print(f"  Errores: {resultado.errores}")
                    
                    if stop_on_error and i < len(ordenes_data):
                        print("\n[Runner] Deteniendo por error (stop_on_error=True)")
                        break
                
                # Pequeña pausa entre adjudicaciones
                if i < len(ordenes_data):
                    await asyncio.sleep(1)
            
            print("\n" + "=" * 60)
            print("RESUMEN DE ADJUDICACIONES")
            print("=" * 60)
            exitosos = sum(1 for r in resultados if r.exito)
            fallidos = len(resultados) - exitosos
            print(f"Total: {len(resultados)} | Éxitos: {exitosos} | Fallidos: {fallidos}")
            
            # Guardar resultado en archivo
            result_file = datos_file.with_suffix('.result.json')
            resultado_dict = {
                "total": len(resultados),
                "exitosos": exitosos,
                "fallidos": fallidos,
                "detalles": [
                    {
                        "exito": r.exito,
                        "mensaje": r.mensaje,
                        "id_expediente": r.id_expediente,
                        "timestamp": r.timestamp.isoformat(),
                        "errores": r.errores
                    }
                    for r in resultados
                ]
            }
            with open(result_file, 'w', encoding='utf-8') as f:
                json.dump(resultado_dict, f, ensure_ascii=False, indent=2)
            print(f"[Runner] Resultado guardado en: {result_file}")
            
        finally:
            await context.close()
            await browser.close()
    
    return resultados


def main():
    parser = argparse.ArgumentParser(
        description="Runner de adjudicación de órdenes Qualitas"
    )
    parser.add_argument(
        "datos_file",
        type=Path,
        help="Archivo JSON con los datos de adjudicación"
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Ejecutar sin ventana visible"
    )
    parser.add_argument(
        "--use-db",
        action="store_true",
        default=True,
        help="Usar credenciales desde la base de datos"
    )
    parser.add_argument(
        "--use-env",
        action="store_true",
        help="Usar credenciales desde archivo .envQualitas"
    )
    args = parser.parse_args()
    
    if not args.datos_file.exists():
        print(f"[Error] Archivo no encontrado: {args.datos_file}")
        sys.exit(1)
    
    use_db = args.use_db and not args.use_env
    
    try:
        resultados = asyncio.run(run_adjudicacion_from_file(
            args.datos_file,
            headless=args.headless,
            use_db=use_db
        ))
        
        # Exit code basado en resultados
        exitosos = sum(1 for r in resultados if r.exito)
        if exitosos == len(resultados):
            print("\n✓ TODAS LAS ADJUDICACIONES FUERON EXITOSAS")
            sys.exit(0)
        elif exitosos > 0:
            print("\n⚠ ALGUNAS ADJUDICACIONES FALLARON")
            sys.exit(1)
        else:
            print("\n✗ TODAS LAS ADJUDICACIONES FALLARON")
            sys.exit(2)
            
    except Exception as e:
        print(f"\n[Error] {e}")
        import traceback
        print(traceback.format_exc())
        sys.exit(3)


if __name__ == "__main__":
    main()
