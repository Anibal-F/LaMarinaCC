"""
Extractor de datos del Dashboard de Qualitas.

Extrae:
- Estatus de órdenes (cards del dashboard)
- Listado de órdenes por estatus
- Detalle de órdenes individuales
"""

import json
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Dict, Any

from playwright.async_api import Page


@dataclass
class OrdenEstatus:
    """Representa un estatus de orden con su cantidad."""
    nombre: str
    cantidad: int
    data_id: Optional[str] = None
    data_tipo: Optional[str] = None


@dataclass
class DashboardData:
    """Datos completos del dashboard."""
    fecha_extraccion: str
    taller_id: str
    taller_nombre: str
    usuario: str
    estatus: List[OrdenEstatus]
    total_ordenes: int
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "fecha_extraccion": self.fecha_extraccion,
            "taller_id": self.taller_id,
            "taller_nombre": self.taller_nombre,
            "usuario": self.usuario,
            "estatus": [asdict(e) for e in self.estatus],
            "total_ordenes": self.total_ordenes,
        }
    
    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent, ensure_ascii=False)


class QualitasExtractor:
    """Extractor de datos del portal de Qualitas."""
    
    def __init__(self, page: Page):
        self.page = page
    
    async def extract_dashboard_cards(self) -> List[OrdenEstatus]:
        """
        Extrae los datos de los cards del dashboard.
        
        Returns:
            Lista de OrdenEstatus con nombre y cantidad
        """
        # Selector para todos los items del widget
        items = await self.page.locator('.kt-widget17__item').all()
        
        estatus_list = []
        
        for item in items:
            try:
                # Extraer cantidad (primer span con número)
                cantidad_el = item.locator('span.kt-widget17__subtitle').first
                cantidad_text = await cantidad_el.text_content()
                cantidad = int(cantidad_text.strip()) if cantidad_text else 0
                
                # Extraer nombre (segundo span o buscar por estructura)
                spans = await item.locator('span.kt-widget17__subtitle').all()
                nombre = "Desconocido"
                if len(spans) >= 2:
                    nombre_text = await spans[1].text_content()
                    nombre = nombre_text.strip() if nombre_text else "Desconocido"
                
                # Extraer atributos data-* si existen
                data_id = await item.get_attribute('data-id')
                data_tipo = await item.get_attribute('data-tipo')
                data_etapa = await item.get_attribute('data-etapa_name')
                
                # Si hay data-etapa_name, usarlo como nombre (más confiable)
                if data_etapa:
                    nombre = data_etapa
                
                estatus_list.append(OrdenEstatus(
                    nombre=nombre,
                    cantidad=cantidad,
                    data_id=data_id,
                    data_tipo=data_tipo
                ))
                
            except Exception as e:
                print(f"[Extractor] Error procesando card: {e}")
                continue
        
        return estatus_list
    
    async def extract_taller_info(self) -> Dict[str, str]:
        """
        Extrae información del taller desde el header.
        
        Returns:
            Dict con taller_id, taller_nombre, usuario
        """
        info = {
            "taller_id": "",
            "taller_nombre": "",
            "usuario": ""
        }
        
        try:
            # Buscar en el header - típicamente en formato "TALLER NOMBRE | ID"
            header_text = await self.page.locator('.kt-header__topbar-item--user .kt-header__topbar-username').text_content()
            if header_text:
                info["usuario"] = header_text.strip()
        except:
            pass
        
        # Intentar extraer de la URL o de elementos específicos
        try:
            # Buscar ID del taller en el header
            taller_text = await self.page.locator('.kt-header__topbar-item--user').text_content()
            if taller_text:
                # Parsear formato típico: "DETALLADO AUTOMOTRIZ LA MARINA | 96627"
                if "|" in taller_text:
                    parts = taller_text.split("|")
                    info["taller_nombre"] = parts[0].strip()
                    info["taller_id"] = parts[1].strip()
        except:
            pass
        
        return info
    
    async def extract_full_dashboard(self) -> DashboardData:
        """
        Extrae todos los datos del dashboard.
        
        Returns:
            DashboardData completo
        """
        print("[Extractor] Extrayendo cards del dashboard...")
        estatus = await self.extract_dashboard_cards()
        
        print(f"[Extractor] {len(estatus)} estatus encontrados")
        
        # Calcular total
        total = sum(e.cantidad for e in estatus)
        
        # Info del taller (fallback a variables de entorno si no se encuentra)
        taller_info = await self.extract_taller_info()
        
        return DashboardData(
            fecha_extraccion=datetime.now().isoformat(),
            taller_id=taller_info.get("taller_id", "96627"),
            taller_nombre=taller_info.get("taller_nombre", "DETALLADO AUTOMOTRIZ LA MARINA"),
            usuario=taller_info.get("usuario", ""),
            estatus=estatus,
            total_ordenes=total
        )
    
    async def click_on_status_card(self, status_name: str) -> bool:
        """
        Hace click en un card de estatus específico para ver el detalle.
        
        Args:
            status_name: Nombre del estatus (ej: "Asignados", "Pérdida Total")
            
        Returns:
            True si se hizo click exitosamente
        """
        try:
            # Buscar por data-etapa_name o por texto
            cards = await self.page.locator('.kt-widget17__item').all()
            
            for card in cards:
                # Verificar data-etapa_name
                data_etapa = await card.get_attribute('data-etapa_name')
                if data_etapa and status_name.lower() in data_etapa.lower():
                    await card.click()
                    print(f"[Extractor] Click en '{status_name}' (data-etapa_name)")
                    return True
                
                # Verificar texto del card
                text = await card.text_content()
                if text and status_name.lower() in text.lower():
                    await card.click()
                    print(f"[Extractor] Click en '{status_name}' (texto)")
                    return True
            
            print(f"[Extractor] No se encontró card para '{status_name}'")
            return False
            
        except Exception as e:
            print(f"[Extractor] Error haciendo click: {e}")
            return False
    
    async def wait_for_modal(self, timeout: int = 5000) -> bool:
        """Espera a que aparezca un modal después de hacer click."""
        try:
            # Selectores comunes para modales
            modal_selectors = [
                '.modal.show',
                '.modal.fade.show',
                '[class*="modal"]',
                '.kt-modal',
            ]
            
            for selector in modal_selectors:
                try:
                    await self.page.wait_for_selector(selector, timeout=timeout)
                    return True
                except:
                    continue
            
            return False
        except:
            return False
    
    async def extract_modal_data(self) -> Dict[str, Any]:
        """
        Extrae datos de un modal abierto.
        
        Returns:
            Dict con datos del modal (título, contenido, tabla si existe)
        """
        data = {
            "titulo": "",
            "contenido": "",
            "tabla": []
        }
        
        try:
            # Título del modal
            titulo = await self.page.locator('.modal-title').text_content()
            data["titulo"] = titulo.strip() if titulo else ""
        except:
            pass
        
        # Buscar tabla en el modal
        try:
            rows = await self.page.locator('.modal table tbody tr').all()
            for row in rows:
                cells = await row.locator('td').all()
                row_data = []
                for cell in cells:
                    text = await cell.text_content()
                    row_data.append(text.strip() if text else "")
                if row_data:
                    data["tabla"].append(row_data)
        except:
            pass
        
        return data
    
    def save_to_file(self, data: DashboardData, filepath: Optional[Path] = None) -> Path:
        """
        Guarda los datos extraídos en un archivo JSON.
        
        Args:
            data: DashboardData a guardar
            filepath: Ruta opcional, si no se usa timestamp
            
        Returns:
            Path del archivo guardado
        """
        if filepath is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filepath = Path(__file__).resolve().parent / "data" / f"qualitas_dashboard_{timestamp}.json"
        
        filepath.parent.mkdir(parents=True, exist_ok=True)
        
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(data.to_json())
        
        print(f"[Extractor] Datos guardados en: {filepath}")
        return filepath


async def extract_with_login():
    """
    Función de conveniencia: hace login y extrae datos.
    Usa sesión guardada si existe.
    """
    import os
    from playwright.async_api import async_playwright
    from playwright_stealth import Stealth
    
    session_path = Path(__file__).resolve().parent / "sessions" / "qualitas_session.json"
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        
        context = None
        if session_path.exists():
            print("[Extractor] Cargando sesión guardada...")
            context = await browser.new_context(storage_state=str(session_path))
        else:
            print("[Extractor] No hay sesión guardada, se requiere login primero")
            return None
        
        page = await context.new_page()
        
        # Stealth
        stealth = Stealth(navigator_languages_override=('es-MX', 'es'))
        await stealth.apply_stealth_async(page)
        
        # Navegar al dashboard
        await page.goto("https://proordersistem.com.mx/dashboard", wait_until="networkidle")
        await asyncio.sleep(2)
        
        # Extraer datos
        extractor = QualitasExtractor(page)
        data = await extractor.extract_full_dashboard()
        
        # Mostrar resultados
        print("\n" + "=" * 60)
        print("DATOS EXTRAÍDOS DEL DASHBOARD")
        print("=" * 60)
        print(f"Taller: {data.taller_nombre} (ID: {data.taller_id})")
        print(f"Usuario: {data.usuario}")
        print(f"Total órdenes: {data.total_ordenes}")
        print("\nEstatus:")
        for est in data.estatus:
            print(f"  • {est.nombre}: {est.cantidad}")
        print("=" * 60)
        
        # Guardar
        extractor.save_to_file(data)
        
        await context.close()
        await browser.close()
        
        return data


# Para ejecutar standalone
if __name__ == "__main__":
    import asyncio
    asyncio.run(extract_with_login())
