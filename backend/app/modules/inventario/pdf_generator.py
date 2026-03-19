"""
Generador de PDF para Inventario de Refacciones de Paquetes
Replicando el formato de La Marina Collision Center
"""
import io
import os
from datetime import datetime
from pathlib import Path

from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    Image,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
    Frame,
    PageTemplate,
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT


def _register_fonts():
    """Registra las fuentes necesarias."""
    try:
        pdfmetrics.registerFont(TTFont('CenturyGothic', 'GOTHIC.TTF'))
        pdfmetrics.registerFont(TTFont('CenturyGothic-Bold', 'GOTHICB.TTF'))
        return 'CenturyGothic', 'CenturyGothic-Bold'
    except:
        try:
            pdfmetrics.registerFont(TTFont('CenturyGothic', '/usr/share/fonts/truetype/msttcorefonts/Century_Gothic.ttf'))
            pdfmetrics.registerFont(TTFont('CenturyGothic-Bold', '/usr/share/fonts/truetype/msttcorefonts/Century_Gothic_Bold.ttf'))
            return 'CenturyGothic', 'CenturyGothic-Bold'
        except:
            return 'Helvetica', 'Helvetica-Bold'


def _draw_header(canvas, doc, logo_path=None):
    """Dibuja el header con formas geométricas azules y logo SOBREPUESTO."""
    width, height = letter
    
    # Fondo blanco (más alto para dar espacio al logo sobrepuesto)
    canvas.setFillColorRGB(1, 1, 1)
    canvas.rect(0, height - 180, width, 180, fill=1, stroke=0)
    
    # Buscar logo en múltiples rutas posibles
    possible_logo_paths = [
        Path(__file__).resolve().parent.parent.parent / "static" / "logo.png",
        Path(__file__).resolve().parent.parent.parent.parent.parent / "static" / "static" / "LaMarinaCCLogoT.png",
        Path("/app/static/logo.png"),
    ]
    
    logo_to_use = None
    for path in possible_logo_paths:
        if path.exists():
            logo_to_use = path
            break
    
    # DIBUJAR TODAS LAS FORMAS AZULES PRIMERO (quedarán detrás)
    # Forma azul oscuro principal (parte superior)
    canvas.setFillColorRGB(0.118, 0.227, 0.373)
    canvas.rect(0, height - 70, width, 70, fill=1, stroke=0)
    
    # Forma azul claro (triángulo/polígono en esquina superior IZQUIERDA)
    canvas.setFillColorRGB(0.6, 0.75, 0.85)
    path = canvas.beginPath()
    path.moveTo(0, height)
    path.lineTo(180, height)
    path.lineTo(130, height - 70)
    path.lineTo(0, height - 70)
    path.close()
    canvas.drawPath(path, fill=1, stroke=0)
    
    # Segunda forma azul más clara
    canvas.setFillColorRGB(0.75, 0.85, 0.92)
    path2 = canvas.beginPath()
    path2.moveTo(0, height)
    path2.lineTo(100, height)
    path2.lineTo(0, height - 45)
    path2.close()
    canvas.drawPath(path2, fill=1, stroke=0)
    
    # DIBUJAR LOGO AL FINAL (quedará ENCIMA de todo)
    if logo_to_use:
        try:
            canvas.drawImage(str(logo_to_use), -150, height - 95, width=500, height=120, preserveAspectRatio=True, mask='auto')
        except Exception as e:
            print(f"Error drawing logo: {e}")
    
    canvas.saveState()


def _draw_footer(canvas, doc):
    """Dibuja el footer con formas geométricas azules."""
    width, height = letter
    
    # Forma azul oscuro principal (parte inferior)
    canvas.setFillColorRGB(0.118, 0.227, 0.373)
    canvas.rect(0, 0, width, 55, fill=1, stroke=0)
    
    # Forma azul claro (triángulo/polígono en esquina inferior izquierda)
    canvas.setFillColorRGB(0.6, 0.75, 0.85)
    path = canvas.beginPath()
    path.moveTo(0, 55)
    path.lineTo(160, 55)
    path.lineTo(210, 0)
    path.lineTo(0, 0)
    path.close()
    canvas.drawPath(path, fill=1, stroke=0)
    
    # Segunda forma azul más clara
    canvas.setFillColorRGB(0.75, 0.85, 0.92)
    path2 = canvas.beginPath()
    path2.moveTo(0, 35)
    path2.lineTo(110, 35)
    path2.lineTo(140, 0)
    path2.lineTo(0, 0)
    path2.close()
    canvas.drawPath(path2, fill=1, stroke=0)
    
    canvas.saveState()


def generar_pdf_inventario_paquete(paquete_data: dict, piezas: list, fotos: list) -> bytes:
    """
    Genera un PDF de Inventario de Refacciones con el formato de La Marina.
    """
    buffer = io.BytesIO()
    
    # Registrar fuentes
    font_name, font_name_bold = _register_fonts()
    
    # Crear lista para todos los elementos
    all_elements = []
    
    # ===== PÁGINA 1: DATOS Y TABLA DE PIEZAS =====
    doc1 = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=20 * mm,
        leftMargin=20 * mm,
        topMargin=35 * mm,  # Menos espacio entre banner y contenido
        bottomMargin=25 * mm,
    )
    
    # Función para header/footer
    def draw_header_footer(canvas, doc):
        _draw_header(canvas, doc)
    
    frame1 = Frame(doc1.leftMargin, doc1.bottomMargin, doc1.width, doc1.height, id='normal')
    template1 = PageTemplate(id='page1', frames=frame1, onPage=draw_header_footer)
    doc1.addPageTemplates([template1])
    
    styles = getSampleStyleSheet()
    
    # Estilos
    label_style = ParagraphStyle(
        'LabelStyle',
        fontName=font_name_bold,
        fontSize=11,
        textColor=colors.HexColor('#1e3a5f'),
        alignment=TA_LEFT,
    )
    
    value_style = ParagraphStyle(
        'ValueStyle',
        fontName=font_name,
        fontSize=10,
        textColor=colors.black,
        alignment=TA_LEFT,
    )
    
    table_header_style = ParagraphStyle(
        'TableHeaderStyle',
        fontName=font_name_bold,
        fontSize=10,
        textColor=colors.white,
        alignment=TA_CENTER,
    )
    
    cell_style = ParagraphStyle(
        'CellStyle',
        fontName=font_name,
        fontSize=9,
        textColor=colors.black,
        alignment=TA_LEFT,
    )
    
    center_cell_style = ParagraphStyle(
        'CenterCellStyle',
        fontName=font_name,
        fontSize=9,
        textColor=colors.black,
        alignment=TA_CENTER,
    )
    
    # Datos
    reporte = paquete_data.get('numero_reporte_siniestro', '') or ''
    folio = paquete_data.get('folio', '') or ''
    folio_ot = paquete_data.get('folio_ot', '') or ''
    vehiculo = paquete_data.get('vehiculo', '') or ''
    seguro = paquete_data.get('seguro', '') or ''
    fecha = datetime.now().strftime('%d.%m.%y')
    
    # ===== SECCIÓN DE DATOS =====
    datos_completos = [
        [
            Paragraph("<b>No. Rep/Sin:</b>", label_style),
            Paragraph(reporte, value_style),
            "",
            Paragraph("<b>Folio:</b>", label_style),
            Paragraph(folio_ot or '', value_style),
        ],
        [
            Paragraph("<b>Vehículo:</b>", label_style),
            Paragraph(vehiculo, value_style),
            "",
            Paragraph("<b>Inventario:</b>", label_style),
            Paragraph(folio, value_style),
        ],
        [
            Paragraph("<b>Seguro:</b>", label_style),
            Paragraph(seguro, value_style),
            "",
            Paragraph("<b>Fecha:</b>", label_style),
            Paragraph(fecha, value_style),
        ],
        [
            Paragraph("<b>Laminero:</b>", label_style),
            Paragraph("", value_style),
            "",
            "",
            "",
        ],
    ]
    
    tabla_maestra = Table(datos_completos, colWidths=[100, 200, 20, 80, 120])
    tabla_maestra.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('BOX', (1, 0), (1, 0), 1, colors.HexColor('#1e3a5f')),
        ('BOX', (4, 0), (4, 0), 1, colors.HexColor('#1e3a5f')),
        ('BOX', (1, 1), (1, 1), 1, colors.HexColor('#1e3a5f')),
        ('BOX', (4, 1), (4, 1), 1, colors.HexColor('#1e3a5f')),
        ('BOX', (1, 2), (1, 2), 1, colors.HexColor('#1e3a5f')),
        ('BOX', (4, 2), (4, 2), 1, colors.HexColor('#1e3a5f')),
        ('BOX', (1, 3), (4, 3), 1, colors.HexColor('#1e3a5f')),
        ('SPAN', (1, 3), (4, 3)),
    ]))
    all_elements.append(tabla_maestra)
    all_elements.append(Spacer(1, 25))
    
    # ===== TABLA DE PIEZAS =====
    if piezas:
        # Tabla con: Pieza → Proveedor → Cantidad → Almacén → Foto
        table_data = [
            [
                Paragraph("<b>Pieza</b>", table_header_style),
                Paragraph("<b>Proveedor</b>", table_header_style),
                Paragraph("<b>Cant.</b>", table_header_style),
                Paragraph("<b>Almacén</b>", table_header_style),
                Paragraph("<b>Foto</b>", table_header_style),
            ]
        ]
        
        # Preparar info de fotos por pieza
        fotos_por_pieza = {}
        for foto in fotos:
            pieza_id = foto.get('pieza_asignada_id')
            if pieza_id:
                fotos_por_pieza[pieza_id] = foto
        
        for pieza in piezas:
            nombre = pieza.get('nombre_pieza', '') or ''
            proveedor = pieza.get('proveedor_nombre', '') or ''
            cantidad = str(pieza.get('cantidad', 1) or 1)
            almacen = pieza.get('almacen', '') or '-'
            pieza_id = pieza.get('bitacora_pieza_id') or pieza.get('id')
            
            # Verificar si tiene foto asignada
            foto_asignada = fotos_por_pieza.get(pieza_id)
            foto_cell = Paragraph("—", center_cell_style)
            if foto_asignada:
                foto_cell = Paragraph("✓", ParagraphStyle(
                    'FotoCheckStyle',
                    fontName=font_name_bold,
                    fontSize=12,
                    textColor=colors.HexColor('#22c55e'),
                    alignment=TA_CENTER,
                ))
            
            table_data.append([
                Paragraph(nombre, cell_style),
                Paragraph(proveedor, cell_style),
                Paragraph(cantidad, center_cell_style),
                Paragraph(almacen, cell_style),
                foto_cell,
            ])
        
        piezas_table = Table(table_data, colWidths=[220, 160, 50, 80, 60])
        piezas_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e3a5f')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), font_name_bold),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
            ('TOPPADDING', (0, 0), (-1, 0), 10),
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('TEXTCOLOR', (0, 1), (-1, -1), colors.black),
            ('ALIGN', (0, 1), (0, -1), 'LEFT'),    # Pieza: izquierda
            ('ALIGN', (1, 1), (1, -1), 'LEFT'),    # Proveedor: izquierda
            ('ALIGN', (2, 1), (2, -1), 'CENTER'),  # Cantidad: centro
            ('ALIGN', (3, 1), (3, -1), 'CENTER'),  # Almacén: centro
            ('ALIGN', (4, 1), (4, -1), 'CENTER'),  # Foto: centro
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#1e3a5f')),
            ('LINEBELOW', (0, 0), (-1, 0), 2, colors.HexColor('#1e3a5f')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        all_elements.append(piezas_table)
    
    # Construir primera página
    doc1.build(all_elements)
    
    # ===== PÁGINAS DE FOTOS POR ALMACÉN =====
    from pypdf import PdfReader, PdfWriter
    
    buffer.seek(0)
    pdf_reader = PdfReader(buffer)
    pdf_writer = PdfWriter()
    
    for page in pdf_reader.pages:
        pdf_writer.add_page(page)
    
    # Agrupar fotos asignadas por almacén
    fotos_por_almacen = {}
    fotos_globales = []
    
    for foto in fotos:
        pieza_id = foto.get('pieza_asignada_id')
        es_global = foto.get('es_global', False)
        
        if es_global:
            fotos_globales.append(foto)
            continue
            
        if pieza_id and piezas:
            # Buscar el almacén de la pieza
            for pieza in piezas:
                if pieza.get('bitacora_pieza_id') == pieza_id or pieza.get('id') == pieza_id:
                    almacen = pieza.get('almacen', 'Sin almacén') or 'Sin almacén'
                    if almacen not in fotos_por_almacen:
                        fotos_por_almacen[almacen] = []
                    fotos_por_almacen[almacen].append({
                        'foto': foto,
                        'pieza': pieza
                    })
                    break
    
    # Ordenar almacenes (2do Piso primero, luego 1er Piso, luego Oficina)
    orden_almacenes = ['2do Piso', '1er Piso', 'Oficina']
    almacenes_ordenados = sorted(
        fotos_por_almacen.keys(),
        key=lambda x: (orden_almacenes.index(x) if x in orden_almacenes else 999, x)
    )
    
    # Generar página por cada almacén con fotos
    for almacen in almacenes_ordenados:
        items = fotos_por_almacen[almacen]
        if not items:
            continue
            
        foto_buffer = io.BytesIO()
        foto_canvas = canvas.Canvas(foto_buffer, pagesize=letter)
        width, height = letter
        
        _draw_header(foto_canvas, None)
        
        # Título del almacén
        foto_canvas.setFillColorRGB(0.118, 0.227, 0.373)
        foto_canvas.rect(0, height - 110, width, 40, fill=1, stroke=0)
        foto_canvas.setFillColorRGB(1, 1, 1)
        foto_canvas.setFont(font_name_bold, 16)
        foto_canvas.drawCentredString(width / 2, height - 95, f"ALMACÉN: {almacen.upper()}")
        
        # Dibujar fotos con info de la pieza
        fotos_en_pagina = len(items)
        cols = 2
        margin_x = 40
        margin_y = 60
        spacing = 25
        
        foto_width = (width - 2 * margin_x - (cols - 1) * spacing) / cols
        foto_height = 180
        
        for idx, item in enumerate(items):
            row = idx // cols
            col = idx % cols
            
            x = margin_x + col * (foto_width + spacing)
            y = height - 160 - (row + 1) * (foto_height + 40) + spacing
            
            foto = item['foto']
            pieza = item['pieza']
            
            # Dibujar borde de la card
            foto_canvas.setStrokeColorRGB(0.8, 0.8, 0.8)
            foto_canvas.setLineWidth(1)
            foto_canvas.roundRect(x, y, foto_width, foto_height + 35, 5, fill=0, stroke=1)
            
            # Dibujar foto
            foto_path_str = foto.get('file_path', '')
            if foto_path_str:
                if foto_path_str.startswith('/'):
                    full_path = Path(__file__).resolve().parent.parent.parent / foto_path_str.lstrip('/')
                else:
                    full_path = Path(foto_path_str)
                
                if full_path.exists():
                    try:
                        foto_canvas.drawImage(str(full_path), x + 5, y + 40, 
                                            width=foto_width - 10, height=foto_height - 10, 
                                            preserveAspectRatio=True)
                    except:
                        foto_canvas.setFillColorRGB(0.9, 0.9, 0.9)
                        foto_canvas.rect(x + 5, y + 40, foto_width - 10, foto_height - 10, fill=1, stroke=0)
                        foto_canvas.setFillColorRGB(0.5, 0.5, 0.5)
                        foto_canvas.setFont(font_name, 9)
                        foto_canvas.drawCentredString(x + foto_width/2, y + foto_height/2 + 35, "[Foto no disponible]")
            
            # Info de la pieza debajo de la foto
            foto_canvas.setFillColorRGB(0.118, 0.227, 0.373)
            foto_canvas.rect(x, y, foto_width, 35, fill=1, stroke=0)
            foto_canvas.setFillColorRGB(1, 1, 1)
            foto_canvas.setFont(font_name_bold, 9)
            
            nombre_pieza = pieza.get('nombre_pieza', '')[:35]
            cantidad = pieza.get('cantidad', 1)
            foto_canvas.drawString(x + 8, y + 22, nombre_pieza)
            foto_canvas.setFont(font_name, 8)
            foto_canvas.drawString(x + 8, y + 10, f"Cantidad: {cantidad}")
        
        _draw_footer(foto_canvas, None)
        foto_canvas.save()
        foto_buffer.seek(0)
        
        foto_pdf = PdfReader(foto_buffer)
        for page in foto_pdf.pages:
            pdf_writer.add_page(page)
    
    # Escribir PDF final
    final_buffer = io.BytesIO()
    pdf_writer.write(final_buffer)
    final_buffer.seek(0)
    pdf_bytes = final_buffer.getvalue()
    
    buffer.close()
    return pdf_bytes
