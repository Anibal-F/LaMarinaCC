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
import os
import re
from datetime import datetime
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass, asdict
from playwright.async_api import Page, expect

# Forzar DATABASE_URL de RDS para el extractor de piezas
os.environ['DATABASE_URL'] = 'postgresql+psycopg://LaMarinaCC:A355Fu584%24@lamarinacc-db.c7o8imsw0zss.us-east-1.rds.amazonaws.com:5432/postgres?sslmode=require'

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
    numero_reporte: Optional[str]  # Ej: "R: 04 0540704 25 A"
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
        Retorna lista con num_expediente, numero_reporte e índice de fila.
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
                numero_reporte = None
                
                for j, cell in enumerate(cells[:3]):  # Revisar primeras 3 celdas
                    text = await cell.text_content()
                    if not text:
                        continue
                    text = text.strip()
                    
                    # Buscar número de expediente (solo dígitos, 6+ caracteres)
                    if text.isdigit() and len(text) >= 6:
                        num_exp = text
                    # Buscar número de reporte (contiene "R:" o "S:")
                    elif 'R:' in text or 'S:' in text:
                        numero_reporte = text
                
                if num_exp:
                    ordenes.append({
                        'num_expediente': num_exp,
                        'numero_reporte': numero_reporte,
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
                numero_reporte=orden.get('numero_reporte'),
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
        
        # Esperar a que carguen las tablas específicas
        print("  → Esperando carga de tablas de piezas...")
        try:
            await page.wait_for_selector('#dt-RefaccionesV22, #dt-RefaccionesV23', timeout=15000)
        except Exception as e:
            print(f"  ⚠ Timeout esperando tablas: {e}")
        await asyncio.sleep(2)
        
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
            # IDs específicos de las tablas de piezas
            table_ids = {
                'Proceso de Surtido': '#dt-RefaccionesV22',
                'Reasignada/Cancelada': '#dt-RefaccionesV23'
            }
            
            table_id = table_ids.get(tipo_registro)
            if not table_id:
                print(f"  [Warning] No se conoce el ID de tabla para: {tipo_registro}")
                return piezas
            
            print(f"  → Buscando tabla {table_id}...")
            
            # Esperar a que la tabla esté visible
            try:
                await page.wait_for_selector(table_id, timeout=10000)
            except Exception as e:
                print(f"  [Warning] Tabla {table_id} no encontrada: {e}")
                return piezas
            
            # Verificar si tiene datos
            table = page.locator(table_id).first
            
            # Verificar si hay filas de datos (no solo el mensaje de vacío)
            rows = await table.locator('tbody tr').all()
            print(f"  → {len(rows)} filas encontradas en tabla {tipo_registro}")
            
            # Filtrar filas que tengan datos reales (no el mensaje de 'Ningún dato')
            data_rows = []
            for row in rows:
                try:
                    # Verificar si es una fila de datos válida
                    cells = await row.locator('td').all()
                    if len(cells) > 1:  # Al menos 2 celdas
                        first_cell_text = await cells[0].text_content() or ''
                        if 'Ningún dato' not in first_cell_text and 'dataTables_empty' not in await row.get_attribute('class'):
                            data_rows.append(row)
                except:
                    continue
            
            print(f"  → {len(data_rows)} filas con datos válidos")
            
            for row in data_rows:
                try:
                    pieza = await self._parse_pieza_row(row, tipo_registro)
                    if pieza:
                        piezas.append(pieza)
                        print(f"    ✓ Pieza extraída: {pieza.nombre[:30]}...")
                except Exception as e:
                    print(f"    [Warning] Error parseando fila: {e}")
                    continue
            
        except Exception as e:
            print(f"  [Warning] Error extrayendo de tabla {table_identifier}: {e}")
        
        return piezas
    
    async def _parse_pieza_row(self, row, tipo_registro: str) -> Optional[PiezaInfo]:
        """
        Parsea una fila de la tabla de piezas.
        Estructura HTML real: ID(hidden), Nombre, Origen, # Parte, Observaciones, Proveedor, Fechas, Deméritos, Estatus, Ubicación, Checkboxes...
        """
        try:
            # Obtener todas las celdas td (incluyendo las ocultas)
            cells = await row.locator('td').all()
            if len(cells) < 10:
                return None
            
            # Función auxiliar para obtener texto de celda
            async def get_cell_text(cell):
                try:
                    text = await cell.text_content()
                    return text.strip() if text else ''
                except:
                    return ''
            
            # La estructura real basada en el HTML:
            # 0: ID (hidden) | 1: Nombre | 2: Origen | 3: # Parte | 4: Observaciones | 5: Proveedor | 6: Fechas | 7: Deméritos | 8: Estatus | 9: Ubicación | 10+: Checkboxes
            
            nombre = await get_cell_text(cells[1])
            if not nombre or nombre == 'Ningún dato disponible en esta tabla':
                return None
            
            origen = await get_cell_text(cells[2])
            numero_parte = await get_cell_text(cells[3]) or None
            observaciones = await get_cell_text(cells[4]) or None
            
            # Proveedor (celda 5)
            proveedor_text = await get_cell_text(cells[5])
            proveedor = self._parse_proveedor(proveedor_text)
            
            # Fechas (celda 6) - buscar la fecha visible
            fecha_cell = cells[6]
            fecha_html = await fecha_cell.inner_html()
            # Buscar la fecha que se muestra (generalmente la más reciente o relevante)
            fecha_promesa = self._extract_fecha_from_html(fecha_html)
            
            # Deméritos (celda 7)
            demeritos_text = await get_cell_text(cells[7])
            demeritos = self._parse_demeritos(demeritos_text)
            
            # Estatus (celda 8) - extraer el estatus visible
            estatus_cell = cells[8]
            estatus_html = await estatus_cell.inner_html()
            estatus, fecha_estatus = self._extract_estatus_from_html(estatus_html)
            
            # Ubicación (celda 9) - buscar el valor del select
            ubicacion = 'ND'
            try:
                select = cells[9].locator('select').first
                if await select.is_visible():
                    ubicacion = await select.input_value() or 'ND'
            except:
                ubicacion = await get_cell_text(cells[9]) or 'ND'
            
            # Checkboxes (celdas 10-13 aprox)
            devolucion = False
            recibido = False
            entregado = False
            portal = False
            
            try:
                checkboxes = await row.locator('input[type="checkbox"]:not([id^="multiCheck"])').all()
                # Los primeros 4 checkboxes corresponden a: devolución, recibido, entregado, portal
                if len(checkboxes) >= 1:
                    devolucion = await checkboxes[0].is_checked()
                if len(checkboxes) >= 2:
                    recibido = await checkboxes[1].is_checked()
                if len(checkboxes) >= 3:
                    entregado = await checkboxes[2].is_checked()
                if len(checkboxes) >= 4:
                    portal = await checkboxes[3].is_checked()
            except Exception as e:
                print(f"    [Debug] Error leyendo checkboxes: {e}")
            
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
        # Limpiar texto de elementos no deseados (iconos, botones, etc.)
        cleaned = text.strip()
        
        # Remover todo desde CONTACT (case insensitive) - más agresivo
        cleaned = re.split(r'CONTACT', cleaned, flags=re.IGNORECASE)[0]
        
        # Remover iconos de FontAwesome y elementos comunes de UI
        cleaned = re.sub(r'\s+fa[srbl]?\s+fa-\w+', ' ', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'\b(fas|far|fab|fa|info|circle|button|btn)\b', ' ', cleaned, flags=re.IGNORECASE)
        
        # Remover caracteres especiales comunes en UI (iconos de contacto, etc.)
        cleaned = re.sub(r'[\{\}\[\]\(\)<>]', ' ', cleaned)
        
        # Limpiar espacios extra y guiones bajos sueltos
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()
        cleaned = re.sub(r'^_+|_+$', '', cleaned).strip()
        cleaned = re.sub(r'\s*_+\s*', ' ', cleaned)
        
        # Manejar caso "0 Sin Asignar" o similar
        if cleaned.lower() in ['0', '0 sin asignar', 'sin asignar', '-', '']:
            return ProveedorInfo(id_externo=0, nombre='Sin Asignar')
        
        # Intentar extraer ID numérico al inicio
        match = re.match(r'^(\d+)\s+(.+)$', cleaned)
        if match:
            proveedor_id = int(match.group(1))
            nombre_limpio = match.group(2).strip()
            
            # Si el ID es 0, usar solo el nombre
            if proveedor_id == 0:
                return ProveedorInfo(id_externo=0, nombre=nombre_limpio or 'Sin Asignar')
            
            # Limitar nombre a 50 caracteres para evitar truncamiento feo
            if len(nombre_limpio) > 50:
                nombre_limpio = nombre_limpio[:47] + '...'
            return ProveedorInfo(id_externo=proveedor_id, nombre=nombre_limpio)
        
        # Si solo hay un número, es el ID sin nombre
        if cleaned.isdigit():
            return ProveedorInfo(id_externo=int(cleaned), nombre='Sin Nombre')
        
        # Si no hay número, usar texto limpio como nombre
        if len(cleaned) > 50:
            cleaned = cleaned[:47] + '...'
        return ProveedorInfo(id_externo=0, nombre=cleaned or 'Sin Asignar')
    
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
    
    def _extract_fecha_from_html(self, html: str) -> Optional[datetime]:
        """Extrae la fecha relevante del HTML de la celda de fechas."""
        try:
            # Buscar la fecha visible (la que no está en display:none)
            # El formato es: <p>... Icono ... Texto: <br>FECHA</p>
            import re
            
            # Buscar todas las fechas en el HTML
            fechas = re.findall(r'(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})', html)
            if fechas:
                # Tomar la última fecha (generalmente la más relevante)
                return datetime.strptime(fechas[-1], '%Y-%m-%d %H:%M:%S')
            
            # Si no hay formato completo, buscar solo fecha
            fechas_cortas = re.findall(r'(\d{4}-\d{2}-\d{2})', html)
            if fechas_cortas:
                return datetime.strptime(fechas_cortas[-1], '%Y-%m-%d')
                
        except:
            pass
        
        return None
    
    def _extract_estatus_from_html(self, html: str) -> Tuple[str, Optional[datetime]]:
        """Extrae el estatus y fecha del HTML de la celda de estatus."""
        try:
            import re
            
            # Buscar el estatus visible (el que tiene icono)
            # Ejemplo: <i class="fas fa-ban" style="color: red;"></i> Cancelada
            estatus_match = re.search(r'<i[^>]*></i>\s*([^<]+)', html)
            if estatus_match:
                estatus = estatus_match.group(1).strip()
                # Limpiar de espacios y saltos de línea
                estatus = estatus.split('\n')[0].strip()
                
                # Buscar fecha asociada
                fecha_match = re.search(r'(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})', html)
                fecha = None
                if fecha_match:
                    fecha = datetime.strptime(fecha_match.group(1), '%Y-%m-%d %H:%M:%S')
                
                return estatus, fecha
            
            # Fallback: buscar cualquier texto que parezca estatus
            if 'Cancelada' in html:
                return 'Cancelada', self._extract_fecha_from_html(html)
            elif 'Por Solicitar' in html:
                return 'Por Solicitar', self._extract_fecha_from_html(html)
            elif 'Solicitado' in html:
                return 'Solicitado', self._extract_fecha_from_html(html)
            elif 'Autorizado' in html:
                return 'Autorizado', self._extract_fecha_from_html(html)
                
        except:
            pass
        
        return 'Desconocido', None
    
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
                        # Usar num_expediente como numero_orden (el número visible en Qualitas)
                        numero_orden = orden.num_expediente
                        numero_reporte = orden.numero_reporte
                        
                        cur.execute("""
                            INSERT INTO bitacora_piezas (
                                nombre, origen, numero_parte, observaciones, proveedor_id,
                                numero_orden, numero_reporte,
                                fecha_promesa, fecha_estatus, estatus, demeritos, ubicacion,
                                devolucion_proveedor, recibido, entregado, portal,
                                fuente, tipo_registro, num_expediente, id_externo
                            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                            ON CONFLICT (id_externo, fuente) DO UPDATE SET
                                numero_orden = EXCLUDED.numero_orden,
                                numero_reporte = EXCLUDED.numero_reporte,
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
                            proveedor_id, numero_orden, numero_reporte,
                            pieza.fecha_promesa, pieza.fecha_estatus,
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
