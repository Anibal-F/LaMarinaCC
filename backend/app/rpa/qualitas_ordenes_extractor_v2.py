"""
Extractor de órdenes de Qualitas - Versión 2
Soporta múltiples estructuras de tablas según el estatus.
"""

import asyncio
import re
from datetime import datetime
from typing import List, Dict, Optional, Tuple
from playwright.async_api import Page

from app.rpa.qualitas_ordenes_extractor import click_next_page_ordenes


async def extract_ordenes_from_table(
    page: Page,
    table_id: str,
    status_name: str,
    max_pages: int = 100
) -> List[Dict]:
    """
    Extrae órdenes de una tabla específica según el estatus.
    Navega por todas las páginas de la tabla.
    """
    ordenes = []
    page_num = 1
    
    # Detectar qué tipo de estructura tiene esta tabla
    table_structure = await detect_table_structure(page, table_id)
    print(f"  [ExtractorV2] Estructura detectada para {status_name}: {table_structure}")
    
    max_retries = 3
    
    while page_num <= max_pages:
        print(f"  [ExtractorV2] {status_name} - Página {page_num}")
        
        retry_count = 0
        rows = []
        
        # Intentar obtener filas con reintentos
        while retry_count < max_retries and not rows:
            try:
                rows = await get_table_rows(page, table_id)
                if not rows:
                    retry_count += 1
                    await asyncio.sleep(1)
            except Exception as e:
                print(f"    [Retry {retry_count}] Error obteniendo filas: {e}")
                retry_count += 1
                await asyncio.sleep(1)
        
        if not rows:
            print(f"  [ExtractorV2] No se encontraron filas en página {page_num} después de {max_retries} intentos")
            break
        
        page_ordenes = []
        for i, row in enumerate(rows):
            try:
                cells = await row.locator('td').all()
                if len(cells) < 3:  # Mínimo de columnas
                    continue
                
                # Extraer texto de todas las celdas
                cell_texts = []
                for cell in cells:
                    text = await cell.text_content()
                    cell_texts.append(text.strip() if text else "")
                
                # Debug primera fila
                if i == 0 and page_num == 1:
                    print(f"  [Debug] Primera fila {status_name}: {cell_texts}")
                
                # Parsear según la estructura detectada
                if table_structure == "asignados":
                    orden = parse_row_asignados(cell_texts, status_name)
                elif table_structure == "historico":
                    orden = parse_row_historico(cell_texts, status_name)
                else:
                    # Estructura genérica para Tránsito, Piso, Terminadas, Entregadas
                    orden = parse_row_generico(cell_texts, status_name)
                
                if orden and orden.get('num_expediente'):
                    page_ordenes.append(orden)
                    if i < 3 and page_num == 1:
                        print(f"  [Orden {i+1}] {orden['num_expediente'][:20]}...")
                    
            except Exception as e:
                print(f"  [Error fila {i}]: {e}")
                continue
        
        if page_ordenes:
            ordenes.extend(page_ordenes)
            print(f"    ✓ {len(page_ordenes)} órdenes en página {page_num}")
        else:
            print(f"    ⚠ No se encontraron órdenes en página {page_num}")
        
        # Intentar ir a la siguiente página
        try:
            has_next = await click_next_page_ordenes(page, table_id)
            if not has_next:
                print(f"  [ExtractorV2] {status_name} - No hay más páginas")
                break
        except Exception as e:
            print(f"  [ExtractorV2] {status_name} - Error en paginación: {e}")
            break
        
        page_num += 1
    
    print(f"  [ExtractorV2] {status_name} - Total: {len(ordenes)} órdenes en {page_num} páginas")
    return ordenes


async def detect_table_structure(page: Page, table_id: str) -> str:
    """
    Detecta la estructura de la tabla analizando los encabezados.
    """
    try:
        # Intentar obtener encabezados
        headers = await page.locator(f'#{table_id} thead th, #{table_id} th').all()
        
        if not headers:
            # Si no hay thead, intentar con la primera fila
            first_row = await page.locator(f'#{table_id} tbody tr:first-child td').all()
            if len(first_row) >= 9:
                return "asignados"
            elif len(first_row) >= 6:
                return "generico"
            return "generico"
        
        header_texts = []
        for h in headers:
            text = await h.text_content()
            header_texts.append(text.strip().lower() if text else "")
        
        header_str = " ".join(header_texts)
        
        # Detectar por palabras clave en encabezados
        if "riesgo" in header_str or "asignación" in header_str:
            return "asignados"
        elif "año" in header_str and "placas" in header_str:
            return "asignados"
        elif "vin" in header_str or "serie" in header_str:
            return "generico"
        else:
            return "generico"
            
    except Exception as e:
        print(f"  [DetectStructure] Error: {e}")
        return "generico"


async def get_table_rows(page: Page, table_id: str) -> List:
    """Obtiene las filas de una tabla."""
    selectors = [
        f'#{table_id} tbody tr',
        f'table#{table_id} tbody tr',
    ]
    
    for selector in selectors:
        try:
            rows = await page.locator(selector).all()
            if rows:
                print(f"  [Debug] Tabla {table_id}: {len(rows)} filas")
                return rows
        except:
            continue
    
    return []


def parse_row_asignados(cell_texts: List[str], status_name: str) -> Optional[Dict]:
    """
    Parsea una fila de la tabla Asignados.
    Estructura: [ID, #Exp, Asignación, Póliza, Siniestro/Reporte, Riesgo, Vehículo, Año, Placas, Estatus, ...]
    """
    if len(cell_texts) < 9:
        return None
    
    id_interno = cell_texts[0]
    num_exp = cell_texts[1]
    fecha_asig = cell_texts[2]
    poliza = cell_texts[3]
    siniestro_reporte = cell_texts[4]
    riesgo = cell_texts[5]
    vehiculo = cell_texts[6]
    anio = cell_texts[7]
    placas = cell_texts[8]
    estatus = cell_texts[9] if len(cell_texts) > 9 else status_name
    
    # Parsear siniestro y reporte
    siniestro, reporte = parse_siniestro_reporte(siniestro_reporte)
    
    # Parsear año
    anio_int = parse_anio(anio)
    
    return {
        'num_expediente': num_exp.strip(),
        'fecha_asignacion': parse_fecha(fecha_asig),
        'poliza': poliza.strip(),
        'siniestro': siniestro,
        'reporte': reporte,
        'riesgo': riesgo.strip(),
        'vehiculo': vehiculo.strip(),
        'anio': anio_int,
        'placas': placas.strip().upper(),
        'estatus': estatus.strip() or status_name
    }


def parse_row_generico(cell_texts: List[str], status_name: str) -> Optional[Dict]:
    """
    Parsea una fila de tablas genéricas (Tránsito, Piso, Terminadas, Entregadas).
    Estructura típica: [Expediente, Fecha/Hora, Siniestro/Reporte, Contacto, Vehículo, Placas, VIN, ...]
    """
    if len(cell_texts) < 5:
        return None
    
    # Intentar detectar el formato exacto
    num_exp = cell_texts[0]
    fecha_raw = cell_texts[1]
    
    # El siniestro/reporte suele estar en la posición 2
    siniestro_reporte = cell_texts[2] if len(cell_texts) > 2 else ""
    
    # Buscar vehículo y placas en las celdas restantes
    vehiculo = ""
    placas = ""
    riesgo = ""
    
    for i, text in enumerate(cell_texts[3:], start=3):
        text_upper = text.upper()
        # Detectar placas (formato típico: 3 letras + 3-4 números)
        if re.match(r'^[A-Z]{3}\d{3,4}$', text_upper.replace('-', '').replace(' ', '')):
            placas = text_upper
        # Detectar VIN (17 caracteres alfanuméricos)
        elif re.match(r'^[A-HJ-NPR-Z0-9]{17}$', text_upper.replace(' ', '')):
            pass  # VIN, no lo usamos por ahora
        # Detectar riesgo
        elif any(r in text for r in ['Tercero', 'Asegurado']):
            riesgo = text
        # El resto podría ser vehículo
        elif len(text) > 5 and not vehiculo:
            vehiculo = text
    
    # Si no encontramos vehículo en el análisis, tomar la celda más larga
    if not vehiculo:
        for text in cell_texts[3:]:
            if len(text) > len(vehiculo) and len(text) < 200:
                vehiculo = text
    
    # Parsear siniestro y reporte
    siniestro, reporte = parse_siniestro_reporte(siniestro_reporte)
    
    # Parsear fecha (puede ser fecha/hora combinada)
    fecha_asig = parse_fecha_generica(fecha_raw)
    
    return {
        'num_expediente': num_exp.strip()[:50],
        'fecha_asignacion': fecha_asig,
        'poliza': '',
        'siniestro': siniestro,
        'reporte': reporte,
        'riesgo': riesgo or 'Desconocido',
        'vehiculo': vehiculo[:200] if vehiculo else 'No especificado',
        'anio': None,
        'placas': placas,
        'estatus': status_name
    }


def parse_row_historico(cell_texts: List[str], status_name: str) -> Optional[Dict]:
    """
    Parsea una fila de la tabla Histórico.
    Estructura similar a Asignados pero puede variar.
    """
    # Por ahora usar el parser genérico
    return parse_row_generico(cell_texts, status_name)


def parse_siniestro_reporte(siniestro_reporte: str) -> Tuple[str, str]:
    """Parsea el campo siniestro/reporte."""
    siniestro = ""
    reporte = ""
    
    if not siniestro_reporte:
        return siniestro, reporte
    
    sr_text = siniestro_reporte.strip()
    
    if "S:" in sr_text:
        s_parts = sr_text.split("S:")
        if len(s_parts) > 1:
            s_val = s_parts[1]
            if "R:" in s_val:
                siniestro = s_val.split("R:")[0].strip()
                reporte = s_val.split("R:")[1].strip()
            else:
                siniestro = s_val.strip()
    
    if "R:" in sr_text and not reporte:
        r_parts = sr_text.split("R:")
        if len(r_parts) > 1:
            reporte = r_parts[1].strip()
    
    return siniestro, reporte


def parse_anio(anio_str: str) -> Optional[int]:
    """Parsea el año de un string."""
    try:
        anio_clean = anio_str.strip().replace(',', '')
        return int(anio_clean) if anio_clean.isdigit() else None
    except:
        return None


def parse_fecha(fecha_str: str) -> Optional[str]:
    """Parsea fecha en formato Qualitas a ISO."""
    if not fecha_str:
        return None
    
    # Formatos comunes: "27-feb, 12:51" o "2026-02-27 12:51:06"
    meses_es = {
        'ene': 1, 'feb': 2, 'mar': 3, 'abr': 4, 'may': 5, 'jun': 6,
        'jul': 7, 'ago': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dic': 12
    }
    
    try:
        fecha_str = fecha_str.strip().lower()
        
        # Formato: "27-feb, 12:51"
        if '-' in fecha_str and ',' in fecha_str:
            partes = fecha_str.split(',')
            fecha_part = partes[0].strip()
            hora_part = partes[1].strip() if len(partes) > 1 else "00:00"
            
            dia_mes = fecha_part.split('-')
            dia = int(dia_mes[0])
            mes = meses_es.get(dia_mes[1], 1)
            
            hora_min = hora_part.split(':')
            hora = int(hora_min[0])
            minuto = int(hora_min[1]) if len(hora_min) > 1 else 0
            
            dt = datetime(2026, mes, dia, hora, minuto)
            return dt.isoformat()
        
        # Formato ISO
        dt = datetime.fromisoformat(fecha_str.replace('Z', '+00:00'))
        return dt.isoformat()
        
    except:
        return None


def parse_fecha_generica(fecha_str: str) -> Optional[str]:
    """Parsea fechas en varios formatos."""
    if not fecha_str:
        return None
    
    # Intentar formato ISO primero
    try:
        dt = datetime.fromisoformat(fecha_str.replace('Z', '+00:00').replace('T', ' '))
        return dt.isoformat()
    except:
        pass
    
    # Intentar formato con slash
    try:
        # 2025-04-0917:50:11 (sin espacio)
        match = re.match(r'(\d{4})-(\d{2})-(\d{2})(\d{2}):(\d{2}):(\d{2})', fecha_str)
        if match:
            year, month, day, hour, minute, second = map(int, match.groups())
            dt = datetime(year, month, day, hour, minute, second)
            return dt.isoformat()
    except:
        pass
    
    # Intentar formato con espacio
    return parse_fecha(fecha_str)
