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

# Importar módulos existentes
from app.rpa.qualitas_session_manager import QualitasSessionManager
from app.rpa.qualitas_login_stealth import QualitasLoginManager
from app.rpa.qualitas_piezas_extractor import QualitasPiezasExtractor, OrdenPiezas


class QualitasPiezasWorkflow:
    """Workflow completo para extracción de piezas"""
    
    def __init__(self, headless: bool = True, slow_mo: int = 0):
        self.headless = headless
        self.slow_mo = slow_mo
        self.logs = []
        self.resultados = []
        
    def log(self, message: str):
        """Agrega un mensaje al log"""
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        log_line = f"[{timestamp}] {message}"
        self.logs.append(log_line)
        print(log_line)
    
    async def run(
        self,
        max_ordenes: Optional[int] = None,
        use_existing_session: bool = True
    ) -> dict:
        """
        Ejecuta el workflow completo.
        
        Args:
            max_ordenes: Máximo de órdenes a procesar
            use_existing_session: Usar sesión guardada si existe
            
        Returns:
            Dict con resultados y estadísticas
        """
        self.log("=" * 60)
        self.log("INICIANDO WORKFLOW: Extracción de Piezas Qualitas")
        self.log("=" * 60)
        
        start_time = datetime.now()
        
        async with async_playwright() as p:
            browser = None
            context = None
            
            try:
                # 1. Intentar usar sesión existente
                session_manager = QualitasSessionManager()
                session = session_manager.load_session()
                
                if use_existing_session and session:
                    self.log("✓ Sesión existente encontrada, reutilizando...")
                    browser = await p.chromium.launch(
                        headless=self.headless,
                        slow_mo=self.slow_mo
                    )
                    context = await session_manager.create_context_with_session(browser)
                    page = await context.new_page()
                    
                    # Verificar que la sesión sigue válida
                    await page.goto("https://www.sistemaslaplataformalaguna.com/inicio")
                    await asyncio.sleep(2)
                    
                    if "login" in page.url.lower():
                        self.log("⚠ Sesión expirada, requiere login")
                        await browser.close()
                        browser = None
                        context = None
                
                # 2. Si no hay sesión válida, hacer login
                if not browser:
                    self.log("Iniciando nuevo login...")
                    browser, context, page = await self._do_login(p)
                    
                    if not browser:
                        return {
                            "success": False,
                            "error": "No se pudo iniciar sesión",
                            "logs": "\n".join(self.logs)
                        }
                
                # 3. Extraer piezas
                self.log("\n" + "=" * 60)
                self.log("EXTRAYENDO PIEZAS DE ÓRDENES EN TRÁNSITO")
                self.log("=" * 60)
                
                extractor = QualitasPiezasExtractor(page)
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
                self.log("RESUMEN DE EXTRACCIÓN")
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
    
    async def _do_login(self, playwright) -> tuple:
        """Realiza el login en Qualitas"""
        try:
            login_manager = QualitasLoginManager(
                headless=self.headless,
                slow_mo=self.slow_mo
            )
            
            # Intentar login automático
            browser, context, page = await login_manager.login_auto()
            
            if not browser:
                self.log("✗ No se pudo iniciar sesión automáticamente")
                return None, None, None
            
            self.log("✓ Login exitoso")
            return browser, context, page
            
        except Exception as e:
            self.log(f"✗ Error en login: {e}")
            return None, None, None


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
    
    args = parser.parse_args()
    
    headless = not args.no_headless if args.no_headless else args.headless
    
    # Crear y ejecutar workflow
    workflow = QualitasPiezasWorkflow(
        headless=headless,
        slow_mo=args.slow_mo
    )
    
    results = await workflow.run(
        max_ordenes=args.max_ordenes,
        use_existing_session=True
    )
    
    # Guardar resultados
    output_dir = Path(args.output) if args.output else None
    save_results(results, output_dir)
    
    # Retornar código de salida
    sys.exit(0 if results.get("success") else 1)


if __name__ == "__main__":
    asyncio.run(main())
