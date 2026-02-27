#!/usr/bin/env python3
"""
Script standalone para extraer modelos de Qualitas e importarlos a RDS.

Este script está diseñado para ejecutarse directamente en el servidor EC2.
NO depende de importar desde app.rpa para evitar problemas con dotenv.

Uso en EC2:
    cd ~/LaMarinaCC/backend
    python3 -m app.rpa.extract_and_import_modelos
    
    # Solo extraer (sin importar)
    python3 -m app.rpa.extract_and_import_modelos --extract-only
    
    # Importar desde archivo existente
    python3 -m app.rpa.extract_and_import_modelos --import-only --file modelos.json

Requisitos:
    - Credenciales de Qualitas en .envQualitas o variables de entorno
    - Acceso a la base de datos RDS desde EC2
"""

import argparse
import asyncio
import json
import os
import socket
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Set, Tuple

# Agregar backend al path
backend_dir = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(backend_dir))

# Verificar si estamos en Docker para importar DB correctamente
def is_docker():
    try:
        socket.gethostbyname('db')
        return True
    except:
        return False

# Configurar DATABASE_URL si no está seteada
if not os.getenv('DATABASE_URL'):
    if is_docker():
        os.environ['DATABASE_URL'] = 'postgresql://postgres:postgres@db:5432/lamarinacc'
    else:
        # Para EC2, asumimos que está en variables de entorno o .env
        env_file = backend_dir / ".env"
        if env_file.exists():
            with open(env_file) as f:
                for line in f:
                    if '=' in line and not line.startswith('#'):
                        key, value = line.strip().split('=', 1)
                        if key == 'DATABASE_URL':
                            os.environ[key] = value
                            break

# Importar DB después de configurar
from app.core.db import get_connection

from playwright.async_api import async_playwright
from playwright_stealth import Stealth


# ============================================================================
# CONFIGURACIÓN
# ============================================================================

QUALITAS_LOGIN_URL = "https://proordersistem.com.mx/"
QUALITAS_MODELOS_URL = "https://proordersistem.com.mx/vehiculos-modelos"


# ============================================================================
# CARGA DE CREDENCIALES
# ============================================================================

def load_credentials() -> Dict:
    """Carga credenciales desde .envQualitas o variables de entorno."""
    # Intentar desde archivo
    env_file = backend_dir / ".envQualitas"
    if env_file.exists():
        with open(env_file, 'r') as f:
            for line in f:
                if '=' in line and not line.startswith('#'):
                    key, value = line.strip().split('=', 1)
                    os.environ[key] = value
    
    return {
        "user": os.getenv("QUALITAS_USER", ""),
        "password": os.getenv("QUALITAS_PASSWORD", ""),
        "taller_id": os.getenv("QUALITAS_TALLER_ID", "")
    }


# ============================================================================
# LOGIN (reutilizando sistema existente)
# ============================================================================

async def solve_recaptcha_2captcha(site_key: str, page_url: str) -> str:
    """Resuelve reCAPTCHA usando 2captcha."""
    import aiohttp
    
    api_key = os.getenv("CAPTCHA_API_KEY")
    if not api_key:
        raise ValueError("CAPTCHA_API_KEY no configurada")
    
    headers = {"Accept-Encoding": "gzip, deflate", "Accept": "application/json"}
    
    async with aiohttp.ClientSession(headers=headers) as session:
        # Enviar CAPTCHA
        submit_url = "https://2captcha.com/in.php"
        payload = {
            "key": api_key,
            "method": "userrecaptcha",
            "googlekey": site_key,
            "pageurl": page_url,
            "json": 1,
        }
        
        async with session.post(submit_url, data=payload, timeout=30) as resp:
            result = await resp.json()
        
        if result.get("status") != 1:
            raise RuntimeError(f"2captcha error: {result.get('request')}")
        
        captcha_id = result["request"]
        print(f"[2captcha] CAPTCHA enviado, ID: {captcha_id}")
        
        # Poll por resultado
        result_url = "https://2captcha.com/res.php"
        for attempt in range(60):  # 5 minutos max
            await asyncio.sleep(5)
            
            params = {"key": api_key, "action": "get", "id": captcha_id, "json": 1}
            
            async with session.get(result_url, params=params, timeout=10) as resp:
                result = await resp.json()
            
            if result.get("status") == 1:
                print(f"[2captcha] ✓ Resuelto en {(attempt + 1) * 5}s")
                return result["request"]
            
            if result.get("request") != "CAPCHA_NOT_READY":
                raise RuntimeError(f"2captcha error: {result.get('request')}")
            
            print(f"[2captcha] Esperando... ({(attempt + 1) * 5}s)")
        
        raise TimeoutError("2captcha timeout")


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


async def do_login_qualitas(page, credentials: Dict) -> bool:
    """Hace login en Qualitas con resolución de CAPTCHA."""
    user = credentials.get("user", "")
    password = credentials.get("password", "")
    taller_id = credentials.get("taller_id", "")
    site_key = os.getenv("QUALITAS_RECAPTCHA_SITE_KEY", "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI")  # Default test key
    
    if not user or not password:
        print("[Error] Faltan credenciales de Qualitas")
        return False
    
    print("[Login] Navegando a página de login...")
    await page.goto(QUALITAS_LOGIN_URL, wait_until="domcontentloaded")
    await asyncio.sleep(2)
    
    print("[Login] Llenando credenciales...")
    await page.fill('input[placeholder="Email"]', user)
    await page.fill('input[placeholder="Password"]', password)
    await page.fill('input[placeholder="ID-Taller"]', taller_id)
    
    # Aceptar términos
    try:
        terms = page.locator('input[type="checkbox"][name="tyc"]').first
        if not await terms.is_checked():
            await terms.click()
    except:
        pass
    
    # Resolver CAPTCHA
    print("[Login] Resolviendo reCAPTCHA...")
    try:
        token = await solve_recaptcha_2captcha(site_key, QUALITAS_LOGIN_URL)
        await inject_recaptcha_token(page, token)
    except Exception as e:
        print(f"[Login] Error resolviendo CAPTCHA: {e}")
        return False
    
    # Click en login
    print("[Login] Enviando formulario...")
    await page.click('input[type="submit"][value="Log In"]')
    await page.wait_for_load_state("networkidle", timeout=30000)
    
    # Verificar login exitoso
    if "dashboard" in page.url.lower() or "vehiculos" in page.url.lower():
        print("[Login] ✓ Sesión iniciada correctamente")
        return True
    
    print(f"[Login] ✗ Falló. URL actual: {page.url}")
    return False


# ============================================================================
# EXTRACCIÓN
# ============================================================================

async def extract_modelos_from_page(page) -> List[Dict[str, str]]:
    """Extrae modelos de la página actual."""
    modelos = []
    
    # Esperar tabla con múltiples intentos
    selectors = [
        'table tbody tr',
        '.table tbody tr',
        '.dataTable tbody tr',
        'tbody tr'
    ]
    rows = []
    
    for selector in selectors:
        try:
            await page.wait_for_selector(selector, timeout=5000)
            rows = await page.locator(selector).all()
            if rows:
                print(f"  [Debug] Encontradas {len(rows)} filas con: {selector}")
                break
        except:
            continue
    
    if not rows:
        print("  [Warning] No se encontraron filas")
        return []
    
    for i, row in enumerate(rows):
        try:
            cells = await row.locator('td').all()
            if len(cells) >= 2:
                modelo = await cells[0].text_content()
                marca = await cells[1].text_content()
                
                modelo = modelo.strip() if modelo else ""
                marca = marca.strip() if marca else ""
                
                # Validar
                if modelo and marca and len(modelo) > 1 and len(marca) > 1:
                    if modelo.upper() not in ['MODELO', 'NOMBRE']:
                        modelos.append({'modelo': modelo, 'marca': marca})
        except:
            continue
    
    return modelos


async def get_next_page_button(page) -> bool:
    """Navega a la siguiente página usando el botón 'Next'."""
    try:
        # Selector basado en el HTML real: <a class="page-link" href="..." rel="next" aria-label="Next">»</a>
        next_selectors = [
            'a.page-link[rel="next"]',           # Selector principal
            'a[rel="next"]',                      # Más genérico
            'a[aria-label="Next"]',               # Por aria-label
            '.pagination a.page-link:has-text("»")',  # Por texto »
            '.page-item:not(.disabled) a.page-link:has-text("»")'  # Con clase page-item
        ]
        
        for selector in next_selectors:
            try:
                next_btn = page.locator(selector).first
                
                # Verificar si existe y es visible
                if await next_btn.count() == 0:
                    continue
                    
                if not await next_btn.is_visible():
                    continue
                
                # Verificar que el elemento padre no tenga 'disabled'
                parent = next_btn.locator('..').first
                parent_class = await parent.get_attribute('class') if parent else ""
                
                if parent_class and 'disabled' in parent_class:
                    print("  [Paginación] Botón 'Next' está deshabilitado (última página)")
                    return False
                
                print(f"  [Paginación] Click en 'Next' usando: {selector}")
                await next_btn.click()
                await asyncio.sleep(2)  # Esperar carga de página
                
                # Verificar que cambió la URL o hay nuevos datos
                print(f"  [Paginación] Página cargada: {page.url}")
                return True
                
            except Exception as e:
                # Silenciosamente continuar con el siguiente selector
                continue
        
        # Si ningún selector funcionó, podría ser la última página
        print("  [Paginación] No se encontró botón 'Next' - posiblemente última página")
        return False
        
    except Exception as e:
        print(f"  [Paginación] Error: {e}")
        return False


async def extract_all_modelos(headless: bool = True) -> List[Dict[str, str]]:
    """Extrae todos los modelos navegando por las páginas."""
    print("=" * 60)
    print("EXTRACCIÓN DE MODELOS - QUALITAS")
    print("=" * 60)
    
    credentials = load_credentials()
    
    if not credentials.get("user") or not credentials.get("password"):
        print("[Error] No se encontraron credenciales")
        print("[Info] Configura QUALITAS_USER, QUALITAS_PASSWORD en .envQualitas")
        return []
    
    all_modelos = []
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=headless,
            args=["--no-sandbox", "--disable-blink-features=AutomationControlled"]
        )
        
        context = await browser.new_context(viewport={"width": 1920, "height": 1080})
        page = await context.new_page()
        
        # Stealth
        stealth = Stealth(navigator_languages_override=('es-MX', 'es'))
        await stealth.apply_stealth_async(page)
        
        try:
            # Login
            if not await do_login_qualitas(page, credentials):
                return []
            
            # Navegar a modelos
            print("\n[Navegación] Yendo a catálogo de modelos...")
            await page.goto(QUALITAS_MODELOS_URL, wait_until="networkidle")
            await asyncio.sleep(3)
            print(f"[Navegación] URL actual: {page.url}")
            
            # Extraer página por página
            page_num = 1
            max_pages = 50
            
            while page_num <= max_pages:
                print(f"\n[Página {page_num}] Extrayendo...")
                modelos = await extract_modelos_from_page(page)
                
                if modelos:
                    all_modelos.extend(modelos)
                    print(f"  ✓ {len(modelos)} modelos extraídos")
                    if modelos:
                        print(f"     Ej: {modelos[0]['modelo'][:30]} ({modelos[0]['marca']})")
                
                # Intentar siguiente página
                has_next = await get_next_page_button(page)
                if not has_next:
                    print("\n[Info] No hay más páginas")
                    break
                
                page_num += 1
            
            print(f"\n[Extraction] Total: {len(all_modelos)} modelos en {page_num} páginas")
            return all_modelos
            
        finally:
            await context.close()
            await browser.close()


# ============================================================================
# IMPORTACIÓN
# ============================================================================

def import_modelos_to_db(modelos: List[Dict[str, str]], dry_run: bool = False) -> Dict:
    """Importa los modelos a RDS."""
    stats = {
        "marcas_creadas": 0,
        "modelos_creados": 0,
        "modelos_omitidos": 0,
        "errores": []
    }
    
    print("\n" + "=" * 60)
    print("IMPORTACIÓN A BASE DE DATOS")
    print("=" * 60)
    
    if dry_run:
        print("[MODO SIMULACIÓN] No se insertarán datos\n")
    
    # Obtener datos existentes
    with get_connection() as conn:
        marcas_db = {}
        rows = conn.execute("SELECT id, UPPER(nb_marca) FROM marcas_autos").fetchall()
        marcas_db = {row[1]: row[0] for row in rows}
        
        modelos_db = set()
        rows = conn.execute("SELECT marca_id, UPPER(nb_modelo) FROM modelos_autos").fetchall()
        modelos_db = set(rows)
    
    print(f"[DB] Marcas existentes: {len(marcas_db)}")
    print(f"[DB] Modelos existentes: {len(modelos_db)}")
    
    # Agrupar por marca
    modelos_por_marca = {}
    for m in modelos:
        marca = m['marca'].upper()
        modelo = m['modelo']
        if marca not in modelos_por_marca:
            modelos_por_marca[marca] = set()
        modelos_por_marca[marca].add(modelo)
    
    print(f"\n[Importación] Procesando {len(modelos_por_marca)} marcas...")
    
    for marca_nombre, modelos_set in modelos_por_marca.items():
        # Verificar/crear marca
        if marca_nombre in marcas_db:
            marca_id = marcas_db[marca_nombre]
        else:
            if dry_run:
                marca_id = -1
                stats["marcas_creadas"] += 1
                print(f"  [Marca] {marca_nombre} - SE CREARÍA")
            else:
                try:
                    with get_connection() as conn:
                        conn.execute(
                            "INSERT INTO grupos_autos (nb_grupo) VALUES ('GENERAL') ON CONFLICT DO NOTHING"
                        )
                        row = conn.execute(
                            "INSERT INTO marcas_autos (gpo_marca, nb_marca) VALUES ('GENERAL', %s) RETURNING id",
                            (marca_nombre.title(),)
                        ).fetchone()
                        conn.commit()
                        marca_id = row[0]
                        marcas_db[marca_nombre] = marca_id
                        stats["marcas_creadas"] += 1
                        print(f"  [Marca] {marca_nombre} (ID: {marca_id}) - CREADA")
                except Exception as e:
                    stats["errores"].append(f"Marca {marca_nombre}: {e}")
                    continue
        
        # Procesar modelos
        for modelo_nombre in modelos_set:
            modelo_key = (marca_id, modelo_nombre.upper())
            
            if modelo_key in modelos_db:
                stats["modelos_omitidos"] += 1
                continue
            
            if dry_run:
                stats["modelos_creados"] += 1
            else:
                try:
                    with get_connection() as conn:
                        conn.execute(
                            "INSERT INTO modelos_autos (marca_id, nb_modelo) VALUES (%s, %s)",
                            (marca_id, modelo_nombre)
                        )
                        conn.commit()
                        modelos_db.add(modelo_key)
                        stats["modelos_creados"] += 1
                except Exception as e:
                    stats["errores"].append(f"Modelo {modelo_nombre}: {e}")
    
    return stats


# ============================================================================
# MAIN
# ============================================================================

def main():
    parser = argparse.ArgumentParser(description="Extrae modelos de Qualitas e importa a RDS")
    parser.add_argument("--extract-only", action="store_true", help="Solo extrae")
    parser.add_argument("--import-only", action="store_true", help="Solo importa desde archivo")
    parser.add_argument("--file", type=str, default="app/rpa/data/qualitas_modelos_export.json")
    parser.add_argument("--dry-run", action="store_true", help="Simula sin insertar")
    parser.add_argument("--no-headless", action="store_true", help="Muestra navegador")
    args = parser.parse_args()
    
    modelos = []
    
    # Extraer
    if not args.import_only:
        modelos = asyncio.run(extract_all_modelos(headless=not args.no_headless))
        
        if not modelos:
            print("[Error] No se extrajeron modelos")
            return
        
        output_path = Path(args.file)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump({
                'fecha_extraccion': datetime.now().isoformat(),
                'total': len(modelos),
                'modelos': modelos
            }, f, indent=2, ensure_ascii=False)
        
        print(f"\n[Guardado] {len(modelos)} modelos en: {output_path}")
        
        if args.extract_only:
            return
    
    # Importar
    if args.import_only:
        json_path = Path(args.file)
        if not json_path.exists():
            print(f"[Error] Archivo no encontrado: {json_path}")
            return
        
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            modelos = data.get('modelos', [])
        
        print(f"[Cargado] {len(modelos)} modelos desde archivo")
    
    # Importar a DB
    if modelos:
        stats = import_modelos_to_db(modelos, dry_run=args.dry_run)
        
        print("\n" + "=" * 60)
        print("RESULTADOS")
        print("=" * 60)
        print(f"Marcas creadas: {stats['marcas_creadas']}")
        print(f"Modelos creados: {stats['modelos_creados']}")
        print(f"Modelos omitidos: {stats['modelos_omitidos']}")
        
        if stats['errores']:
            print(f"\nErrores ({len(stats['errores'])}):")
            for err in stats['errores'][:5]:
                print(f"  - {err}")
        
        print("\n✓ Proceso completado")


if __name__ == "__main__":
    main()
