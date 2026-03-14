"""
Workflow completo para extracción de piezas de Qualitas.

Este workflow:
1. Inicia sesión en Qualitas (reutilizando lógica existente)
2. Extrae piezas de órdenes en tránsito
3. Guarda en la base de datos
4. Genera reporte de ejecución

Uso:
    python -m app.rpa.qualitas_piezas_workflow [--max-ordenes N] [--headless]
"""

import asyncio
import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

from playwright.async_api import async_playwright

# Importar funciones del workflow existente
from app.rpa.qualitas_full_workflow import (
    load_credentials, get_credential,
    extract_recaptcha_sitekey, solve_recaptcha_2captcha, inject_recaptcha_token
)
from app.rpa.qualitas_session_manager import QualitasSessionManager
from app.rpa.qualitas_modal_handler import QualitasModalHandler
from app.rpa.qualitas_piezas_extractor import QualitasPiezasExtractor, OrdenPiezas
from app.rpa.qualitas_checkpoint import QualitasCheckpoint


class QualitasPiezasWorkflow:
    """Workflow completo para extracción de piezas"""
    
    def __init__(self, headless: bool = True, slow_mo: int = 0, max_retries: int = 3):
        self.headless = headless
        self.slow_mo = slow_mo
        self.max_retries = max_retries
        self.logs = []
        self.resultados = []
        self.checkpoint = QualitasCheckpoint()
        
    def log(self, message: str):
        """Agrega un mensaje al log"""
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        log_line = f"[{timestamp}] {message}"
        self.logs.append(log_line)
        print(log_line)
    
    async def run(
        self,
        max_ordenes: Optional[int] = None,
        use_existing_session: bool = True,
        use_db: bool = True,
        max_total_time: int = 1800  # Máximo 30 minutos por defecto
    ) -> dict:
        """
        Ejecuta el workflow completo con timeout global.
        
        Args:
            max_ordenes: Máximo de órdenes a procesar
            use_existing_session: Usar sesión guardada si existe
            use_db: Usar credenciales de la base de datos
            max_total_time: Tiempo máximo total en segundos (default 30 min)
            
        Returns:
            Dict con resultados y estadísticas
        """
        self.log("=" * 60)
        self.log("INICIANDO WORKFLOW: Extracción de Piezas Qualitas")
        self.log(f"Timeout máximo: {max_total_time} segundos ({max_total_time/60:.0f} min)")
        self.log("=" * 60)
        
        start_time = datetime.now()
        
        try:
            # Ejecutar con timeout global
            return await asyncio.wait_for(
                self._run_internal(max_ordenes, use_existing_session, use_db, start_time),
                timeout=max_total_time
            )
        except asyncio.TimeoutError:
            self.log(f"\n⏱ TIMEOUT GLOBAL: El workflow excedió {max_total_time} segundos")
            self.log("Guardando resultados parciales...")
            
            return {
                "success": False,
                "error": f"Timeout: El workflow excedió {max_total_time} segundos",
                "partial_results": True,
                "timestamp": datetime.now().isoformat(),
                "logs": "\n".join(self.logs),
                "checkpoint_stats": self.checkpoint.get_stats() if self.checkpoint else None
            }
    
    async def run_with_retries(
        self,
        max_ordenes: Optional[int] = None,
        use_existing_session: bool = True,
        use_db: bool = True,
        max_total_time: int = 1800,
        reset_checkpoint: bool = False
    ) -> dict:
        """
        Ejecuta el workflow con reintentos automáticos y backoff exponencial.
        
        Args:
            max_ordenes: Máximo de órdenes a procesar
            use_existing_session: Usar sesión guardada si existe
            use_db: Usar credenciales de la base de datos
            max_total_time: Tiempo máximo total por intento
            reset_checkpoint: Reiniciar el checkpoint (empezar desde cero)
        """
        if reset_checkpoint:
            self.log("[Checkpoint] Reiniciando estado...")
            self.checkpoint.reset()
        else:
            stats = self.checkpoint.get_stats()
            if stats['procesadas'] > 0:
                self.log(f"[Checkpoint] Reanudando: {stats['procesadas']}/{stats['total']} órdenes ({stats['porcentaje']}%)")
                self.log(f"[Checkpoint] Fallidas: {stats['fallidas']} órdenes")
        
        last_result = None
        
        for attempt in range(1, self.max_retries + 1):
            self.log(f"\n{'='*60}")
            self.log(f"INTENTO {attempt}/{self.max_retries}")
            self.log(f"{'='*60}")
            
            try:
                result = await self.run(
                    max_ordenes=max_ordenes,
                    use_existing_session=use_existing_session if attempt == 1 else True,
                    use_db=use_db,
                    max_total_time=max_total_time
                )
                
                last_result = result
                
                # Si tuvo éxito, verificar si hay órdenes fallidas para reintentar
                if result.get('success') or result.get('partial_results'):
                    stats = self.checkpoint.get_stats()
                    
                    # Si completamos todas o no hay más fallidas, éxito total
                    if stats['fallidas'] == 0 or stats['procesadas'] >= stats['total']:
                        self.log(f"\n✅ Workflow completado exitosamente")
                        self.log(f"   Órdenes procesadas: {stats['procesadas']}")
                        result['retries_used'] = attempt - 1
                        result['checkpoint_stats'] = stats
                        return result
                    
                    # Hay órdenes fallidas, reintentar si no es el último intento
                    if attempt < self.max_retries:
                        self.log(f"\n⚠️  Hay {stats['fallidas']} órdenes fallidas. Reintentando...")
                        await asyncio.sleep(5 * attempt)  # Backoff exponencial
                        continue
                    else:
                        self.log(f"\n⚠️  Máximos reintentos alcanzados. {stats['fallidas']} órdenes fallidas.")
                        result['retries_used'] = attempt
                        result['checkpoint_stats'] = stats
                        return result
                
                # Error total (no partial_results)
                if attempt < self.max_retries:
                    wait_time = 10 * attempt  # Backoff: 10s, 20s, 30s
                    self.log(f"\n⚠️  Error en intento {attempt}. Reintentando en {wait_time}s...")
                    await asyncio.sleep(wait_time)
                else:
                    self.log(f"\n❌ Máximos reintentos alcanzados ({self.max_retries})")
                    if last_result:
                        last_result['retries_used'] = attempt
                        last_result['checkpoint_stats'] = self.checkpoint.get_stats()
                    return last_result or {
                        "success": False,
                        "error": f"Falló después de {self.max_retries} intentos",
                        "retries_used": attempt
                    }
                    
            except Exception as e:
                self.log(f"\n❌ Excepción en intento {attempt}: {e}")
                if attempt < self.max_retries:
                    wait_time = 15 * attempt
                    self.log(f"Reintentando en {wait_time}s...")
                    await asyncio.sleep(wait_time)
                else:
                    return {
                        "success": False,
                        "error": f"Excepción después de {self.max_retries} intentos: {str(e)}",
                        "retries_used": attempt,
                        "checkpoint_stats": self.checkpoint.get_stats()
                    }
        
        return last_result or {"success": False, "error": "No se completó ningún intento"}
    
    def reset_checkpoint(self):
        """Reinicia el checkpoint para empezar desde cero."""
        self.checkpoint.reset()
        self.log("[Checkpoint] Reiniciado correctamente")
    
    def get_checkpoint_stats(self) -> dict:
        """Retorna estadísticas del checkpoint."""
        return self.checkpoint.get_stats()
    
    async def _run_internal(
        self,
        max_ordenes: Optional[int],
        use_existing_session: bool,
        use_db: bool,
        start_time: datetime
    ) -> dict:
        """Método interno que ejecuta el workflow real."""
        
        # Cargar credenciales
        if not load_credentials(use_db=use_db):
            return {
                "success": False,
                "error": "No se pudieron cargar las credenciales de Qualitas",
                "logs": "\n".join(self.logs)
            }
        
        async with async_playwright() as p:
            browser = None
            context = None
            
            try:
                # Configurar sesión
                session_manager = QualitasSessionManager()
                session_path = session_manager.get_session_path("default")
                
                # Verificar si existe sesión
                if use_existing_session and session_path.exists():
                    self.log("✓ Sesión existente encontrada")
                    # No cargamos la sesión aquí, la usaremos en el contexto
                
                # Lanzar browser
                browser = await p.chromium.launch(
                    headless=self.headless,
                    slow_mo=self.slow_mo,
                    args=["--no-sandbox", "--disable-blink-features=AutomationControlled"]
                )
                
                # Crear contexto
                if use_existing_session and session_path.exists():
                    try:
                        with open(session_path, 'r') as f:
                            storage_state = json.load(f)
                        context = await browser.new_context(storage_state=storage_state)
                        self.log("✓ Contexto creado con sesión guardada")
                    except Exception as e:
                        self.log(f"⚠ Error cargando sesión: {e}, creando nuevo contexto")
                        context = await browser.new_context(viewport={"width": 1920, "height": 1080})
                else:
                    context = await browser.new_context(viewport={"width": 1920, "height": 1080})
                
                page = await context.new_page()
                
                # Verificar sesión o hacer login
                if use_existing_session and session_path.exists():
                    dashboard_url = get_credential("QUALITAS_LOGIN_URL", use_db) or "https://proordersistem.com.mx/"
                    await page.goto(f"{dashboard_url.rstrip('/')}/dashboard", wait_until="networkidle")
                    await asyncio.sleep(2)
                    
                    # Verificar si redirigió al login
                    if "login" in page.url.lower() or page.url.rstrip('/').endswith('proordersistem.com.mx/'):
                        self.log("⚠ Sesión expirada, requiere login")
                        self.log("\n[1/3] LOGIN AUTOMÁTICO")
                        success = await self._do_login_with_retry(page, use_db=use_db)
                        if not success:
                            raise RuntimeError("Login fallido")
                        
                        # Guardar sesión
                        await session_manager.save_session(context)
                    else:
                        self.log("✓ Sesión válida")
                else:
                    self.log("\n[1/3] LOGIN AUTOMÁTICO")
                    success = await self._do_login_with_retry(page, use_db=use_db)
                    if not success:
                        raise RuntimeError("Login fallido")
                    
                    # Guardar sesión
                    await session_manager.save_session(context)
                
                # 2. Verificar que estamos logueados correctamente
                self.log(f"\n[2/3] VERIFICANDO ACCESO Y MODAL")
                self.log(f"  URL actual: {page.url}")
                
                # Navegar al dashboard si no estamos ahí
                if "dashboard" not in page.url.lower():
                    self.log("  Navegando al dashboard...")
                    await page.goto("https://proordersistem.com.mx/dashboard", wait_until="networkidle")
                    await asyncio.sleep(2)
                
                # Manejar modal de aviso PPD si aparece (usar el handler existente)
                self.log("  Verificando modal de aviso...")
                modal_handler = QualitasModalHandler(page)
                modal_result = await modal_handler.handle_modal()
                if modal_result:
                    self.log("  ✓ Modal manejado correctamente")
                else:
                    self.log("  ⚠ No se pudo manejar el modal (puede que no haya aparecido)")
                
                # 3. Extraer piezas (con checkpoint habilitado)
                self.log("\n" + "=" * 60)
                self.log("[3/3] EXTRAYENDO PIEZAS DE ÓRDENES EN TRÁNSITO")
                self.log("=" * 60)
                
                extractor = QualitasPiezasExtractor(
                    page, 
                    use_checkpoint=True,
                    resume_from_checkpoint=True
                )
                ordenes = await extractor.extract_piezas_from_transito(max_ordenes)
                
                self.resultados = ordenes
                
                # 4. Generar estadísticas
                total_piezas = sum(len(o.piezas) for o in ordenes)
                piezas_surtido = sum(
                    1 for o in ordenes for p in o.piezas 
                    if p.tipo_registro == 'Proceso de Surtido'
                )
                piezas_canceladas = sum(
                    1 for o in ordenes for p in o.piezas 
                    if p.tipo_registro == 'Reasignada/Cancelada'
                )
                
                end_time = datetime.now()
                duration = (end_time - start_time).total_seconds()
                
                result = {
                    "success": True,
                    "timestamp": end_time.isoformat(),
                    "duration_seconds": duration,
                    "ordenes_procesadas": len(ordenes),
                    "total_piezas": total_piezas,
                    "piezas_surtido": piezas_surtido,
                    "piezas_canceladas": piezas_canceladas,
                    "detalle_ordenes": [
                        {
                            "num_expediente": o.num_expediente,
                            "num_orden": o.num_orden,
                            "cantidad_piezas": len(o.piezas)
                        }
                        for o in ordenes
                    ],
                    "logs": "\n".join(self.logs)
                }
                
                self.log("\n" + "=" * 60)
                self.log("RESUMEN DE EXTRACCIÓN (3/3)")
                self.log("=" * 60)
                self.log(f"Órdenes procesadas: {len(ordenes)}")
                self.log(f"Total piezas extraídas: {total_piezas}")
                self.log(f"  - Proceso de Surtido: {piezas_surtido}")
                self.log(f"  - Reasignadas/Canceladas: {piezas_canceladas}")
                self.log(f"Tiempo total: {duration:.1f} segundos")
                self.log("=" * 60)
                
                return result
                
            except Exception as e:
                self.log(f"✗ ERROR: {e}")
                import traceback
                self.log(traceback.format_exc())
                
                return {
                    "success": False,
                    "error": str(e),
                    "logs": "\n".join(self.logs)
                }
                
            finally:
                if browser:
                    await browser.close()

    async def _do_login_with_retry(self, page, use_db: bool = True, max_retries: int = 3) -> bool:
        """Intenta hacer login con reintentos y mejor manejo de esperas."""
        for attempt in range(1, max_retries + 1):
            try:
                self.log(f"  Intentando login (intento {attempt}/{max_retries})...")
                
                login_url = get_credential("QUALITAS_LOGIN_URL", use_db) or "https://proordersistem.com.mx/"
                user = get_credential("QUALITAS_USER", use_db)
                password = get_credential("QUALITAS_PASSWORD", use_db)
                taller_id = get_credential("QUALITAS_TALLER_ID", use_db)
                
                if not user or not password:
                    self.log("  ✗ Error: No se encontraron credenciales")
                    return False
                
                # Navegar a la página de login
                self.log(f"  Navegando a {login_url}...")
                await page.goto(login_url, wait_until="domcontentloaded")
                
                # Esperar a que la página cargue completamente
                self.log("  Esperando carga de página...")
                await asyncio.sleep(5)
                
                # Tomar screenshot para debug
                try:
                    screenshot_path = Path("/tmp/qualitas_login_debug.png")
                    await page.screenshot(path=str(screenshot_path))
                    self.log(f"  Screenshot guardado en: {screenshot_path}")
                except Exception as e:
                    self.log(f"  No se pudo guardar screenshot: {e}")
                
                # Esperar a que el campo de email esté visible (nuevo diseño)
                self.log("  Esperando campo de email...")
                try:
                    await page.wait_for_selector('input[name="email"]', timeout=30000)
                except Exception as e:
                    self.log(f"  ⚠ Timeout esperando email field: {e}")
                    # Intentar con otro selector
                    self.log("  Intentando con selector alternativo...")
                    # Listar todos los inputs para debug
                    inputs = await page.locator('input').all()
                    self.log(f"  Inputs encontrados: {len(inputs)}")
                    for i, inp in enumerate(inputs[:10]):
                        try:
                            placeholder = await inp.get_attribute('placeholder')
                            input_type = await inp.get_attribute('type')
                            name = await inp.get_attribute('name')
                            id_attr = await inp.get_attribute('id')
                            self.log(f"    Input {i}: type={input_type}, name={name}, id={id_attr}, placeholder={placeholder}")
                        except:
                            pass
                    
                    if attempt < max_retries:
                        self.log(f"  Reintentando en 5 segundos...")
                        await asyncio.sleep(5)
                        continue
                    else:
                        return False
                
                # Llenar credenciales (nuevo diseño)
                self.log("  Llenando credenciales...")
                await page.fill('input[name="email"]', user)
                await page.fill('input[name="password"]', password)
                await page.fill('input[name="taller"]', taller_id)
                
                # Esperar a que aparezca el reCAPTCHA
                self.log("  Esperando reCAPTCHA...")
                await asyncio.sleep(2)
                
                # Resolver reCAPTCHA
                try:
                    site_key = await extract_recaptcha_sitekey(page)
                    self.log(f"  Sitekey extraída: {site_key[:20]}...")
                    
                    self.log("  Resolviendo reCAPTCHA con 2captcha...")
                    token = await solve_recaptcha_2captcha(site_key, login_url)
                    await inject_recaptcha_token(page, token)
                    self.log("  ✓ reCAPTCHA resuelto")
                except Exception as e:
                    self.log(f"  ⚠ Error con reCAPTCHA: {e}")
                    # Continuar de todos modos, a veces no es necesario en headless
                
                # Términos (nuevo diseño: id="tyc" name="tyc")
                terms = page.locator('input#tyc, input[name="tyc"]').first
                if await terms.is_visible():
                    if not await terms.is_checked():
                        await terms.click()
                
                # Pequeña pausa antes de enviar
                await asyncio.sleep(1)
                
                # Login (nuevo diseño: button[type="submit"].submit-btn)
                self.log("  Enviando formulario...")
                await page.click('button[type="submit"].submit-btn')
                await page.wait_for_load_state("networkidle", timeout=30000)
                
                # Esperar navegación
                await asyncio.sleep(3)
                
                # Verificar éxito
                current_url = page.url.lower()
                self.log(f"  URL después de login: {page.url}")
                
                if "dashboard" in current_url:
                    self.log("  ✓ Login exitoso")
                    return True
                elif "login" in current_url or current_url.rstrip('/').endswith('proordersistem.com.mx/'):
                    self.log("  ✗ Login fallido - sigue en página de login")
                    # Intentar obtener mensaje de error
                    try:
                        error_msg = await page.locator('.error-message, .alert-error, [role="alert"]').text_content()
                        if error_msg:
                            self.log(f"  Mensaje de error: {error_msg}")
                    except:
                        pass
                else:
                    self.log(f"  ✗ Login fallido, URL inesperada: {page.url}")
                    if attempt < max_retries:
                        await asyncio.sleep(5)
                        continue
                    return False
                    
            except Exception as e:
                self.log(f"  ✗ Error en intento {attempt}: {e}")
                if attempt < max_retries:
                    await asyncio.sleep(5)
                else:
                    return False
        
        return False


def save_results(results: dict, output_dir: Path = None):
    """Guarda los resultados en archivo JSON"""
    if output_dir is None:
        output_dir = Path(__file__).parent / "data"
    
    output_dir.mkdir(exist_ok=True)
    
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f"qualitas_piezas_{timestamp}.json"
    filepath = output_dir / filename
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False, default=str)
    
    print(f"\nResultados guardados en: {filepath}")
    return filepath


async def main():
    """Función principal para ejecución desde línea de comandos"""
    parser = argparse.ArgumentParser(
        description='Extrae piezas de órdenes en tránsito de Qualitas'
    )
    parser.add_argument(
        '--max-ordenes',
        type=int,
        default=None,
        help='Máximo de órdenes a procesar (default: todas)'
    )
    parser.add_argument(
        '--headless',
        action='store_true',
        default=True,
        help='Ejecutar en modo headless (sin ventana)'
    )
    parser.add_argument(
        '--no-headless',
        action='store_true',
        help='Mostrar ventana del navegador'
    )
    parser.add_argument(
        '--slow-mo',
        type=int,
        default=0,
        help='Retraso entre acciones en ms (para debugging)'
    )
    parser.add_argument(
        '--output',
        type=str,
        default=None,
        help='Directorio para guardar resultados'
    )
    parser.add_argument(
        '--use-db',
        action='store_true',
        default=True,
        help='Usar credenciales desde la base de datos'
    )
    parser.add_argument(
        '--reset-checkpoint',
        action='store_true',
        default=False,
        help='Reiniciar checkpoint y empezar desde cero'
    )
    parser.add_argument(
        '--max-retries',
        type=int,
        default=3,
        help='Máximo de reintentos automáticos (default: 3)'
    )
    parser.add_argument(
        '--no-retries',
        action='store_true',
        default=False,
        help='Deshabilitar reintentos automáticos'
    )
    
    args = parser.parse_args()
    
    headless = not args.no_headless if args.no_headless else args.headless
    
    # Crear y ejecutar workflow con reintentos
    workflow = QualitasPiezasWorkflow(
        headless=headless,
        slow_mo=args.slow_mo,
        max_retries=1 if args.no_retries else args.max_retries
    )
    
    if args.no_retries:
        # Modo legacy: sin reintentos
        results = await workflow.run(
            max_ordenes=args.max_ordenes,
            use_existing_session=True,
            use_db=args.use_db
        )
    else:
        # Modo nuevo: con reintentos automáticos y checkpoint
        results = await workflow.run_with_retries(
            max_ordenes=args.max_ordenes,
            use_existing_session=True,
            use_db=args.use_db,
            max_total_time=1800,  # 30 minutos
            reset_checkpoint=args.reset_checkpoint
        )
    
    # Guardar resultados
    output_dir = Path(args.output) if args.output else None
    save_results(results, output_dir)
    
    # Retornar código de salida (éxito si procesó al menos una orden o es reintento parcial)
    success = results.get("success", False) or results.get("partial_results", False)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    asyncio.run(main())
