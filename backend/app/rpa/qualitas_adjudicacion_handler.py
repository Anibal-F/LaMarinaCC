"""
Manejador de adjudicación de órdenes de Qualitas.

Este módulo automatiza el proceso de adjudicar órdenes desde la tabla de asignados,
llenando el formulario del modal de adjudicación con los datos del cliente y vehículo.

Uso:
    python3 -m app.rpa.qualitas_adjudicacion_handler
"""

import asyncio
import json
import re
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any

from playwright.async_api import Page, TimeoutError as PlaywrightTimeoutError


@dataclass
class DatosAdjudicacion:
    """Datos necesarios para adjudicar una orden."""
    # Identificación (obligatorios)
    id_expediente: str = ""  # Número de expediente (opcional si se pasa num_reporte)
    wsreportid: str = ""  # ID interno de Qualitas
    nombre: str = ""
    apellidos: str = ""
    celular: str = ""
    marca_qualitas_codigo: str = ""  # Código de 2 letras (ej: KA para KIA)
    placa: str = ""
    
    # Búsqueda alternativa
    num_reporte: str = ""  # Número de reporte/siniestro para buscar (opcional)
    
    # Datos del cliente (opcionales)
    lada: str = "521"  # MX por defecto
    tel_fijo: str = ""
    email_cliente: str = ""
    
    # Datos del vehículo (opcionales)
    marca_taller_id: Optional[str] = None  # ID de marca del taller (solo si es "Otro")
    modelo_id: str = ""  # ID del modelo del vehículo
    anio_vehiculo: str = ""
    color_vehiculo: str = ""  # Valor hex del color
    economico: str = ""
    nro_serie: str = ""
    es_hibrido_electrico: bool = False
    
    # Datos de la orden (opcionales)
    tipo_danio_id: str = "1"  # 1 = Colisión
    estatus_exp_id: str = ""  # 1 = Piso, 2 = Tránsito, 4 = Express
    ingreso_grua: str = "0"  # 0 = No, 1 = Si
    ubicacion: str = ""
    
    # Datos adicionales
    contratante: str = ""
    vehiculo_referencia: str = ""
    
    # Flags del sistema
    registered_f_app: str = "0"
    qr_flag: str = "0"


@dataclass
class ResultadoAdjudicacion:
    """Resultado de una adjudicación."""
    exito: bool
    mensaje: str
    id_expediente: str
    timestamp: datetime = field(default_factory=datetime.now)
    errores: List[str] = field(default_factory=list)


class QualitasAdjudicacionHandler:
    """
    Manejador para adjudicar órdenes en el sistema de Qualitas.
    
    Flujo:
    1. Buscar expediente en la tabla de asignados
    2. Hacer clic en el botón de adjudicar
    3. Llenar el formulario del modal
    4. Guardar la adjudicación
    """
    
    # Selectores del modal de adjudicación
    MODAL_ADJUDICAR = "#adjudicar-orden"
    FORM_ADJUDICAR = "#form_adjudicar_qua"
    BTN_GUARDAR = "#btn-adjudicar-orden"
    BTN_GUARDAR_SUBMIT = "#btn-adjudicar-orden-s"
    
    def __init__(self, page: Page):
        self.page = page
        self.resultados: List[ResultadoAdjudicacion] = []
    
    async def buscar_expediente(self, id_expediente: str = None, num_reporte: str = None) -> bool:
        """
        Busca un expediente en la tabla de asignados usando el campo de búsqueda.
        
        Args:
            id_expediente: Número de expediente a buscar (opcional si se pasa num_reporte)
            num_reporte: Número de reporte a buscar (opcional si se pasa id_expediente)
            
        Returns:
            True si se encontró el expediente
        """
        # Determinar qué campo de búsqueda usar
        if num_reporte:
            print(f"[Adjudicacion] Buscando por número de reporte: {num_reporte}")
            valor_busqueda = str(num_reporte)
            campo_select = 'reporte'  # El valor en el select para buscar por reporte
        elif id_expediente:
            print(f"[Adjudicacion] Buscando por expediente: {id_expediente}")
            valor_busqueda = str(id_expediente)
            campo_select = 'id_expediente'
        else:
            print(f"[Adjudicacion] ✗ Debe proporcionar id_expediente o num_reporte")
            return False
        
        try:
            # Navegar a la página de órdenes asignadas primero
            print(f"[Adjudicacion] Navegando a Bandeja Qualitas...")
            await self.page.goto("https://proordersistem.com.mx/BandejaQualitas", wait_until="networkidle")
            await asyncio.sleep(2)
            
            # Verificar que estamos en la página correcta
            if "BandejaQualitas" not in self.page.url:
                print(f"[Adjudicacion] ✗ No se pudo navegar a BandejaQualitas. URL actual: {self.page.url}")
                return False
            
            print(f"[Adjudicacion] ✓ Página de Bandeja Qualitas cargada")
            
            # Esperar a que cargue la tabla
            await self.page.wait_for_selector('#tableasig', timeout=10000)
            
            # Buscar el campo de búsqueda específico para la tabla de asignados
            input_busqueda = self.page.locator('#busqueda_input_tableasig')
            select_busqueda = self.page.locator('#busqueda_select_tableasig')
            
            # Esperar a que los elementos estén disponibles
            await self.page.wait_for_selector('#busqueda_input_tableasig', timeout=5000)
            await self.page.wait_for_selector('#busqueda_select_tableasig', timeout=5000)
            
            if await input_busqueda.count() == 0:
                print(f"[Adjudicacion] ✗ No se encontró campo de búsqueda (#busqueda_input_tableasig)")
                return False
            
            # Seleccionar el tipo de búsqueda
            print(f"[Adjudicacion] Seleccionando tipo de búsqueda: {campo_select}")
            await select_busqueda.select_option(campo_select)
            await asyncio.sleep(0.5)
            
            # Ingresar el valor de búsqueda
            print(f"[Adjudicacion] Ingresando valor de búsqueda: {valor_busqueda}")
            await input_busqueda.fill(valor_busqueda)
            await asyncio.sleep(0.5)
            
            # Hacer clic en el botón de búsqueda
            btn_buscar = self.page.locator('button[onclick*="busqueda(\'tableasig\')"]')
            if await btn_buscar.count() > 0:
                print(f"[Adjudicacion] Haciendo clic en botón de búsqueda...")
                await btn_buscar.click()
                await asyncio.sleep(2)
            else:
                print(f"[Adjudicacion] ⚠ No se encontró botón de búsqueda, intentando con Enter...")
                await input_busqueda.press('Enter')
                await asyncio.sleep(2)
            
            # Verificar si se encontró el expediente en la tabla
            tabla = self.page.locator('#tableasig tbody tr')
            if await tabla.count() == 0:
                print(f"[Adjudicacion] ✗ No se encontraron resultados para: {valor_busqueda}")
                return False
            
            # Verificar que el valor está en los resultados
            filas = await tabla.all()
            for fila in filas:
                texto = await fila.text_content()
                if valor_busqueda in texto:
                    print(f"[Adjudicacion] ✓ Registro encontrado: {valor_busqueda}")
                    return True
            
            # Si no se encontró exactamente, verificar si hay al menos una fila
            # (puede que el formato en la tabla sea diferente)
            if len(filas) > 0:
                print(f"[Adjudicacion] ✓ Resultados encontrados (filas: {len(filas)})")
                return True
            
            print(f"[Adjudicacion] ✗ Registro no encontrado en resultados: {valor_busqueda}")
            return False
            
        except Exception as e:
            print(f"[Adjudicacion] ✗ Error buscando: {e}")
            import traceback
            print(f"[Adjudicacion] Traceback: {traceback.format_exc()}")
            return False
    
    async def abrir_modal_adjudicacion(self, id_expediente: str) -> bool:
        """
        Abre el modal de adjudicación haciendo clic en el botón de adjudicar.
        
        Args:
            id_expediente: Número de expediente a adjudicar
            
        Returns:
            True si se abrió el modal exitosamente
        """
        print(f"[Adjudicacion] Abriendo modal de adjudicación...")
        
        try:
            # Buscar la fila del expediente
            tabla = self.page.locator('#tableasig')
            filas = await tabla.locator('tbody tr').all()
            
            fila_objetivo = None
            for fila in filas:
                texto = await fila.text_content()
                if str(id_expediente) in texto:
                    fila_objetivo = fila
                    break
            
            if not fila_objetivo:
                print(f"[Adjudicacion] ✗ No se encontró la fila del expediente")
                return False
            
            # Buscar el botón de adjudicar en la fila (ícono de flecha hacia arriba)
            btn_adjudicar = fila_objetivo.locator('a[data-content="Adjudicar"], a[onclick*="adjudicarInvoke"]')
            
            if await btn_adjudicar.count() == 0:
                # Intentar buscar por el ícono
                btn_adjudicar = fila_objetivo.locator('i.fa-arrow-alt-circle-up').locator('..')
            
            if await btn_adjudicar.count() == 0:
                print(f"[Adjudicacion] ✗ No se encontró el botón de adjudicar")
                return False
            
            # Hacer clic en el botón
            await btn_adjudicar.click()
            print(f"[Adjudicacion] Click en botón adjudicar")
            
            # Esperar a que aparezca el modal
            await self.page.wait_for_selector(self.MODAL_ADJUDICAR, state='visible', timeout=10000)
            await asyncio.sleep(1)
            
            print(f"[Adjudicacion] ✓ Modal de adjudicación abierto")
            return True
            
        except Exception as e:
            print(f"[Adjudicacion] ✗ Error abriendo modal: {e}")
            return False
    
    async def llenar_formulario_adjudicacion(self, datos: DatosAdjudicacion) -> bool:
        """
        Llena el formulario del modal de adjudicación.
        
        Args:
            datos: Datos de adjudicación a completar
            
        Returns:
            True si se llenó correctamente
        """
        print(f"[Adjudicacion] Llenando formulario...")
        
        try:
            # Verificar que el modal está visible
            modal = self.page.locator(self.MODAL_ADJUDICAR)
            if await modal.count() == 0 or not await modal.is_visible():
                print(f"[Adjudicacion] ✗ Modal no está visible")
                return False
            
            # Llenar campos ocultos
            await self.page.fill('#wsreporteid', datos.wsreportid)
            await self.page.fill('#registered_f_app', datos.registered_f_app)
            await self.page.fill('#QrFlag', datos.qr_flag)
            
            # Datos del contratante (readonly, pero verificar)
            if datos.contratante:
                await self.page.fill('#contratante', datos.contratante)
            
            # Vehículo de referencia (readonly)
            if datos.vehiculo_referencia:
                await self.page.fill('#vehiculo-cntr', datos.vehiculo_referencia)
            
            # Datos del cliente
            await self.page.fill('#nombre', datos.nombre)
            await self.page.fill('#apellidos', datos.apellidos)
            
            # Lada (dropdown)
            await self.page.select_option('#lada', datos.lada)
            
            # Celular
            await self.page.fill('#celular', datos.celular)
            
            # Teléfono fijo (opcional)
            if datos.tel_fijo:
                await self.page.fill('#tel_fijo', datos.tel_fijo)
            
            # Email (opcional, requiere activar checkbox)
            if datos.email_cliente:
                await self.page.check('#email_cliente_Check')
                await self.page.fill('#email_cliente', datos.email_cliente)
            
            # Código de marca Qualitas (dropdown)
            print(f"[Adjudicacion] Seleccionando marca Qualitas: {datos.marca_qualitas_codigo}")
            await self.page.select_option('#marca_qualitas_adjudicacion', datos.marca_qualitas_codigo)
            await asyncio.sleep(0.5)
            
            # Si es "Otro" (BS), mostrar y llenar marca del taller
            if datos.marca_qualitas_codigo == 'BS' and datos.marca_taller_id:
                print(f"[Adjudicacion] Seleccionando marca del taller: {datos.marca_taller_id}")
                await self.page.select_option('#gos_vehiculo_marca_id_adjudicacion', datos.marca_taller_id)
                await asyncio.sleep(0.5)
            
            # Modelo - Esperar a que cargue y seleccionar
            if datos.modelo_id:
                print(f"[Adjudicacion] Seleccionando modelo: {datos.modelo_id}")
                # Esperar a que el select de modelo tenga opciones
                await self.page.wait_for_function(
                    """() => {
                        const select = document.querySelector('#gos_vehiculo_modelo_id_adjudicacion');
                        return select && select.options.length > 1;
                    }""",
                    timeout=5000
                )
                await self.page.select_option('#gos_vehiculo_modelo_id_adjudicacion', datos.modelo_id)
            
            # Año (readonly, pero verificar)
            if datos.anio_vehiculo:
                current_anio = await self.page.input_value('#anio_vehiculo')
                if not current_anio:
                    await self.page.fill('#anio_vehiculo', datos.anio_vehiculo)
            
            # Color (dropdown)
            if datos.color_vehiculo:
                print(f"[Adjudicacion] Seleccionando color: {datos.color_vehiculo}")
                await self.page.select_option('#color_vehiculo_adjudicacion', datos.color_vehiculo)
            
            # Placa
            await self.page.fill('#placa', datos.placa)
            
            # Económico (opcional)
            if datos.economico:
                await self.page.fill('#economico', datos.economico)
            
            # Número de serie (readonly, pero verificar)
            if datos.nro_serie:
                current_serie = await self.page.input_value('#nro_serie')
                if not current_serie:
                    await self.page.fill('#nro_serie', datos.nro_serie)
            
            # Es híbrido o eléctrico
            if datos.es_hibrido_electrico:
                await self.page.check('#es_hibrido_electrico')
            
            # Tipo de daño (dropdown)
            await self.page.select_option('#gos_os_tipo_danio_id', datos.tipo_danio_id)
            
            # Estatus del expediente (dropdown)
            if datos.estatus_exp_id:
                await self.page.select_option('#gos_os_estado_exp_id', datos.estatus_exp_id)
            
            # Ingreso de grúa (dropdown)
            await self.page.select_option('#IGrua', datos.ingreso_grua)
            
            # Ubicación (opcional)
            if datos.ubicacion:
                await self.page.fill('#ubicacion', datos.ubicacion)
            
            print(f"[Adjudicacion] ✓ Formulario llenado")
            return True
            
        except Exception as e:
            print(f"[Adjudicacion] ✗ Error llenando formulario: {e}")
            import traceback
            print(f"[Adjudicacion] Traceback: {traceback.format_exc()}")
            return False
    
    async def guardar_adjudicacion(self) -> bool:
        """
        Guarda la adjudicación haciendo clic en el botón de guardar.
        
        Returns:
            True si se guardó exitosamente
        """
        print(f"[Adjudicacion] Guardando adjudicación...")
        
        try:
            # Hacer clic en el botón de guardar
            btn_guardar = self.page.locator(self.BTN_GUARDAR)
            await btn_guardar.click()
            
            # Esperar a que el modal se cierre (indica éxito)
            try:
                await self.page.wait_for_selector(self.MODAL_ADJUDICAR, state='hidden', timeout=10000)
                print(f"[Adjudicacion] ✓ Modal cerrado - Adjudicación guardada")
                return True
            except PlaywrightTimeoutError:
                # Verificar si hay errores de validación
                errores = await self.page.locator('.text-danger').all_text_contents()
                errores = [e.strip() for e in errores if e.strip()]
                if errores:
                    print(f"[Adjudicacion] ✗ Errores de validación: {errores}")
                    return False
                
                # Verificar si el modal sigue abierto
                modal = self.page.locator(self.MODAL_ADJUDICAR)
                if await modal.count() > 0 and await modal.is_visible():
                    print(f"[Adjudicacion] ⚠ Modal aún visible, intentando con botón submit...")
                    btn_submit = self.page.locator(self.BTN_GUARDAR_SUBMIT)
                    if await btn_submit.count() > 0:
                        await btn_submit.click(force=True)
                        await asyncio.sleep(2)
                        
                        # Verificar nuevamente
                        if not await modal.is_visible():
                            print(f"[Adjudicacion] ✓ Adjudicación guardada (segundo intento)")
                            return True
                
                print(f"[Adjudicacion] ✗ No se pudo confirmar el guardado")
                return False
                
        except Exception as e:
            print(f"[Adjudicacion] ✗ Error guardando: {e}")
            return False
    
    async def adjudicar_orden(self, datos: DatosAdjudicacion) -> ResultadoAdjudicacion:
        """
        Ejecuta el flujo completo de adjudicación.
        
        Args:
            datos: Datos de adjudicación
            
        Returns:
            Resultado de la operación
        """
        # Determinar qué identificador usar
        identificador = datos.num_reporte if datos.num_reporte else datos.id_expediente
        tipo_busqueda = "reporte" if datos.num_reporte else "expediente"
        
        print(f"\n{'='*60}")
        print(f"ADJUDICANDO ORDEN POR {tipo_busqueda.upper()}: {identificador}")
        print(f"{'='*60}")
        
        errores = []
        
        try:
            # 1. Buscar expediente (por reporte o por expediente)
            encontrado = await self.buscar_expediente(
                id_expediente=datos.id_expediente if not datos.num_reporte else None,
                num_reporte=datos.num_reporte if datos.num_reporte else None
            )
            
            if not encontrado:
                return ResultadoAdjudicacion(
                    exito=False,
                    mensaje=f"No se encontró el registro {identificador}",
                    id_expediente=datos.id_expediente or datos.num_reporte,
                    errores=["Registro no encontrado en tabla de asignados"]
                )
            
            # 2. Abrir modal de adjudicación
            if not await self.abrir_modal_adjudicacion(datos.id_expediente):
                return ResultadoAdjudicacion(
                    exito=False,
                    mensaje=f"No se pudo abrir el modal de adjudicación",
                    id_expediente=datos.id_expediente,
                    errores=["Error al abrir modal"]
                )
            
            # 3. Llenar formulario
            if not await self.llenar_formulario_adjudicacion(datos):
                return ResultadoAdjudicacion(
                    exito=False,
                    mensaje=f"Error al llenar el formulario",
                    id_expediente=datos.id_expediente,
                    errores=["Error llenando formulario"]
                )
            
            # 4. Guardar
            if await self.guardar_adjudicacion():
                return ResultadoAdjudicacion(
                    exito=True,
                    mensaje=f"Orden adjudicada exitosamente",
                    id_expediente=datos.id_expediente
                )
            else:
                return ResultadoAdjudicacion(
                    exito=False,
                    mensaje=f"Error al guardar la adjudicación",
                    id_expediente=datos.id_expediente,
                    errores=["Error guardando en el servidor"]
                )
                
        except Exception as e:
            print(f"[Adjudicacion] ✗ Error inesperado: {e}")
            import traceback
            print(f"[Adjudicacion] Traceback: {traceback.format_exc()}")
            return ResultadoAdjudicacion(
                exito=False,
                mensaje=f"Error inesperado: {str(e)}",
                id_expediente=datos.id_expediente,
                errores=[str(e), traceback.format_exc()]
            )
    
    async def cerrar_modal_si_existe(self):
        """Cierra el modal de adjudicación si está abierto."""
        try:
            modal = self.page.locator(self.MODAL_ADJUDICAR)
            if await modal.count() > 0 and await modal.is_visible():
                btn_cerrar = self.page.locator(f'{self.MODAL_ADJUDICAR} button[data-dismiss="modal"]')
                if await btn_cerrar.count() > 0:
                    await btn_cerrar.click()
                    await asyncio.sleep(0.5)
        except:
            pass


# Mapeo de marcas a códigos Qualitas
MAPA_MARCAS_QUALITAS = {
    'ACURA': 'AC',
    'AUDI': 'AI',
    'BMW': 'BW',
    'BUICK': 'BK',
    'CADILLAC': 'CC',
    'CAMIONETA CHEVROLET': 'PR',
    'CAMIONETA CHRYSLER': 'PC',
    'CAMIONETA FORD': 'PF',
    'CAMIONETA GENERAL MOTORS': 'PG',
    'CAMIONETA VOLKSWAGEN': 'PV',
    'CHEVROLET': 'CT',
    'CHRYSLER': 'CR',
    'CUPRA': 'CU',
    'DODGE': 'DE',
    'FIAT': 'FT',
    'FORD': 'FD',
    'GM': 'GS',
    'HONDA': 'HA',
    'HYUNDAI': 'HI',
    'INFINITI': 'II',
    'JAC': 'JC',
    'JAGUAR': 'JR',
    'JEEP': 'JP',
    'KIA': 'KA',
    'LAMBORGHINI': 'LA',
    'LAND ROVER': 'LR',
    'LEXUS': 'LX',
    'MAZDA': 'MA',
    'MERCEDES BENZ': 'MZ',
    'MITSUBISHI': 'MI',
    'NISSAN': 'NN',
    'PEUGEOT': 'PT',
    'PORSCHE': 'PE',
    'RENAULT': 'RT',
    'SEAT': 'ST',
    'SMART': 'SM',
    'SUBARU': 'SU',
    'SUZUKI': 'SI',
    'TESLA': 'TE',
    'TOYOTA': 'TY',
    'VOLKSWAGEN': 'VW',
    'VOLVO': 'VO',
    'BYD': 'BD',
    'CHANGAN': 'CN',
    'GEELY': 'GY',
    'GWM': 'GW',
    'MASERATI': 'MT',
    'MG': 'MG',
    'OMODA': 'OM',
    'JETOUR': 'JT',
    'DFSK': 'DK',
    'OTRO': 'BS',
}


def obtener_codigo_marca_qualitas(nombre_marca: str) -> str:
    """
    Obtiene el código de marca Qualitas a partir del nombre.
    
    Args:
        nombre_marca: Nombre de la marca
        
    Returns:
        Código de 2 letras para Qualitas
    """
    nombre_upper = nombre_marca.upper().strip()
    
    # Buscar coincidencia exacta
    if nombre_upper in MAPA_MARCAS_QUALITAS:
        return MAPA_MARCAS_QUALITAS[nombre_upper]
    
    # Buscar coincidencia parcial
    for marca, codigo in MAPA_MARCAS_QUALITAS.items():
        if marca in nombre_upper or nombre_upper in marca:
            return codigo
    
    # Por defecto, retornar "Otro"
    return 'BS'


# Función de conveniencia para usar desde otros módulos
async def adjudicar_orden_qualitas(page: Page, datos: DatosAdjudicacion) -> ResultadoAdjudicacion:
    """
    Adjudica una orden en Qualitas.
    
    Args:
        page: Página de Playwright
        datos: Datos de adjudicación
        
    Returns:
        Resultado de la operación
    """
    handler = QualitasAdjudicacionHandler(page)
    return await handler.adjudicar_orden(datos)


# Ejemplo de uso
async def ejemplo():
    """Ejemplo de uso del handler de adjudicación."""
    from playwright.async_api import async_playwright
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context()
        page = await context.new_page()
        
        # Navegar a Qualitas (asumiendo sesión existente)
        await page.goto("https://proordersistem.com.mx/dashboard")
        await asyncio.sleep(2)
        
        # Crear datos de ejemplo
        datos = DatosAdjudicacion(
            id_expediente="9070883",
            wsreportid="578576",
            nombre="JUAN CARLOS",
            apellidos="PEREZ GARCIA",
            celular="6671234567",
            marca_qualitas_codigo="KA",  # KIA
            modelo_id="12345",  # ID del modelo
            anio_vehiculo="2018",
            color_vehiculo="000000",  # Negro
            placa="FRU580A",
            nro_serie="3KPA24AC4JE031274",
            estatus_exp_id="1",  # Piso
            ingreso_grua="0",  # No
            ubicacion="Taller Principal"
        )
        
        # Ejecutar adjudicación
        handler = QualitasAdjudicacionHandler(page)
        resultado = await handler.adjudicar_orden(datos)
        
        print(f"\nResultado:")
        print(f"  Éxito: {resultado.exito}")
        print(f"  Mensaje: {resultado.mensaje}")
        print(f"  Errores: {resultado.errores}")
        
        await browser.close()


if __name__ == "__main__":
    asyncio.run(ejemplo())
