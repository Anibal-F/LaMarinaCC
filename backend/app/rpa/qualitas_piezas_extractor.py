"""
Extractor de Piezas de Qualitas - Órdenes en Tránsito

Flujo:
1. Navega al tab "Tránsito"
2. Extrae lista de órdenes (#Exp)
3. Por cada orden:
   - Abre detalle (click en ícono flecha)
   - Navega a "Seguimiento del Surtido de Refacciones"
   - Extrae tablas de piezas (Proceso de Surtido, Reasignadas/Canceladas)
   - Guarda en BD
   - Vuelve al listado

Autor: Kimi AI
Fecha: 2026-03-13
"""

import asyncio
import re
from datetime import datetime
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass, asdict
from playwright.async_api import Page, expect

from app.core.db import get_connection


@dataclass
class ProveedorInfo:
    """Información del proveedor extraída del modal"""
    id_externo: int
    nombre: str
    email: Optional[str] = None
    celular: Optional[str] = None


@dataclass
class PiezaInfo:
    """Información de una pieza"""
    nombre: str
    origen: str
    numero_parte: Optional[str]
    observaciones: Optional[str]
    proveedor: ProveedorInfo
    fecha_promesa: Optional[datetime]
    demeritos: float
    estatus: str
    fecha_estatus: Optional[datetime]
    ubicacion: str
    devolucion_proveedor: bool
    recibido: bool
    entregado: bool
    portal: bool
    tipo_registro: str  # 'Proceso de Surtido' o 'Reasignada/Cancelada'


@dataclass
class OrdenPiezas:
    """Órden con sus piezas extraídas"""
    num_expediente: str
    num_orden: Optional[str]
    piezas: List[PiezaInfo]
    fecha_extraccion: datetime


class QualitasPiezasExtractor:
    """Extractor de piezas de órdenes en tránsito de Qualitas"""
    
    def __init__(self, page: Page):
        self.page = page
        self.base_url = "https://www.sistemaslaplataformalaguna.com"
        self.ordenes_procesadas = []
    
    async def extract_piezas_from_transito(self, max_ordenes: int = None) -> List[OrdenPiezas]:
        """
        Extrae piezas de todas las órdenes en estado Tránsito.
        
        Args:
            max_ordenes: Máximo de órdenes a procesar (None = todas)
            
        Returns:
            Lista de órdenes con sus piezas
        """
        resultados = []
        
        # 1. Navegar al tab Tránsito
        print("[PiezasExtractor] Navegando al tab Tránsito...")
        await self._navigate_to_transito_tab()
        
        # 2. Extraer lista de órdenes del tab Tránsito
        print("[PiezasExtractor] Extrayendo lista de órdenes...")
        ordenes = await self._extract_ordenes_list()
        print(f"[PiezasExtractor] Se encontraron {len(ordenes)} órdenes en tránsito")
        
        if not ordenes:
            return resultados
        
        # Limitar si se especificó
        if max_ordenes:
            ordenes = ordenes[:max_ordenes]
            print(f"[PiezasExtractor] Procesando solo las primeras {max_ordenes} órdenes")
        
        # 3. Procesar cada orden
        for i, orden in enumerate(ordenes, 1):
            try:
                print(f"\n[PiezasExtractor] Procesando orden {i}/{len(ordenes)}: {orden['num_expediente']}")
                
                orden_con_piezas = await self._process_single_orden(orden)
                if orden_con_piezas and orden_con_piezas.piezas:
                    resultados.append(orden_con_piezas)
                    print(f"  ✓ Extraídas {len(orden_con_piezas.piezas)} piezas")
                    
                    # Guardar en BD inmediatamente
                    await self._save_to_database(orden_con_piezas)
                else:
                    print(f"  ⚠ No se encontraron piezas para esta orden")
                
                # Pequeña pausa entre órdenes
                await asyncio.sleep(1)
                
            except Exception as e:
                print(f"  ✗ Error procesando orden {orden['num_expediente']}: {e}")
                continue
        
        print(f"\n[PiezasExtractor] Total órdenes procesadas: {len(resultados)}")
        return resultados
    
    async def _navigate_to_transito_tab(self):
        """Navega al tab de Tránsito"""
        # 1. Navegar al menú "Órdenes" → "Asignadas Qualitas"
        print("[PiezasExtractor] Navegando a menú Órdenes...")
        
        # Buscar y hacer clic en "Órdenes" del menú lateral
        ordenes_menu = self.page.locator('span.kt-menu__link-text:has-text("Órdenes"), a.kt-menu__link:has-text("Órdenes")').first
        await ordenes_menu.click()
        await asyncio.sleep(1)
        
        print("[PiezasExtractor] Navegando a Asignadas Qualitas...")
        # Buscar y hacer clic en "Asignadas Qualitas" del submenú
        asignadas_link = self.page.locator('span.kt-menu__link-text:has-text("Asignadas Qualitas"), a.kt-menu__link:has-text("Asignadas Qualitas")').first
        await asignadas_link.click()
        
        # Esperar a que cargue la página de órdenes asignadas
        print("[PiezasExtractor] Esperando carga de página...")
        await self.page.wait_for_load_state('networkidle')
        await asyncio.sleep(3)  # Espera adicional para carga de tabs
        
        # 2. Click en el tab Tránsito
        print("[PiezasExtractor] Buscando tab Tránsito...")
        transito_tab = self.page.locator('#transito-tab, a[href="#transito"], a:has-text("Tránsito"), #transito').first
        
        # Esperar a que el tab sea visible
        await transito_tab.wait_for(state='visible', timeout=10000)
        await transito_tab.click()
        
        # Esperar a que la tabla se cargue
        await self.page.wait_for_selector('#tabletransito tbody tr', timeout=15000)
        await asyncio.sleep(1)  # Pausa adicional para carga completa
        print("[PiezasExtractor] ✓ Tab Tránsito cargado")
    
    async def _extract_ordenes_list(self) -> List[Dict]:
        """
        Extrae la lista de órdenes del tab Tránsito.
        Retorna lista con num_expediente y índice de fila.
        """
        ordenes = []
        
        # Obtener todas las filas de la tabla
        rows = await self.page.locator('#tabletransito tbody tr').all()
        print(f"[PiezasExtractor] {len(rows)} filas encontradas en tabla")
        
        for i, row in enumerate(rows):
            try:
                cells = await row.locator('td').all()
                if len(cells) < 3:
                    continue
                
                # La primera celda con datos suele ser # Exp (índice 0 o 1)
                num_exp = None
                for j, cell in enumerate(cells[:3]):  # Revisar primeras 3 celdas
                    text = await cell.text_content()
                    if text and text.strip().isdigit() and len(text.strip()) >= 6:
                        num_exp = text.strip()
                        break
                
                if num_exp:
                    ordenes.append({
                        'num_expediente': num_exp,
                        'row_index': i
                    })
                    
            except Exception as e:
                print(f"  [Warning] Error extrayendo fila {i}: {e}")
                continue
        
        return ordenes
    
    async def _process_single_orden(self, orden: Dict) -> Optional[OrdenPiezas]:
        """
        Procesa una sola orden:
        1. Click en ícono flecha
        2. Esperar carga página de orden
        3. Click en "Seguimiento del Surtido de Refacciones"
        4. Extraer piezas
        5. Volver al listado
        """
        num_exp = orden['num_expediente']
        
        try:
            # 1. Click en el ícono de flecha (2do ícono en columna Acciones)
            # El ícono es: <i class="fas fa-arrow-alt-circle-right" style="font-size: 1.7rem;"></i>
            row = self.page.locator(f'#tabletransito tbody tr').nth(orden['row_index'])
            
            # Buscar el ícono de flecha dentro de la fila
            arrow_icon = row.locator('i.fas.fa-arrow-alt-circle-right').first
            
            if not await arrow_icon.is_visible():
                print(f"  [Warning] Ícono no visible para orden {num_exp}")
                return None
            
            # Click en el ícono - abre nueva pestaña
            async with self.page.context.expect_page() as new_page_info:
                await arrow_icon.click()
            
            # Esperar a que cargue la nueva página
            new_page = await new_page_info.value
            await new_page.wait_for_load_state('networkidle')
            print(f"  → Página de orden abierta")
            
            # 2. Buscar y hacer click en "Seguimiento del Surtido de Refacciones"
            # Selector: a[href^="/refacciones/"] o buscar por texto
            seguimiento_btn = new_page.locator('a:has-text("Seguimiento del Surtido de Refacciones"), a.btn-qualitas-pro:has-text("Seguimiento")').first
            
            if not await seguimiento_btn.is_visible():
                print(f"  [Warning] Botón de seguimiento no encontrado")
                await new_page.close()
                return None
            
            # Extraer URL del botón
            href = await seguimiento_btn.get_attribute('href')
            print(f"  → Navegando a: {href}")
            
            # Navegar a la página de refacciones
            await seguimiento_btn.click()
            await new_page.wait_for_load_state('networkidle')
            await asyncio.sleep(1)
            
            # 3. Extraer número de orden de la página
            num_orden = await self._extract_num_orden(new_page)
            
            # 4. Extraer piezas de ambas tablas
            piezas = await self._extract_piezas_from_page(new_page)
            
            # 5. Cerrar pestaña y volver a la principal
            await new_page.close()
            
            return OrdenPiezas(
                num_expediente=num_exp,
                num_orden=num_orden,
                piezas=piezas,
                fecha_extraccion=datetime.now()
            )
            
        except Exception as e:
            print(f"  [Error] Procesando orden {num_exp}: {e}")
            # Intentar cerrar cualquier pestaña abierta
            try:
                pages = self.page.context.pages
                if len(pages) > 1:
                    for p in pages[1:]:
                        await p.close()
            except:
                pass
            return None
    
    async def _extract_num_orden(self, page: Page) -> Optional[str]:
        """Extrae el número de orden de la página"""
        try:
            # Buscar en el título o en elementos específicos
            # Ejemplo: "Número de Orden: 72"
            title = await page.title()
            match = re.search(r'Orden[\s:]+(\d+)', title, re.IGNORECASE)
            if match:
                return match.group(1)
            
            # Buscar en el contenido de la página
            content = await page.content()
            match = re.search(r'Orden[\s:]+(\d+)', content, re.IGNORECASE)
            if match:
                return match.group(1)
                
        except Exception as e:
            print(f"  [Warning] No se pudo extraer número de orden: {e}")
        
        return None
    
    async def _extract_piezas_from_page(self, page: Page) -> List[PiezaInfo]:
        """
        Extrae piezas de la página de refacciones.
        Procesa las tablas:
        - Proceso de Surtido
        - Piezas Reasignadas & Canceladas
        """
        piezas = []
        
        # Esperar a que carguen las tablas
        await page.wait_for_selector('table', timeout=10000)
        await asyncio.sleep(1)
        
        # 1. Extraer de "En proceso de surtido"
        print("  → Extrayendo piezas en proceso de surtido...")
        piezas_surtido = await self._extract_from_table(
            page, 
            'Proceso de Surtido',
            'Proceso de Surtido'
        )
        piezas.extend(piezas_surtido)
        
        # 2. Extraer de "Piezas reasignadas & Canceladas"
        print("  → Extrayendo piezas reasignadas/canceladas...")
        piezas_canceladas = await self._extract_from_table(
            page,
            'Reasignadas',
            'Reasignada/Cancelada'
        )
        piezas.extend(piezas_canceladas)
        
        return piezas
    
    async def _extract_from_table(
        self, 
        page: Page, 
        table_identifier: str,
        tipo_registro: str
    ) -> List[PiezaInfo]:
        """
        Extrae piezas de una tabla específica.
        
        Args:
            table_identifier: Texto identificador de la tabla (ej: 'Proceso de Surtido')
            tipo_registro: Tipo para clasificar las piezas
        """
        piezas = []
        
        try:
            # Buscar la tabla por texto cercano o estructura
            # Las tablas tienen encabezados: Nombre, Origen, # Parte, Observaciones, Proveedor, etc.
            
            # Estrategia: Buscar todas las tablas y filtrar por contenido
            tables = await page.locator('table.table-sm, table.table-hover').all()
            
            for table in tables:
                try:
                    # Verificar si esta tabla tiene la estructura correcta
                    headers = await table.locator('thead th').all()
                    header_texts = []
                    for h in headers:
                        text = await h.text_content()
                        header_texts.append(text.strip() if text else '')
                    
                    header_str = ' '.join(header_texts).lower()
                    
                    # Buscar tabla con columnas esperadas
                    if 'nombre' in header_str and 'proveedor' in header_str:
                        # Esta es una tabla de piezas
                        rows = await table.locator('tbody tr').all()
                        
                        for row in rows:
                            try:
                                pieza = await self._parse_pieza_row(row, tipo_registro)
                                if pieza:
                                    piezas.append(pieza)
                            except Exception as e:
                                print(f"    [Warning] Error parseando fila: {e}")
                                continue
                        
                        break  # Procesamos la tabla correcta
                        
                except Exception as e:
                    continue
            
        except Exception as e:
            print(f"  [Warning] Error extrayendo de tabla {table_identifier}: {e}")
        
        return piezas
    
    async def _parse_pieza_row(self, row, tipo_registro: str) -> Optional[PiezaInfo]:
        """
        Parsea una fila de la tabla de piezas.
        Estructura: Nombre, Origen, # Parte, Observaciones, Proveedor, Fechas, Deméritos, Estatus, Ubicación, Checkboxes
        """
        try:
            cells = await row.locator('td').all()
            if len(cells) < 8:
                return None
            
            texts = []
            for cell in cells:
                text = await cell.text_content()
                texts.append(text.strip() if text else '')
            
            # Extraer datos básicos
            nombre = texts[0] if len(texts) > 0 else ''
            origen = texts[1] if len(texts) > 1 else ''
            numero_parte = texts[2] if len(texts) > 2 else None
            observaciones = texts[3] if len(texts) > 3 else None
            
            # Proveedor (celda 4) - puede tener formato: "14936 OZ AUTOMOTRIZ COUNTRY"
            proveedor_text = texts[4] if len(texts) > 4 else ''
            proveedor = self._parse_proveedor(proveedor_text)
            
            # Fechas (celda 5) - pueden venir como: "2025-04-16 12:00:46"
            fecha_text = texts[5] if len(texts) > 5 else ''
            fecha_promesa = self._parse_fecha(fecha_text)
            
            # Deméritos (celda 6) - formato: "Demerito: $0" o "$150"
            demeritos_text = texts[6] if len(texts) > 6 else '0'
            demeritos = self._parse_demeritos(demeritos_text)
            
            # Estatus y fecha de estatus (celda 7) - formato: "Cancelada: 2025-04-16 12:00:46"
            estatus_text = texts[7] if len(texts) > 7 else ''
            estatus, fecha_estatus = self._parse_estatus(estatus_text)
            
            # Ubicación (celda 8) - dropdown con valor
            ubicacion = texts[8] if len(texts) > 8 else 'ND'
            
            # Checkboxes (últimas celdas)
            # Por ahora asumimos false, se pueden extraer de inputs si es necesario
            devolucion = False
            recibido = False
            entregado = False
            portal = False
            
            # Intentar encontrar checkboxes
            try:
                checkboxes = await row.locator('input[type="checkbox"]').all()
                if len(checkboxes) >= 4:
                    devolucion = await checkboxes[0].is_checked()
                    recibido = await checkboxes[1].is_checked()
                    entregado = await checkboxes[2].is_checked()
                    portal = await checkboxes[3].is_checked()
            except:
                pass
            
            return PiezaInfo(
                nombre=nombre,
                origen=origen,
                numero_parte=numero_parte,
                observaciones=observaciones,
                proveedor=proveedor,
                fecha_promesa=fecha_promesa,
                demeritos=demeritos,
                estatus=estatus,
                fecha_estatus=fecha_estatus,
                ubicacion=ubicacion,
                devolucion_proveedor=devolucion,
                recibido=recibido,
                entregado=entregado,
                portal=portal,
                tipo_registro=tipo_registro
            )
            
        except Exception as e:
            print(f"    [Error] Parseando fila: {e}")
            return None
    
    def _parse_proveedor(self, text: str) -> ProveedorInfo:
        """Parsea texto de proveedor: '14936 OZ AUTOMOTRIZ COUNTRY'"""
        # Intentar extraer ID numérico al inicio
        match = re.match(r'^(\d+)\s+(.+)$', text.strip())
        if match:
            return ProveedorInfo(
                id_externo=int(match.group(1)),
                nombre=match.group(2).strip()
            )
        
        # Si no hay número, usar texto completo como nombre
        return ProveedorInfo(
            id_externo=0,
            nombre=text.strip()
        )
    
    def _parse_fecha(self, text: str) -> Optional[datetime]:
        """Parsea fecha en formato: '2025-04-16 12:00:46'"""
        try:
            # Buscar patrón de fecha
            match = re.search(r'(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})', text)
            if match:
                return datetime.strptime(match.group(1), '%Y-%m-%d %H:%M:%S')
            
            # Intentar formato corto
            match = re.search(r'(\d{4}-\d{2}-\d{2})', text)
            if match:
                return datetime.strptime(match.group(1), '%Y-%m-%d')
                
        except Exception:
            pass
        
        return None
    
    def _parse_demeritos(self, text: str) -> float:
        """Parsea deméritos: 'Demerito: $150' -> 150.0"""
        try:
            match = re.search(r'\$?([\d,]+\.?\d*)', text.replace(',', ''))
            if match:
                return float(match.group(1))
        except:
            pass
        
        return 0.0
    
    def _parse_estatus(self, text: str) -> Tuple[str, Optional[datetime]]:
        """Parsea estatus: 'Cancelada: 2025-04-16 12:00:46' -> ('Cancelada', datetime)"""
        try:
            # Separar estatus y fecha
            parts = text.split(':', 1)
            estatus = parts[0].strip()
            
            fecha = None
            if len(parts) > 1:
                fecha = self._parse_fecha(parts[1])
            
            return estatus, fecha
            
        except:
            return text, None
    
    async def _save_to_database(self, orden: OrdenPiezas):
        """Guarda las piezas en la base de datos"""
        try:
            with get_connection() as conn:
                with conn.cursor() as cur:
                    for pieza in orden.piezas:
                        # 1. Guardar/actualizar proveedor
                        cur.execute("""
                            INSERT INTO proveedores (id_externo, fuente, nombre, email, celular)
                            VALUES (%s, 'Qualitas', %s, %s, %s)
                            ON CONFLICT (id_externo, fuente) DO UPDATE SET
                                nombre = EXCLUDED.nombre,
                                updated_at = CURRENT_TIMESTAMP
                            RETURNING id
                        """, (
                            pieza.proveedor.id_externo,
                            pieza.proveedor.nombre,
                            pieza.proveedor.email,
                            pieza.proveedor.celular
                        ))
                        
                        proveedor_id = cur.fetchone()[0]
                        
                        # 2. Generar ID externo único para la pieza
                        id_externo = f"Q-{orden.num_expediente}-{pieza.nombre[:20]}-{pieza.proveedor.id_externo}"
                        
                        # 3. Guardar pieza
                        cur.execute("""
                            INSERT INTO bitacora_piezas (
                                nombre, origen, numero_parte, observaciones, proveedor_id,
                                fecha_promesa, fecha_estatus, estatus, demeritos, ubicacion,
                                devolucion_proveedor, recibido, entregado, portal,
                                fuente, tipo_registro, num_expediente, id_externo
                            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                            ON CONFLICT (id_externo, fuente) DO UPDATE SET
                                estatus = EXCLUDED.estatus,
                                fecha_estatus = EXCLUDED.fecha_estatus,
                                demeritos = EXCLUDED.demeritos,
                                ubicacion = EXCLUDED.ubicacion,
                                devolucion_proveedor = EXCLUDED.devolucion_proveedor,
                                recibido = EXCLUDED.recibido,
                                entregado = EXCLUDED.entregado,
                                portal = EXCLUDED.portal,
                                updated_at = CURRENT_TIMESTAMP
                        """, (
                            pieza.nombre, pieza.origen, pieza.numero_parte, pieza.observaciones,
                            proveedor_id, pieza.fecha_promesa, pieza.fecha_estatus,
                            pieza.estatus, pieza.demeritos, pieza.ubicacion,
                            pieza.devolucion_proveedor, pieza.recibido, pieza.entregado, pieza.portal,
                            'Qualitas', pieza.tipo_registro, orden.num_expediente, id_externo
                        ))
                
                conn.commit()
                print(f"  ✓ Guardadas {len(orden.piezas)} piezas en BD")
                
        except Exception as e:
            print(f"  ✗ Error guardando en BD: {e}")
            raise


# Función de conveniencia para uso directo
async def extract_piezas_transito(page: Page, max_ordenes: int = None) -> List[OrdenPiezas]:
    """
    Función de conveniencia para extraer piezas de órdenes en tránsito.
    
    Args:
        page: Página de Playwright ya logueada en Qualitas
        max_ordenes: Máximo de órdenes a procesar
        
    Returns:
        Lista de órdenes con sus piezas
    """
    extractor = QualitasPiezasExtractor(page)
    return await extractor.extract_piezas_from_transito(max_ordenes)
