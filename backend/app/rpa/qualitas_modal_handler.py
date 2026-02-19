"""
Manejador del modal de avisos de Qualitas.

Después del login, Qualitas muestra un modal con un documento que debe ser
leído completamente (scroll hasta el final) antes de poder continuar.

Este módulo automatiza ese proceso:
1. Detecta el modal de aviso
2. Hace scroll hasta el final del documento
3. Espera a que el botón se habilite
4. Hace click en "ENTENDIDO Y CONTINUAR"
"""

import asyncio
from typing import Optional

from playwright.async_api import Page


class QualitasModalHandler:
    """Maneja el modal de avisos post-login."""
    
    # Selectores del modal
    MODAL_SELECTOR = "#modalAvisoAdmin"
    SCROLL_CONTAINER = "#aviso-scroll-container"
    PDF_CANVAS = "#pdf-viewer-canvas"
    BTN_CONTINUAR = "#btn-aceptar-aviso"
    TXT_INSTRUCCION = "#txt-instruccion"
    
    def __init__(self, page: Page):
        self.page = page
    
    async def is_modal_present(self) -> bool:
        """Verifica si el modal de aviso está presente y visible."""
        try:
            modal = self.page.locator(self.MODAL_SELECTOR)
            if await modal.count() == 0:
                return False
            
            is_visible = await modal.is_visible()
            return is_visible
        except Exception:
            return False
    
    async def wait_for_modal(self, timeout: int = 10000) -> bool:
        """Espera a que aparezca el modal de aviso."""
        print("[ModalHandler] Esperando modal de aviso...")
        
        for attempt in range(timeout // 500):
            if await self.is_modal_present():
                print("[ModalHandler] ✓ Modal detectado")
                return True
            await asyncio.sleep(0.5)
        
        print("[ModalHandler] Modal no apareció (timeout)")
        return False
    
    async def get_scroll_info(self) -> dict:
        """Obtiene información del estado del scroll."""
        script = """
        () => {
            const container = document.querySelector('#aviso-scroll-container');
            if (!container) return null;
            
            return {
                scrollTop: container.scrollTop,
                scrollHeight: container.scrollHeight,
                clientHeight: container.clientHeight,
                isAtBottom: (container.scrollTop + container.clientHeight) >= (container.scrollHeight - 10)
            };
        }
        """
        return await self.page.evaluate(script)
    
    async def scroll_to_bottom(self, step: int = 300, delay: float = 0.3) -> bool:
        """
        Hace scroll gradual hasta el final del documento.
        
        Args:
            step: Pixeles a scrollear por paso
            delay: Segundos entre cada paso
        """
        print("[ModalHandler] Iniciando scroll hasta el final...")
        
        # Verificar que el contenedor existe
        container = self.page.locator(self.SCROLL_CONTAINER)
        if await container.count() == 0:
            print("[ModalHandler] Contenedor de scroll no encontrado")
            return False
        
        # Hacer scroll gradual
        max_attempts = 50  # Límite de seguridad
        for attempt in range(max_attempts):
            # Obtener posición actual
            info = await self.get_scroll_info()
            if not info:
                break
            
            if info['isAtBottom']:
                print(f"[ModalHandler] ✓ Llegamos al final (intento {attempt + 1})")
                return True
            
            # Calcular nueva posición
            current = info['scrollTop']
            new_position = min(current + step, info['scrollHeight'] - info['clientHeight'])
            
            # Ejecutar scroll
            await self.page.evaluate(f"""
                () => {{
                    const container = document.querySelector('#aviso-scroll-container');
                    if (container) container.scrollTop = {new_position};
                }}
            """)
            
            if attempt % 5 == 0:
                print(f"[ModalHandler] Scroll... {current}/{info['scrollHeight']} px")
            
            await asyncio.sleep(delay)
        
        print("[ModalHandler] ⚠ Límite de intentos alcanzado")
        return False
    
    async def is_button_enabled(self) -> bool:
        """Verifica si el botón 'ENTENDIDO Y CONTINUAR' está habilitado."""
        try:
            button = self.page.locator(self.BTN_CONTINUAR)
            if await button.count() == 0:
                return False
            
            disabled = await button.get_attribute("disabled")
            return disabled is None or disabled == "false"
        except Exception:
            return False
    
    async def wait_for_button_enabled(self, timeout: int = 10000) -> bool:
        """Espera a que el botón se habilite."""
        print("[ModalHandler] Esperando que se habilite el botón...")
        
        for attempt in range(timeout // 500):
            if await self.is_button_enabled():
                print("[ModalHandler] ✓ Botón habilitado")
                return True
            await asyncio.sleep(0.5)
        
        print("[ModalHandler] Botón no se habilitó (timeout)")
        return False
    
    async def click_continue(self) -> bool:
        """Hace click en el botón 'ENTENDIDO Y CONTINUAR'."""
        try:
            button = self.page.locator(self.BTN_CONTINUAR)
            
            # Esperar a que esté visible y habilitado
            await button.wait_for(state="visible", timeout=5000)
            
            if not await self.is_button_enabled():
                print("[ModalHandler] Botón aún deshabilitado, forzando...")
                # Intentar habilitar vía JavaScript
                await self.page.evaluate(f"""
                    () => {{
                        const btn = document.querySelector('{self.BTN_CONTINUAR}');
                        if (btn) {{
                            btn.disabled = false;
                            btn.style.opacity = '1';
                            btn.style.cursor = 'pointer';
                        }}
                    }}
                """)
                await asyncio.sleep(0.5)
            
            await button.click()
            print("[ModalHandler] ✓ Click en 'ENTENDIDO Y CONTINUAR'")
            
            # Esperar a que el modal se cierre
            await asyncio.sleep(1)
            modal = self.page.locator(self.MODAL_SELECTOR)
            if await modal.count() > 0:
                is_visible = await modal.is_visible()
                if not is_visible:
                    print("[ModalHandler] ✓ Modal cerrado")
                    return True
            else:
                print("[ModalHandler] ✓ Modal cerrado")
                return True
            
            return True
            
        except Exception as e:
            print(f"[ModalHandler] Error haciendo click: {e}")
            return False
    
    async def handle_modal(self) -> bool:
        """
        Maneja completo el modal de aviso.
        
        Flujo:
        1. Detecta el modal
        2. Hace scroll hasta el final
        3. Espera botón habilitado
        4. Click en continuar
        
        Returns:
            True si se manejó exitosamente
        """
        # Verificar si hay modal
        if not await self.wait_for_modal():
            print("[ModalHandler] No hay modal que manejar")
            return True  # No es error, simplemente no hay modal
        
        print("[ModalHandler] Procesando modal de aviso...")
        
        # Hacer scroll hasta el final
        scrolled = await self.scroll_to_bottom()
        if not scrolled:
            print("[ModalHandler] ⚠ No se pudo hacer scroll completo, intentando continuar...")
        
        # Esperar botón habilitado
        button_ready = await self.wait_for_button_enabled()
        if not button_ready:
            print("[ModalHandler] ⚠ Botón no se habilitó, intentando forzar...")
        
        # Hacer click
        clicked = await self.click_continue()
        
        if clicked:
            print("[ModalHandler] ✓ Modal manejado exitosamente")
            # Esperar a que cargue el dashboard
            await asyncio.sleep(2)
            return True
        else:
            print("[ModalHandler] ✗ No se pudo cerrar el modal")
            return False


async def handle_qualitas_modal(page: Page) -> bool:
    """
    Función de conveniencia para manejar el modal.
    
    Uso:
        from qualitas_modal_handler import handle_qualitas_modal
        
        await handle_qualitas_modal(page)
    """
    handler = QualitasModalHandler(page)
    return await handler.handle_modal()
