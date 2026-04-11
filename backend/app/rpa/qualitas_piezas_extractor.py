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
from app.rpa.qualitas_checkpoint import QualitasCheckpoint


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
    # Datos de paquetería
    paqueteria: Optional[str] = None
    guia_paqueteria: Optional[str] = None


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
    
    def __init__(self, page: Page, use_checkpoint: bool = True, resume_from_checkpoint: bool = True):
        self.page = page
        self.base_url = "https://www.sistemaslaplataformalaguna.com"
        self.ordenes_procesadas = []
        self.start_time = None
        self.last_activity_time = None
        self.max_orden_time = 180  # Máximo 3 minutos por orden
        self.max_total_time = 3600  # Máximo 1 hora total
        
        # Checkpoint
        self.use_checkpoint = use_checkpoint
        self.checkpoint = QualitasCheckpoint() if use_checkpoint else None
        self.ordenes_ya_procesadas = set()
        
        if use_checkpoint and resume_from_checkpoint:
            self.ordenes_ya_procesadas = self.checkpoint.get_ordenes_procesadas()
            stats = self.checkpoint.get_stats()
            if stats['procesadas'] > 0:
                print(f"[Extractor] Reanudando desde checkpoint: {stats['procesadas']} órdenes ya procesadas ({stats['porcentaje']}%)")
    
    def _check_timeout(self):
        """Verifica si se ha excedido el tiempo máximo"""
        if self.start_time and (datetime.now() - self.start_time).total_seconds() > self.max_total_time:
            raise TimeoutError("Tiempo máximo de ejecución excedido (1 hora)")
        
        if self.last_activity_time and (datetime.now() - self.last_activity_time).total_seconds() > self.max_orden_time:
            raise TimeoutError(f"Tiempo máximo por orden excedido ({self.max_orden_time} segundos)")
    
    def _update_activity(self):
        """Actualiza el tiempo de última actividad"""
        self.last_activity_time = datetime.now()
    
    def is_orden_procesada(self, num_expediente: str) -> bool:
        """Verifica si una orden ya fue procesada (checkpoint o sesión actual)."""
        if num_expediente in self.ordenes_ya_procesadas:
            return True
        if self.use_checkpoint and self.checkpoint.is_orden_procesada(num_expediente):
            return True
        return False
    
    async def extract_piezas(self, max_ordenes: int = None) -> List[OrdenPiezas]:
        """
        Extrae piezas de todas las órdenes en estado Tránsito y Piso.
        
        Args:
            max_ordenes: Máximo de órdenes a procesar (None = todas)
            
        Returns:
            Lista de órdenes con sus piezas
        """
        self.start_time = datetime.now()
        self.last_activity_time = datetime.now()
        
        resultados = []
        ordenes_procesadas_total = 0
        
        try:
            # Primero procesar tab Tránsito
            print("[PiezasExtractor] === INICIANDO PROCESAMIENTO DE TRÁNSITO ===")
            resultados_transito, ordenes_transito = await self._process_tab(
                tab_name='transito',
                tab_selector='#transito-tab, a[href="#transito"], a:has-text("Tránsito"), #transito',
                table_id='tabletransito',
                next_button_id='pagina_siguiente_tabletransito',
                max_ordenes=max_ordenes
            )
            resultados.extend(resultados_transito)
            ordenes_procesadas_total += ordenes_transito
            
            # Verificar si alcanzamos el límite
            if max_ordenes and ordenes_procesadas_total >= max_ordenes:
                print(f"[PiezasExtractor] Límite de {max_ordenes} órdenes alcanzado después de Tránsito")
                return resultados
            
            # Luego procesar tab Piso
            print("\n[PiezasExtractor] === INICIANDO PROCESAMIENTO DE PISO ===")
            resultados_piso, ordenes_piso = await self._process_tab(
                tab_name='piso',
                tab_selector='#piso-tab, a[href="#piso"], a:has-text("Piso"), #piso',
                table_id='tablepiso',
                next_button_id='pagina_siguiente_tablepiso',
                max_ordenes=max_ordenes - ordenes_procesadas_total if max_ordenes else None
            )
            resultados.extend(resultados_piso)
            ordenes_procesadas_total += ordenes_piso
            
            print(f"\n[PiezasExtractor] === RESUMEN FINAL ===")
            print(f"[PiezasExtractor] Tránsito: {ordenes_transito} órdenes")
            print(f"[PiezasExtractor] Piso: {ordenes_piso} órdenes")
            print(f"[PiezasExtractor] Total: {ordenes_procesadas_total} órdenes")
            
            return resultados
            
        except TimeoutError as te:
            print(f"\n⏱ [PiezasExtractor] TIMEOUT GENERAL: {te}")
            print(f"[PiezasExtractor] Se procesaron {len(resultados)} órdenes antes del timeout")
            return resultados
        except Exception as e:
            print(f"\n✗ [PiezasExtractor] ERROR GENERAL: {e}")
            import traceback
            traceback.print_exc()
            return resultados
    
    async def _process_tab(
        self,
        tab_name: str,
        tab_selector: str,
        table_id: str,
        next_button_id: str,
        max_ordenes: int = None
    ) -> Tuple[List[OrdenPiezas], int]:
        """
        Procesa una tab específica (Tránsito o Piso).
        
        Returns:
            Tuple de (lista de órdenes con piezas, cantidad de órdenes procesadas)
        """
        resultados = []
        ordenes_procesadas = 0
        
        try:
            # 1. Navegar al tab
            print(f"[PiezasExtractor][{tab_name}] Navegando al tab...")
            await self._navigate_to_tab(tab_selector, table_id)
            
            # Procesar página por página
            pagina = 1
            while True:
                self._check_timeout()
                print(f"\n[PiezasExtractor][{tab_name}] === Procesando página {pagina} ===")
                
                # 2. Extraer lista de órdenes de la página actual
                print(f"[PiezasExtractor][{tab_name}] Extrayendo lista de órdenes...")
                ordenes = await self._extract_ordenes_list_from_table(table_id)
                print(f"[PiezasExtractor][{tab_name}] Se encontraron {len(ordenes)} órdenes en página {pagina}")
                
                if not ordenes:
                    print(f"[PiezasExtractor][{tab_name}] No hay órdenes en página {pagina}, terminando tab...")
                    break
                
                # Guardar total de órdenes en checkpoint (primera página)
                if pagina == 1 and self.use_checkpoint:
                    self.checkpoint.update_total_ordenes(len(ordenes), tab_name)
                
                # 3. Procesar cada orden de esta página
                for i, orden in enumerate(ordenes, 1):
                    self._check_timeout()
                    num_exp = orden['num_expediente']
                    
                    # Verificar si ya fue procesada
                    if self.is_orden_procesada(num_exp):
                        print(f"\n[PiezasExtractor][{tab_name}] Orden {num_exp} ya procesada (checkpoint), saltando...")
                        continue
                    
                    # Verificar límite de órdenes
                    if max_ordenes and ordenes_procesadas >= max_ordenes:
                        print(f"[PiezasExtractor][{tab_name}] Límite de {max_ordenes} órdenes alcanzado")
                        return resultados, ordenes_procesadas
                    
                    try:
                        print(f"\n[PiezasExtractor][{tab_name}] Procesando orden {ordenes_procesadas + 1}/{max_ordenes or 'Todas'}: {num_exp}")
                        self._update_activity()
                        
                        orden_con_piezas = await self._process_single_orden(orden, table_id)
                        if orden_con_piezas and orden_con_piezas.piezas:
                            resultados.append(orden_con_piezas)
                            ordenes_procesadas += 1
                            piezas_count = len(orden_con_piezas.piezas)
                            print(f"  ✓ Extraídas {piezas_count} piezas")
                            
                            # Guardar en BD inmediatamente
                            await self._save_to_database(orden_con_piezas)
                            
                            # Guardar en checkpoint
                            if self.use_checkpoint:
                                self.checkpoint.mark_orden_procesada(num_exp, piezas_count, tab_name)
                                self.ordenes_ya_procesadas.add(num_exp)
                        else:
                            print(f"  ⚠ No se encontraron piezas para esta orden")
                            # Marcar como procesada igual para no volver a intentar
                            if self.use_checkpoint:
                                self.checkpoint.mark_orden_procesada(num_exp, 0, tab_name)
                                self.ordenes_ya_procesadas.add(num_exp)
                        
                        self._update_activity()
                        
                        # Pequeña pausa entre órdenes
                        await asyncio.sleep(1)
                        
                    except TimeoutError as te:
                        print(f"  ⏱ Timeout procesando orden {num_exp}: {te}")
                        if self.use_checkpoint:
                            self.checkpoint.mark_orden_fallida(num_exp, str(te), tab_name)
                        # Intentar cerrar pestañas abiertas y continuar
                        try:
                            pages = self.page.context.pages
                            if len(pages) > 1:
                                for p in pages[1:]:
                                    await p.close()
                        except:
                            pass
                        continue
                    except Exception as e:
                        print(f"  ✗ Error procesando orden {num_exp}: {e}")
                        if self.use_checkpoint:
                            self.checkpoint.mark_orden_fallida(num_exp, str(e), tab_name)
                        import traceback
                        traceback.print_exc()
                        continue
                
                # Guardar página actual en checkpoint
                if self.use_checkpoint:
                    self.checkpoint.update_pagina(pagina, tab_name)
                
                # 4. Verificar si hay siguiente página
                try:
                    siguiente_btn = self.page.locator(f'#{next_button_id}')
                    
                    # Verificar si el botón existe y está habilitado
                    is_visible = await siguiente_btn.is_visible()
                    if not is_visible:
                        print(f"[PiezasExtractor][{tab_name}] Botón siguiente no visible, terminando...")
                        break
                    
                    is_disabled = await siguiente_btn.is_disabled()
                    if is_disabled:
                        print(f"[PiezasExtractor][{tab_name}] Botón siguiente deshabilitado, terminando...")
                        break
                    
                    # Hacer clic en siguiente
                    print(f"[PiezasExtractor][{tab_name}] Navegando a página {pagina + 1}...")
                    await siguiente_btn.click()
                    
                    # Esperar a que cargue la nueva página
                    await asyncio.sleep(2)
                    await self.page.wait_for_load_state('networkidle', timeout=15000)
                    
                    # Esperar a que la tabla se actualice
                    await self.page.wait_for_selector(f'#{table_id} tbody tr', timeout=15000)
                    await asyncio.sleep(1)
                    
                    pagina += 1
                    self._update_activity()
                    
                except Exception as e:
                    print(f"[PiezasExtractor][{tab_name}] Error navegando a siguiente página: {e}")
                    break
            
            print(f"\n[PiezasExtractor][{tab_name}] Total páginas procesadas: {pagina}")
            print(f"[PiezasExtractor][{tab_name}] Total órdenes procesadas: {ordenes_procesadas}")
            
            # Marcar tab como completado si se procesaron órdenes
            if self.use_checkpoint and ordenes_procesadas > 0:
                self.checkpoint.mark_tab_completado(tab_name)
            
            return resultados, ordenes_procesadas
            
        except Exception as e:
            print(f"[PiezasExtractor][{tab_name}] Error procesando tab: {e}")
            import traceback
            traceback.print_exc()
            return resultados, ordenes_procesadas
    
    # Método legacy para compatibilidad
    async def extract_piezas_from_transito(self, max_ordenes: int = None) -> List[OrdenPiezas]:
        """
        Método legacy - ahora extrae de Tránsito y Piso.
        """
        return await self.extract_piezas(max_ordenes)
    
    async def _navigate_to_tab(self, tab_selector: str, table_id: str):
        """
        Navega a un tab específico (Tránsito o Piso).
        
        Args:
            tab_selector: Selector CSS para encontrar el tab
            table_id: ID de la tabla a esperar
        """
        # 1. Navegar al menú "Órdenes" → "Asignadas Qualitas" (solo si no estamos ya ahí)
        print("[PiezasExtractor] Navegando a menú Órdenes...")
        
        try:
            # Buscar y hacer clic en "Órdenes" del menú lateral (selectores flexibles)
            ordenes_selectors = [
                'span.kt-menu__link-text:has-text("Órdenes")',
                'a.kt-menu__link:has-text("Órdenes")',
                'a:has-text("Órdenes")',
                'span:has-text("Órdenes")',
                'a[href*="ordenes"]',
                'text=Órdenes'
            ]
            
            ordenes_menu = None
            for selector in ordenes_selectors:
                try:
                    count = await self.page.locator(selector).count()
                    if count > 0:
                        ordenes_menu = self.page.locator(selector).first
                        print(f"[PiezasExtractor] Menú Órdenes encontrado con selector: {selector}")
                        break
                except:
                    continue
            
            if ordenes_menu:
                await ordenes_menu.click()
                await asyncio.sleep(1)
            else:
                print("[PiezasExtractor] ⚠ Menú Órdenes no encontrado con ningún selector")
            
            print("[PiezasExtractor] Navegando a Asignadas Qualitas...")
            # Buscar y hacer clic en "Asignadas Qualitas" del submenú (selectores flexibles)
            asignadas_selectors = [
                'span.kt-menu__link-text:has-text("Asignadas Qualitas")',
                'a.kt-menu__link:has-text("Asignadas Qualitas")',
                'a:has-text("Asignadas Qualitas")',
                'span:has-text("Asignadas Qualitas")',
                'a[href*="asignadas"]',
                'text=Asignadas Qualitas'
            ]
            
            asignadas_link = None
            for selector in asignadas_selectors:
                try:
                    count = await self.page.locator(selector).count()
                    if count > 0:
                        asignadas_link = self.page.locator(selector).first
                        print(f"[PiezasExtractor] Asignadas Qualitas encontrado con selector: {selector}")
                        break
                except:
                    continue
            
            if asignadas_link:
                await asignadas_link.click()
            else:
                print("[PiezasExtractor] ⚠ Asignadas Qualitas no encontrado, intentando navegar directamente...")
                # Intentar navegar directamente a la URL
                await self.page.goto("https://proordersistem.com.mx/ordenes/asignadas", wait_until="networkidle")
                await asyncio.sleep(3)
            
            # Esperar a que cargue la página de órdenes asignadas
            print("[PiezasExtractor] Esperando carga de página...")
            await self.page.wait_for_load_state('networkidle')
            await asyncio.sleep(3)  # Espera adicional para carga de tabs
        except Exception as e:
            # Si ya estamos en la página, puede fallar pero no es problema
            print(f"[PiezasExtractor] Nota: {e}")
        
        # 2. Click en el tab especificado
        print(f"[PiezasExtractor] Buscando tab...")
        tab = self.page.locator(tab_selector).first
        
        # Esperar a que el tab sea visible
        await tab.wait_for(state='visible', timeout=10000)
        await tab.click()
        
        # Esperar a que la tabla se cargue
        await self.page.wait_for_selector(f'#{table_id} tbody tr', timeout=15000)
        await asyncio.sleep(1)  # Pausa adicional para carga completa
        print(f"[PiezasExtractor] ✓ Tab cargado")
    
    # Método legacy para compatibilidad
    async def _navigate_to_transito_tab(self):
        """Navega al tab de Tránsito (legacy)"""
        await self._navigate_to_tab(
            '#transito-tab, a[href="#transito"], a:has-text("Tránsito"), #transito',
            'tabletransito'
        )
    
    async def _extract_ordenes_list_from_table(self, table_id: str) -> List[Dict]:
        """
        Extrae la lista de órdenes de una tabla específica.
        Solo incluye órdenes del año 2026 o posteriores.
        Retorna lista con num_expediente, numero_reporte e índice de fila.
        
        Args:
            table_id: ID de la tabla (ej: 'tabletransito' o 'tablepiso')
        """
        ordenes = []
        ordenes_filtradas = 0
        
        # Obtener todas las filas de la tabla
        rows = await self.page.locator(f'#{table_id} tbody tr').all()
        print(f"[PiezasExtractor] {len(rows)} filas encontradas en tabla")
        
        for i, row in enumerate(rows):
            try:
                cells = await row.locator('td').all()
                if len(cells) < 3:
                    continue
                
                # La primera celda con datos suele ser # Exp (índice 0 o 1)
                num_exp = None
                numero_reporte = None
                fecha_inicio = None
                
                for j, cell in enumerate(cells[:3]):  # Revisar primeras 3 celdas
                    text = await cell.text_content()
                    if not text:
                        continue
                    text = text.strip()
                    
                    # Buscar número de expediente (solo dígitos, 6+ caracteres)
                    if text.isdigit() and len(text) >= 6:
                        num_exp = text
                    # Buscar número de reporte - extraer solo la parte después de "R:"
                    elif 'R:' in text:
                        # Buscar el patrón R: seguido del número de reporte
                        # Ejemplo: "S: 12345\nR: 04 0540704 25 A" -> "04 0540704 25 A"
                        match = re.search(r'R:\s*([^\n]+)', text)
                        if match:
                            numero_reporte = match.group(1).strip()
                        else:
                            # Fallback: si no hay match, usar todo el texto
                            numero_reporte = text
                    # Buscar fecha en formato: "2025-06-14\n16:01:09" o "2025-06-14<br>16:01:09"
                    elif re.search(r'\d{4}-\d{2}-\d{2}', text):
                        fecha_inicio = text
                
                # Verificar si la orden es del año 2026 o posterior
                if num_exp:
                    # Extraer año de la fecha (formato: YYYY-MM-DD)
                    es_orden_valida = True
                    if fecha_inicio:
                        match_anio = re.search(r'(\d{4})-\d{2}-\d{2}', fecha_inicio)
                        if match_anio:
                            anio = int(match_anio.group(1))
                            if anio < 2026:
                                # Orden de año anterior, omitir
                                ordenes_filtradas += 1
                                es_orden_valida = False
                                print(f"  [Filtro] Orden {num_exp} omitida (año {anio} < 2026)")
                    
                    if es_orden_valida:
                        ordenes.append({
                            'num_expediente': num_exp,
                            'numero_reporte': numero_reporte,
                            'row_index': i
                        })
                        print(f"  [Debug] Orden {num_exp} - Reporte: {numero_reporte}")
                    
            except Exception as e:
                print(f"  [Warning] Error extrayendo fila {i}: {e}")
                continue
        
        if ordenes_filtradas > 0:
            print(f"[PiezasExtractor] {ordenes_filtradas} órdenes filtradas (año < 2026)")
        print(f"[PiezasExtractor] {len(ordenes)} órdenes válidas para procesar (año >= 2026)")
        
        return ordenes
    
    # Método legacy para compatibilidad
    async def _extract_ordenes_list(self) -> List[Dict]:
        """
        Extrae la lista de órdenes del tab Tránsito (legacy).
        """
        return await self._extract_ordenes_list_from_table('tabletransito')
    
    async def _process_single_orden(self, orden: Dict, table_id: str = None) -> Optional[OrdenPiezas]:
        """
        Procesa una sola orden con timeouts estrictos para evitar bloqueos.
        
        Args:
            orden: Diccionario con datos de la orden
            table_id: ID de la tabla (opcional, para compatibilidad con múltiples tabs)
        """
        num_exp = orden['num_expediente']
        orden_start_time = datetime.now()
        max_orden_time = 120  # Máximo 2 minutos por orden
        
        new_page = None
        
        # Determinar el table_id - si no se proporciona, usar el de transito por defecto
        # (para compatibilidad con código que llama sin table_id)
        current_table_id = table_id or 'tabletransito'
        
        try:
            # Verificar timeout al inicio
            if (datetime.now() - orden_start_time).total_seconds() > max_orden_time:
                raise TimeoutError(f"Tiempo excedido procesando orden {num_exp}")
            
            # 1. Click en el ícono de flecha (2do ícono en columna Acciones)
            print(f"  → Buscando ícono de flecha...")
            row = self.page.locator(f'#{current_table_id} tbody tr').nth(orden['row_index'])
            
            # Buscar el ícono de flecha dentro de la fila
            arrow_icon = row.locator('i.fas.fa-arrow-alt-circle-right').first
            
            try:
                await arrow_icon.wait_for(state='visible', timeout=10000)
            except:
                print(f"  [Warning] Ícono no visible para orden {num_exp}")
                return None
            
            # Click en el ícono - abre nueva pestaña (con timeout)
            print(f"  → Abriendo página de orden...")
            try:
                async with self.page.context.expect_page(timeout=15000) as new_page_info:
                    await arrow_icon.click()
                
                new_page = await new_page_info.value
                await new_page.wait_for_load_state('networkidle', timeout=20000)
                print(f"  → Página de orden abierta")
            except Exception as e:
                print(f"  [Error] No se pudo abrir página de orden: {e}")
                return None
            
            # Verificar timeout
            if (datetime.now() - orden_start_time).total_seconds() > max_orden_time:
                raise TimeoutError(f"Tiempo excedido después de abrir página")
            
            # 2. Buscar y hacer click en "Seguimiento del Surtido de Refacciones"
            print(f"  → Buscando botón de seguimiento...")
            seguimiento_btn = new_page.locator('a:has-text("Seguimiento del Surtido de Refacciones"), a.btn-qualitas-pro:has-text("Seguimiento")').first
            
            try:
                await seguimiento_btn.wait_for(state='visible', timeout=15000)
            except:
                print(f"  [Warning] Botón de seguimiento no encontrado")
                await new_page.close()
                return None
            
            # Extraer URL del botón
            href = await seguimiento_btn.get_attribute('href')
            print(f"  → Navegando a: {href}")
            
            # Navegar a la página de refacciones (con timeout)
            await seguimiento_btn.click()
            await new_page.wait_for_load_state('networkidle', timeout=20000)
            await asyncio.sleep(1)
            
            # Verificar timeout
            if (datetime.now() - orden_start_time).total_seconds() > max_orden_time:
                raise TimeoutError(f"Tiempo excedido navegando a refacciones")
            
            # 3. Extraer piezas de ambas tablas (con timeout total)
            print(f"  → Extrayendo piezas...")
            tiempo_restante = max_orden_time - (datetime.now() - orden_start_time).total_seconds()
            
            if tiempo_restante < 30:
                print(f"  [Warning] Poco tiempo restante ({tiempo_restante:.0f}s), saltando extracción")
                piezas = []
            else:
                piezas = await self._extract_piezas_from_page(new_page)
            
            # 4. Extraer número de orden (OS) de la página de refacciones
            print(f"  → Extrayendo número de orden (OS)...")
            num_orden = await self._extract_num_orden(new_page)
            if num_orden:
                print(f"  ✓ Número de orden (OS): {num_orden}")
            else:
                print(f"  ⚠ No se pudo extraer número de orden, usando #Exp")
                num_orden = num_exp
            
            # 5. Cerrar pestaña y volver a la principal
            print(f"  → Cerrando pestaña...")
            await new_page.close()
            
            total_time = (datetime.now() - orden_start_time).total_seconds()
            print(f"  → Orden procesada en {total_time:.1f} segundos")
            
            return OrdenPiezas(
                num_expediente=num_exp,
                num_orden=num_orden,
                numero_reporte=orden.get('numero_reporte'),
                piezas=piezas,
                fecha_extraccion=datetime.now()
            )
            
        except TimeoutError as te:
            print(f"  ⏱ [Timeout] Orden {num_exp}: {te}")
            if new_page:
                try:
                    await new_page.close()
                except:
                    pass
            return None
        except Exception as e:
            print(f"  ✗ [Error] Orden {num_exp}: {e}")
            import traceback
            traceback.print_exc()
            
            # Intentar cerrar cualquier pestaña abierta
            try:
                if new_page:
                    await new_page.close()
            except:
                pass
                
            try:
                pages = self.page.context.pages
                if len(pages) > 1:
                    for p in pages[1:]:
                        await p.close()
            except:
                pass
            return None
    
    async def _extract_num_orden(self, page: Page) -> Optional[str]:
        """
        Extrae el número de orden (OS) de la página de refacciones.
        Busca el patrón: "Refacciones OS: <a href="/OsDetalle/xxx">778</a>"
        """
        try:
            # Buscar el título de la página que contiene "Refacciones OS:"
            # Ejemplo: <h3 class="kt-portlet__head-title">Refacciones OS: <a href="/OsDetalle/1205270">778</a>
            titulo = await page.locator('.kt-portlet__head-title:has-text("Refacciones OS")').first.text_content()
            if titulo:
                # Extraer el número después de "Refacciones OS:" 
                # El número está en un enlace <a> o puede estar como texto plano
                match = re.search(r'Refacciones\s+OS[:\s]+(\d+)', titulo, re.IGNORECASE)
                if match:
                    return match.group(1).strip()
                
                # Si no hay match directo, buscar el número en el enlace
                match = re.search(r'Refacciones\s+OS[:\s]+.*?>(\d+)<', titulo, re.IGNORECASE)
                if match:
                    return match.group(1).strip()
            
            # Fallback: buscar en todo el contenido HTML
            content = await page.content()
            match = re.search(r'Refacciones\s+OS[:\s]+(?:<a[^>]*>)?(\d+)(?:</a>)?', content, re.IGNORECASE)
            if match:
                return match.group(1).strip()
                
            # Buscar patrón alternativo: OS: 778
            match = re.search(r'OS[:\s]+(\d+)', content, re.IGNORECASE)
            if match:
                return match.group(1).strip()
                
        except Exception as e:
            print(f"  [Warning] No se pudo extraer número de orden: {e}")
        
        return None
    
    async def _extract_piezas_from_page(self, page: Page) -> List[PiezaInfo]:
        """
        Extrae piezas de la página de refacciones con timeout estricto.
        """
        piezas = []
        start_time = datetime.now()
        max_extraction_time = 60  # Máximo 60 segundos para extraer piezas
        
        # Verificar si se excede el tiempo
        def check_extraction_timeout():
            if (datetime.now() - start_time).total_seconds() > max_extraction_time:
                raise TimeoutError(f"Tiempo máximo de extracción excedido ({max_extraction_time}s)")
        
        # Esperar a que carguen las tablas específicas (con timeout más corto)
        print("  → Esperando carga de tablas de piezas...")
        try:
            await page.wait_for_selector('#dt-RefaccionesV22, #dt-RefaccionesV23', timeout=10000)
        except Exception as e:
            print(f"  ⚠ Timeout esperando tablas: {e}")
            return piezas  # Retornar vacío si no cargan las tablas
        
        await asyncio.sleep(1)
        check_extraction_timeout()
        
        # 1. Extraer de "En proceso de surtido"
        print("  → Extrayendo piezas en proceso de surtido...")
        try:
            piezas_surtido = await self._extract_from_table(
                page, 
                'Proceso de Surtido',
                'Proceso de Surtido'
            )
            piezas.extend(piezas_surtido)
        except Exception as e:
            print(f"  ⚠ Error extrayendo piezas en proceso: {e}")
        
        check_extraction_timeout()
        
        # 2. Extraer de "Piezas reasignadas & Canceladas"
        print("  → Extrayendo piezas reasignadas/canceladas...")
        try:
            piezas_canceladas = await self._extract_from_table(
                page,
                'Reasignadas',
                'Reasignada/Cancelada'
            )
            piezas.extend(piezas_canceladas)
        except Exception as e:
            print(f"  ⚠ Error extrayendo piezas canceladas: {e}")
        
        total_time = (datetime.now() - start_time).total_seconds()
        print(f"  → Extracción completada en {total_time:.1f}s: {len(piezas)} piezas")
        
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
            
            # Buscar icono de paquetería (solo en tabla de Proceso de Surtido)
            paqueteria = None
            guia_paqueteria = None
            
            if tipo_registro == 'Proceso de Surtido':
                try:
                    # Buscar el botón con icono de envío (fa-shipping-fast)
                    shipping_btn = row.locator('button:has(i.fas.fa-shipping-fast), button[data-content*="Paquetería"]').first
                    
                    if await shipping_btn.is_visible():
                        # Extraer datos del onclick
                        onclick = await shipping_btn.get_attribute('onclick') or ''
                        # El formato es: show_sent_date('2026-03-12 09:46:08','PAQUETE EXPRESS','211236920960')
                        match = re.search(r"show_sent_date\('([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\)", onclick)
                        if match:
                            # fecha = match.group(1)  # No la necesitamos por ahora
                            paqueteria = match.group(2)
                            guia_paqueteria = match.group(3)
                            print(f"    📦 Paquetería: {paqueteria}, Guía: {guia_paqueteria}")
                except Exception as e:
                    print(f"    [Debug] Error extrayendo paquetería: {e}")
            
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
                tipo_registro=tipo_registro,
                paqueteria=paqueteria,
                guia_paqueteria=guia_paqueteria
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
                                fuente, tipo_registro, num_expediente, id_externo,
                                paqueteria, guia_paqueteria
                            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
                                paqueteria = EXCLUDED.paqueteria,
                                guia_paqueteria = EXCLUDED.guia_paqueteria,
                                updated_at = CURRENT_TIMESTAMP
                        """, (
                            pieza.nombre, pieza.origen, pieza.numero_parte, pieza.observaciones,
                            proveedor_id, numero_orden, numero_reporte,
                            pieza.fecha_promesa, pieza.fecha_estatus,
                            pieza.estatus, pieza.demeritos, pieza.ubicacion,
                            pieza.devolucion_proveedor, pieza.recibido, pieza.entregado, pieza.portal,
                            'Qualitas', pieza.tipo_registro, orden.num_expediente, id_externo,
                            pieza.paqueteria, pieza.guia_paqueteria
                        ))
                
                conn.commit()
                print(f"  ✓ Guardadas {len(orden.piezas)} piezas en BD")
                
        except Exception as e:
            print(f"  ✗ Error guardando en BD: {e}")
            raise


# Función de conveniencia para uso directo
async def extract_piezas_transito(page: Page, max_ordenes: int = None) -> List[OrdenPiezas]:
    """
    Función de conveniencia para extraer piezas de órdenes en tránsito y piso.
    
    Args:
        page: Página de Playwright ya logueada en Qualitas
        max_ordenes: Máximo de órdenes a procesar
        
    Returns:
        Lista de órdenes con sus piezas
    """
    extractor = QualitasPiezasExtractor(page)
    return await extractor.extract_piezas(max_ordenes)
