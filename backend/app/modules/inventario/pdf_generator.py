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
    """Dibuja el header con formas geométricas azules."""
    width, height = letter
    
    # Fondo blanco
    canvas.setFillColorRGB(1, 1, 1)
    canvas.rect(0, height - 120, width, 120, fill=1, stroke=0)
    
    # Forma azul oscuro principal (parte superior)
    canvas.setFillColorRGB(0.118, 0.227, 0.373)
    canvas.rect(0, height - 60, width, 60, fill=1, stroke=0)
    
    # Forma azul claro (triángulo/polígono en esquina superior derecha)
    canvas.setFillColorRGB(0.6, 0.75, 0.85)
    path = canvas.beginPath()
    path.moveTo(width - 200, height)
    path.lineTo(width, height)
    path.lineTo(width, height - 60)
    path.lineTo(width - 150, height - 60)
    path.close()
    canvas.drawPath(path, fill=1, stroke=0)
    
    # Segunda forma azul más clara
    canvas.setFillColorRGB(0.75, 0.85, 0.92)
    path2 = canvas.beginPath()
    path2.moveTo(width - 120, height)
    path2.lineTo(width, height)
    path2.lineTo(width, height - 40)
    path2.close()
    canvas.drawPath(path2, fill=1, stroke=0)
    
    # Logo
    if logo_path and logo_path.exists():
        try:
            canvas.drawImage(str(logo_path), 40, height - 110, width=120, height=70, preserveAspectRatio=True, mask='auto')
        except Exception as e:
            print(f"Error drawing logo: {e}")
    
    canvas.saveState()


def _draw_footer(canvas, doc):
    """Dibuja el footer con formas geométricas azules."""
    width, height = letter
    
    # Forma azul oscuro principal (parte inferior)
    canvas.setFillColorRGB(0.118, 0.227, 0.373)
    canvas.rect(0, 0, width, 50, fill=1, stroke=0)
    
    # Forma azul claro (triángulo/polígono en esquina inferior izquierda)
    canvas.setFillColorRGB(0.6, 0.75, 0.85)
    path = canvas.beginPath()
    path.moveTo(0, 50)
    path.lineTo(150, 50)
    path.lineTo(200, 0)
    path.lineTo(0, 0)
    path.close()
    canvas.drawPath(path, fill=1, stroke=0)
    
    # Segunda forma azul más clara
    canvas.setFillColorRGB(0.75, 0.85, 0.92)
    path2 = canvas.beginPath()
    path2.moveTo(0, 30)
    path2.lineTo(100, 30)
    path2.lineTo(130, 0)
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
    
    # Buscar logo en la ruta especificada
    logo_path = Path(__file__).resolve().parent.parent.parent.parent.parent / "static" / "static" / "LaMarinaCCLogoT.png"
    
    # Crear lista para todos los elementos
    all_elements = []
    
    # ===== PÁGINA 1: DATOS Y TABLA DE PIEZAS =====
    doc1 = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=20 * mm,
        leftMargin=20 * mm,
        topMargin=35 * mm,
        bottomMargin=25 * mm,
    )
    
    # Función para header/footer
    def draw_header_footer(canvas, doc):
        _draw_header(canvas, doc, logo_path)
        _draw_footer(canvas, doc)
    
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
    datos_row1 = [
        [
            Paragraph("<b>No. Rep/sin:</b>", label_style),
            Paragraph(reporte, value_style),
            Paragraph("<b>Folio:</b>", label_style),
            Paragraph(folio_ot or '', value_style),
        ]
    ]
    
    tabla_row1 = Table(datos_row1, colWidths=[80, 180, 50, 100])
    tabla_row1.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('BOX', (1, 0), (1, 0), 1, colors.HexColor('#1e3a5f')),
        ('BOX', (3, 0), (3, 0), 1, colors.HexColor('#1e3a5f')),
    ]))
    all_elements.append(tabla_row1)
    all_elements.append(Spacer(1, 8))
    
    datos_row2 = [
        [
            Paragraph("<b>Vehículo:</b>", label_style),
            Paragraph(vehiculo, value_style),
            Paragraph("<b>Inventario:</b>", label_style),
            Paragraph(folio, value_style),
        ]
    ]
    
    tabla_row2 = Table(datos_row2, colWidths=[80, 180, 80, 100])
    tabla_row2.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('BOX', (1, 0), (1, 0), 1, colors.HexColor('#1e3a5f')),
        ('BOX', (3, 0), (3, 0), 1, colors.HexColor('#1e3a5f')),
    ]))
    all_elements.append(tabla_row2)
    all_elements.append(Spacer(1, 8))
    
    datos_row3 = [
        [
            Paragraph("<b>Seguro:</b>", label_style),
            Paragraph(seguro, value_style),
            Paragraph("<b>Fecha:</b>", label_style),
            Paragraph(fecha, value_style),
        ]
    ]
    
    tabla_row3 = Table(datos_row3, colWidths=[80, 180, 50, 100])
    tabla_row3.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('BOX', (1, 0), (1, 0), 1, colors.HexColor('#1e3a5f')),
        ('BOX', (3, 0), (3, 0), 1, colors.HexColor('#1e3a5f')),
    ]))
    all_elements.append(tabla_row3)
    all_elements.append(Spacer(1, 8))
    
    datos_row4 = [
        [
            Paragraph("<b>Laminero:</b>", label_style),
            Paragraph("", value_style),
            "",
            "",
        ]
    ]
    
    tabla_row4 = Table(datos_row4, colWidths=[80, 310, 50, 0])
    tabla_row4.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('BOX', (1, 0), (1, 0), 1, colors.HexColor('#1e3a5f')),
        ('SPAN', (1, 0), (3, 0)),
    ]))
    all_elements.append(tabla_row4)
    all_elements.append(Spacer(1, 20))
    
    # ===== TABLA DE PIEZAS =====
    if piezas:
        table_data = [
            [
                Paragraph("<b>pieza</b>", table_header_style),
                Paragraph("<b>cantidad</b>", table_header_style),
                Paragraph("<b>proveedor</b>", table_header_style),
                Paragraph("<b>fecha</b>", table_header_style),
            ]
        ]
        
        for pieza in piezas:
            nombre = pieza.get('nombre_pieza', '') or ''
            cantidad = str(pieza.get('cantidad', 1) or 1)
            proveedor = pieza.get('proveedor_nombre', '') or ''
            fecha_pieza = ""
            
            table_data.append([
                Paragraph(nombre, cell_style),
                Paragraph(cantidad, center_cell_style),
                Paragraph(proveedor, cell_style),
                Paragraph(fecha_pieza, center_cell_style),
            ])
        
        piezas_table = Table(table_data, colWidths=[200, 70, 170, 60])
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
            ('ALIGN', (0, 1), (0, -1), 'LEFT'),
            ('ALIGN', (1, 1), (1, -1), 'CENTER'),
            ('ALIGN', (2, 1), (2, -1), 'LEFT'),
            ('ALIGN', (3, 1), (3, -1), 'CENTER'),
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
    
    # ===== PÁGINAS DE FOTOS =====
    if fotos and len(fotos) > 0:
        # Crear un nuevo buffer para combinar
        from pypdf import PdfReader, PdfWriter
        
        buffer.seek(0)
        pdf_reader = PdfReader(buffer)
        pdf_writer = PdfWriter()
        
        # Agregar primera página
        for page in pdf_reader.pages:
            pdf_writer.add_page(page)
        
        # Generar páginas de fotos
        fotos_por_pagina = 6
        titulos = ["Almacén 2do piso", "Almacén 2do piso", "oficina", "Primer piso"]
        
        for i in range(0, len(fotos), fotos_por_pagina):
            batch_fotos = fotos[i:i + fotos_por_pagina]
            titulo_idx = min(i // fotos_por_pagina, len(titulos) - 1)
            titulo = titulos[titulo_idx]
            
            # Crear página de fotos
            foto_buffer = io.BytesIO()
            foto_canvas = canvas.Canvas(foto_buffer, pagesize=letter)
            width, height = letter
            
            # Header
            _draw_header(foto_canvas, None, logo_path)
            
            # Título
            foto_canvas.setFillColorRGB(0.118, 0.227, 0.373)
            foto_canvas.rect(0, height - 100, width, 40, fill=1, stroke=0)
            foto_canvas.setFillColorRGB(1, 1, 1)
            foto_canvas.setFont(font_name_bold, 16)
            foto_canvas.drawCentredString(width / 2, height - 85, titulo)
            
            # Grid de fotos
            fotos_en_pagina = len(batch_fotos)
            cols = 3
            rows = 2
            margin_x = 40
            margin_y = 80
            spacing = 20
            
            foto_width = (width - 2 * margin_x - (cols - 1) * spacing) / cols
            foto_height = (height - 180 - 2 * margin_y - (rows - 1) * spacing) / rows
            
            for idx, foto in enumerate(batch_fotos):
                row = idx // cols
                col = idx % cols
                
                x = margin_x + col * (foto_width + spacing)
                y = height - 140 - (row + 1) * (foto_height + spacing) + spacing
                
                foto_path_str = foto.get('file_path', '')
                if foto_path_str:
                    # Construir ruta
                    if foto_path_str.startswith('/'):
                        full_path = Path(__file__).resolve().parent.parent.parent / foto_path_str.lstrip('/')
                    else:
                        full_path = Path(foto_path_str)
                    
                    if full_path.exists():
                        try:
                            foto_canvas.drawImage(str(full_path), x, y, width=foto_width, height=foto_height, preserveAspectRatio=True)
                        except:
                            foto_canvas.setStrokeColorRGB(0.5, 0.5, 0.5)
                            foto_canvas.rect(x, y, foto_width, foto_height, fill=0, stroke=1)
                            foto_canvas.setFillColorRGB(0.5, 0.5, 0.5)
                            foto_canvas.setFont(font_name, 10)
                            foto_canvas.drawCentredString(x + foto_width/2, y + foto_height/2, "[Foto no disponible]")
                    else:
                        foto_canvas.setStrokeColorRGB(0.5, 0.5, 0.5)
                        foto_canvas.rect(x, y, foto_width, foto_height, fill=0, stroke=1)
                        foto_canvas.setFillColorRGB(0.5, 0.5, 0.5)
                        foto_canvas.setFont(font_name, 10)
                        foto_canvas.drawCentredString(x + foto_width/2, y + foto_height/2, "[Foto no encontrada]")
            
            # Footer
            _draw_footer(foto_canvas, None)
            
            foto_canvas.save()
            foto_buffer.seek(0)
            
            # Leer página de fotos y agregarla
            foto_pdf = PdfReader(foto_buffer)
            for page in foto_pdf.pages:
                pdf_writer.add_page(page)
        
        # Escribir PDF final
        final_buffer = io.BytesIO()
        pdf_writer.write(final_buffer)
        final_buffer.seek(0)
        pdf_bytes = final_buffer.getvalue()
    else:
        buffer.seek(0)
        pdf_bytes = buffer.getvalue()
    
    buffer.close()
    return pdf_bytes
