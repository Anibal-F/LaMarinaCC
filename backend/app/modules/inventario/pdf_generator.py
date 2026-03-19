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
        # Intentar Century Gothic
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
    canvas.setFillColorRGB(0.118, 0.227, 0.373)  # #1e3a5f
    canvas.rect(0, height - 60, width, 60, fill=1, stroke=0)
    
    # Forma azul claro (triángulo/polígono en esquina superior derecha)
    canvas.setFillColorRGB(0.6, 0.75, 0.85)  # Azul claro
    path = canvas.beginPath()
    path.moveTo(width - 200, height)
    path.lineTo(width, height)
    path.lineTo(width, height - 60)
    path.lineTo(width - 150, height - 60)
    path.close()
    canvas.drawPath(path, fill=1, stroke=0)
    
    # Segunda forma azul más clara (capa adicional)
    canvas.setFillColorRGB(0.75, 0.85, 0.92)  # Azul muy claro
    path2 = canvas.beginPath()
    path2.moveTo(width - 120, height)
    path2.lineTo(width, height)
    path2.lineTo(width, height - 40)
    path2.close()
    canvas.drawPath(path2, fill=1, stroke=0)
    
    # Logo
    if logo_path and logo_path.exists():
        try:
            canvas.drawImage(str(logo_path), 40, height - 105, width=120, height=60, preserveAspectRatio=True)
        except:
            pass
    
    canvas.saveState()


def _draw_footer(canvas, doc):
    """Dibuja el footer con formas geométricas azules."""
    width, height = letter
    
    # Forma azul oscuro principal (parte inferior)
    canvas.setFillColorRGB(0.118, 0.227, 0.373)  # #1e3a5f
    canvas.rect(0, 0, width, 50, fill=1, stroke=0)
    
    # Forma azul claro (triángulo/polígono en esquina inferior izquierda)
    canvas.setFillColorRGB(0.6, 0.75, 0.85)  # Azul claro
    path = canvas.beginPath()
    path.moveTo(0, 50)
    path.lineTo(150, 50)
    path.lineTo(200, 0)
    path.lineTo(0, 0)
    path.close()
    canvas.drawPath(path, fill=1, stroke=0)
    
    # Segunda forma azul más clara
    canvas.setFillColorRGB(0.75, 0.85, 0.92)  # Azul muy claro
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
    
    # Crear documento
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=20 * mm,
        leftMargin=20 * mm,
        topMargin=35 * mm,  # Espacio para el header
        bottomMargin=25 * mm,  # Espacio para el footer
    )
    
    # Buscar logo
    possible_logo_paths = [
        Path(__file__).resolve().parent.parent.parent / "static" / "logo_lamarina.png",
        Path(__file__).resolve().parent.parent.parent.parent.parent / "static" / "LaMarinaCollisionCenter_Logo.jpg",
    ]
    logo_path = None
    for path in possible_logo_paths:
        if path.exists():
            logo_path = path
            break
    
    # Función para dibujar header/footer en cada página
    def draw_header_footer(canvas, doc):
        _draw_header(canvas, doc, logo_path)
        _draw_footer(canvas, doc)
    
    # Crear template de página
    frame = Frame(
        doc.leftMargin, 
        doc.bottomMargin, 
        doc.width, 
        doc.height,
        id='normal'
    )
    template = PageTemplate(
        id='test',
        frames=frame,
        onPage=draw_header_footer
    )
    doc.addPageTemplates([template])
    
    elements = []
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
    # Fila 1: Rep/sin y Folio
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
    elements.append(tabla_row1)
    elements.append(Spacer(1, 8))
    
    # Fila 2: Vehículo e Inventario
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
    elements.append(tabla_row2)
    elements.append(Spacer(1, 8))
    
    # Fila 3: Seguro y Fecha
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
    elements.append(tabla_row3)
    elements.append(Spacer(1, 8))
    
    # Fila 4: Laminero (campo más largo)
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
    elements.append(tabla_row4)
    elements.append(Spacer(1, 20))
    
    # ===== TABLA DE PIEZAS =====
    if piezas:
        # Encabezados
        table_data = [
            [
                Paragraph("<b>pieza</b>", table_header_style),
                Paragraph("<b>cantidad</b>", table_header_style),
                Paragraph("<b>proveedor</b>", table_header_style),
                Paragraph("<b>fecha</b>", table_header_style),
            ]
        ]
        
        # Datos
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
        
        # Crear tabla
        piezas_table = Table(table_data, colWidths=[200, 70, 170, 60])
        piezas_table.setStyle(TableStyle([
            # Encabezado
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e3a5f')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), font_name_bold),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
            ('TOPPADDING', (0, 0), (-1, 0), 10),
            # Celdas
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('TEXTCOLOR', (0, 1), (-1, -1), colors.black),
            ('ALIGN', (0, 1), (0, -1), 'LEFT'),
            ('ALIGN', (1, 1), (1, -1), 'CENTER'),
            ('ALIGN', (2, 1), (2, -1), 'LEFT'),
            ('ALIGN', (3, 1), (3, -1), 'CENTER'),
            # Bordes
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#1e3a5f')),
            ('LINEBELOW', (0, 0), (-1, 0), 2, colors.HexColor('#1e3a5f')),
            # Espaciado
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        elements.append(piezas_table)
    
    # ===== LÍNEA DE FIRMA =====
    elements.append(Spacer(1, 40))
    
    firma_data = [["", ""]]
    firma_table = Table(firma_data, colWidths=[200, 200], rowHeights=[1])
    firma_table.setStyle(TableStyle([
        ('LINEBELOW', (0, 0), (0, 0), 1, colors.black),
        ('ALIGN', (0, 0), (0, 0), 'CENTER'),
    ]))
    elements.append(firma_table)
    
    firma_label = Paragraph("<b>firma</b>", ParagraphStyle(
        'FirmaStyle',
        fontName=font_name_bold,
        fontSize=10,
        textColor=colors.HexColor('#1e3a5f'),
        alignment=TA_CENTER,
    ))
    elements.append(firma_label)
    
    # Construir PDF
    doc.build(elements)
    
    pdf_bytes = buffer.getvalue()
    buffer.close()
    
    return pdf_bytes
