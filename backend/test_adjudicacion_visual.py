#!/usr/bin/env python3
"""
Script para probar la adjudicación de Qualitas en modo VISUAL.
Abre el navegador Chromium para que puedas ver cada paso.

Uso:
    # Adjudicar una orden específica por número de reporte
    python3 test_adjudicacion_visual.py 04260407947
    
    # O con modo interactivo (te muestra los datos y confirmas)
    python3 test_adjudicacion_visual.py 04260407947 --interactive
    
    # Ver lista de órdenes disponibles
    python3 test_adjudicacion_visual.py --listar

Requisitos:
    - Estar conectado al servidor con X11 forwarding (ssh -X)
    - Tener el backend corriendo para obtener datos de la BD
"""

import argparse
import asyncio
import json
import sys
import os
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


def obtener_datos_desde_bd(num_reporte: str) -> dict:
    """
    Obtiene los datos de la orden desde la base de datos.
    
    Args:
        num_reporte: Número de reporte/siniestro
        
    Returns:
        Diccionario con los datos de la orden o None si no existe
    """
    try:
        # Importar conexión a BD
        from app.core.db import get_db_connection
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Buscar la orden
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
        
        # Procesar nombre completo
        nombre_completo = row[1] or ""
        partes_nombre = nombre_completo.strip().split()
        
        if len(partes_nombre) >= 3:
            nombre = " ".join(partes_nombre[:2])  # Primeros 2 nombres
            apellidos = " ".join(partes_nombre[2:])  # El resto son apellidos
        elif len(partes_nombre) == 2:
            nombre = partes_nombre[0]
            apellidos = partes_nombre[1]
        elif len(partes_nombre) == 1:
            nombre = partes_nombre[0]
            apellidos = ""
        else:
            nombre = "CLIENTE"
            apellidos = "GENERICO"
        
        # Limpiar teléfono (solo números)
        telefono = (row[2] or "").replace("-", "").replace(" ", "").replace("(", "").replace(")", "")
        telefono = ''.join(c for c in telefono if c.isdigit())
        
        # Mapear marca a código Qualitas
        marca_codigo = obtener_codigo_marca_qualitas(row[4] or "")
        
        # Construir objeto de datos
        datos = {
            "num_reporte": row[0],
            "nombre": nombre.upper(),
            "apellidos": apellidos.upper(),
            "celular": telefono[-10:] if len(telefono) > 10 else telefono,  # Últimos 10 dígitos
            "email_cliente": row[3] or "",
            "marca_qualitas_codigo": marca_codigo,
            "marca_vehiculo": row[4] or "",
            "tipo_vehiculo": row[5] or "",
            "anio_vehiculo": str(row[6]) if row[6] else "",
            "color_vehiculo": row[7] or "",
            "nro_serie": row[8] or "",
            "placa": (row[9] or "").upper(),
            "estatus_exp_id": "1",  # Piso por defecto
            "ingreso_grua": "0",
            "ubicacion": "Taller Principal",
            "contratante": nombre_completo.upper(),
            "vehiculo_referencia": f"{row[4] or ''} {row[5] or ''} {row[6] or ''}".strip(),
        }
        
        return datos
        
    except Exception as e:
        log_error(f"Error obteniendo datos de BD: {e}")
        return None


def listar_ordenes_qualitas(limit: int = 10):
    """Lista las últimas órdenes de Qualitas disponibles."""
    try:
        from app.core.db import get_db_connection
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT 
                reporte_siniestro,
                nb_cliente,
                marca_vehiculo,
                tipo_vehiculo,
                modelo_anio,
                placas,
                created_at
            FROM recepcion_ordenes_admision
            WHERE seguro_comp ILIKE '%QUALITAS%'
            ORDER BY created_at DESC
            LIMIT %s
        """, (limit,))
        
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        
        if not rows:
            print("\n⚠ No se encontraron órdenes con aseguradora Qualitas")
            return
        
        print(f"\n{'='*100}")
        print(f"  ÓRDENES DE QUALITAS DISPONIBLES (últimas {len(rows)})")
        print(f"{'='*100}")
        print(f"  {'REPORTE':<15} {'CLIENTE':<30} {'VEHÍCULO':<25} {'PLACAS':<10}")
        print(f"{'-'*100}")
        
        for row in rows:
            reporte = row[0] or "N/A"
            cliente = (row[1] or "")[:28]
            vehiculo = f"{row[2] or ''} {row[3] or ''} {row[4] or ''}"[:23]
            placas = row[5] or "N/A"
            print(f"  {reporte:<15} {cliente:<30} {vehiculo:<25} {placas:<10}")
        
        print(f"{'='*100}")
        print(f"\n  Para adjudicar una orden, ejecuta:")
        print(f"  python3 test_adjudicacion_visual.py <REPORTE>")
        print(f"\n  Ejemplo:")
        print(f"  python3 test_adjudicacion_visual.py {rows[0][0]}")
        
    except Exception as e:
        log_error(f"Error listando órdenes: {e}")


def mostrar_datos_y_confirmar(datos: dict) -> dict:
    """Muestra los datos y permite editarlos antes de ejecutar."""
    print("\n" + "="*60)
    print("DATOS DE LA ORDEN A ADJUDICAR")
    print("="*60)
    print(json.dumps(datos, indent=2, ensure_ascii=False))
    print("="*60)
    
    print("\nOpciones:")
    print("  1. Ejecutar con estos datos")
    print("  2. Editar celular (actual: {})", datos.get('celular', ''))
    print("  3. Editar estatus (actual: {} - {})", datos.get('estatus_exp_id', ''), 
          "Piso" if datos.get('estatus_exp_id') == '1' else "Tránsito" if datos.get('estatus_exp_id') == '2' else "Express")
    print("  4. Cancelar")
    
    opcion = input("\nSelecciona (1-4): ").strip()
    
    if opcion == "2":
        nuevo_cel = input("Nuevo celular (10 dígitos): ").strip()
        if nuevo_cel and len(nuevo_cel) == 10 and nuevo_cel.isdigit():
            datos["celular"] = nuevo_cel
        else:
            log_error("Celular inválido, se mantiene el anterior")
    elif opcion == "3":
        print("\nEstatus:")
        print("  1 = Piso")
        print("  2 = Tránsito")
        print("  4 = Express")
        nuevo_estatus = input("Selecciona (1, 2, 4): ").strip()
        if nuevo_estatus in ["1", "2", "4"]:
            datos["estatus_exp_id"] = nuevo_estatus
    elif opcion == "4":
        return None
    
    return datos


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
    parser = argparse.ArgumentParser(
        description="RPA de Adjudicación Qualitas - Modo Visual",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos:
  # Listar órdenes disponibles
  python3 test_adjudicacion_visual.py --listar
  
  # Adjudicar una orden específica
  python3 test_adjudicacion_visual.py 04260407947
  
  # Modo interactivo (permite editar datos antes de ejecutar)
  python3 test_adjudicacion_visual.py 04260407947 --interactive
  
  # Ver logs de una ejecución anterior
  python3 test_adjudicacion_visual.py --logs
        """
    )
    
    parser.add_argument(
        "reporte",
        nargs="?",
        help="Número de reporte/siniestro a adjudicar"
    )
    parser.add_argument(
        "--listar", "-l",
        action="store_true",
        help="Listar órdenes de Qualitas disponibles"
    )
    parser.add_argument(
        "--interactive", "-i",
        action="store_true",
        help="Modo interactivo: permite editar datos antes de ejecutar"
    )
    parser.add_argument(
        "--logs",
        action="store_true",
        help="Ver últimos logs de ejecuciones"
    )
    parser.add_argument(
        "--datos",
        type=str,
        help="JSON con datos adicionales (sobrescribe los de BD)"
    )
    
    args = parser.parse_args()
    
    # Opción: Listar órdenes
    if args.listar:
        listar_ordenes_qualitas()
        return
    
    # Opción: Ver logs
    if args.logs:
        import glob
        log_files = sorted(glob.glob(str(backend_dir / "logs" / "*.log")))
        if log_files:
            print(f"\nÚltimos logs disponibles:")
            for i, log_file in enumerate(log_files[-5:], 1):
                print(f"  {i}. {Path(log_file).name}")
            print(f"\nPara ver un log específico:")
            print(f"  tail -f {log_files[-1]}")
        else:
            print("\nNo hay logs disponibles")
        return
    
    # Verificar que se proporcionó número de reporte
    if not args.reporte:
        parser.print_help()
        print("\n" + "="*60)
        print("ERROR: Debes proporcionar un número de reporte")
        print("="*60)
        print("\nPara ver órdenes disponibles:")
        print("  python3 test_adjudicacion_visual.py --listar")
        print("\nPara adjudicar una orden:")
        print("  python3 test_adjudicacion_visual.py <NUMERO_REPORTE>")
        return
    
    # Obtener datos desde BD
    print(f"\n{'='*60}")
    print(f"Buscando orden: {args.reporte}")
    print(f"{'='*60}")
    
    datos = obtener_datos_desde_bd(args.reporte)
    
    if not datos:
        log_error(f"No se encontró la orden {args.reporte} en la base de datos")
        print("\nSugerencias:")
        print("  1. Verifica que el número de reporte sea correcto")
        print("  2. Asegúrate de que la orden tenga aseguradora Qualitas")
        print("  3. Usa --listar para ver órdenes disponibles")
        return
    
    log_exito(f"Orden encontrada: {datos['nb_cliente']}")
    
    # Sobrescribir con datos proporcionados vía --datos
    if args.datos:
        try:
            datos_extra = json.loads(args.datos)
            datos.update(datos_extra)
            log_info("Datos adicionales aplicados")
        except json.JSONDecodeError:
            log_error("Formato JSON inválido en --datos")
    
    # Modo interactivo: mostrar y confirmar/editar
    if args.interactive:
        datos = mostrar_datos_y_confirmar(datos)
        if not datos:
            print("\nOperación cancelada por el usuario")
            return
    else:
        print("\nDatos a adjudicar:")
        print(json.dumps(datos, indent=2, ensure_ascii=False))
        confirmar = input("\n¿Proceder con la adjudicación? (s/n): ").strip().lower()
        if confirmar not in ['s', 'si', 'yes', 'y']:
            print("Operación cancelada")
            return
    
    # Validar datos mínimos
    if not datos.get('celular') or len(datos['celular']) != 10:
        log_error("El celular es requerido (10 dígitos)")
        nuevo_cel = input("Ingresa el número de celular (10 dígitos): ").strip()
        if len(nuevo_cel) == 10 and nuevo_cel.isdigit():
            datos['celular'] = nuevo_cel
        else:
            log_error("Celular inválido. Abortando.")
            return
    
    # Iniciar proceso de adjudicación
    print("\n" + "="*60)
    print("RPA DE ADJUDICACIÓN QUALITAS - MODO VISUAL")
    print("="*60)
    print("\nEste script abrirá el navegador para que veas cada paso.")
    print("Presiona Ctrl+C para cancelar en cualquier momento.")
    
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
            datos_adj = DatosAdjudicacion(**datos)
            
            # Ejecutar adjudicación
            handler = QualitasAdjudicacionHandler(page)
            resultado = await handler.adjudicar_orden(datos_adj)
            
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
