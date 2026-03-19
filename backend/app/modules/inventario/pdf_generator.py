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
    """Dibuja el header con formas geométricas azules y logo."""
    width, height = letter
    
    # Fondo blanco
    canvas.setFillColorRGB(1, 1, 1)
    canvas.rect(0, height - 140, width, 140, fill=1, stroke=0)
    
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
    
    # Forma azul oscuro principal (parte superior) - DIBUJAR PRIMERO
    canvas.setFillColorRGB(0.118, 0.227, 0.373)
    canvas.rect(0, height - 70, width, 70, fill=1, stroke=0)
    
    # Logo DENTRO del banner azul oscuro (parte superior izquierda)
    if logo_to_use:
        try:
            # Logo más grande posicionado en el área azul oscuro del header
            canvas.drawImage(str(logo_to_use), 25, height - 68, width=600, height=180, preserveAspectRatio=True, mask='auto')
        except Exception as e:
            print(f"Error drawing logo: {e}")
    
    # Forma azul claro (triángulo/polígono en esquina superior derecha)
    canvas.setFillColorRGB(0.6, 0.75, 0.85)
    path = canvas.beginPath()
    path.moveTo(width - 220, height)
    path.lineTo(width, height)
    path.lineTo(width, height - 70)
    path.lineTo(width - 170, height - 70)
    path.close()
    canvas.drawPath(path, fill=1, stroke=0)
    
    # Segunda forma azul más clara
    canvas.setFillColorRGB(0.75, 0.85, 0.92)
    path2 = canvas.beginPath()
    path2.moveTo(width - 140, height)
    path2.lineTo(width, height)
    path2.lineTo(width, height - 45)
    path2.close()
    canvas.drawPath(path2, fill=1, stroke=0)
    
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
    
    # El logo se busca internamente en _draw_header
    
    # Crear lista para todos los elementos
    all_elements = []
    
    # ===== PÁGINA 1: DATOS Y TABLA DE PIEZAS =====
    doc1 = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=20 * mm,
        leftMargin=20 * mm,
        topMargin=50 * mm,  # Más espacio para el header con logo más grande
        bottomMargin=25 * mm,
    )
    
    # Función para header/footer
    def draw_header_footer(canvas, doc):
        _draw_header(canvas, doc)
        _draw_footer(canvas, doc)
    
    frame1 = Frame(doc1.leftMargin, doc1.bottomMargin, doc1.width, doc1.height, id='normal')
    template1 = PageTemplate(id='page1', frames=frame1, onPage=draw_header_footer)
    doc1.addPageTemplates([template1])
    
    styles = getSampleStyleSheet()
    
    # Estilos - Todo alineado a la izquierda
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
    
    # ===== SECCIÓN DE DATOS - TODO ALINEADO A LA IZQUIERDA =====
    # Usar una sola tabla con todas las filas para mantener alineación
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
    
    # Tabla maestra con todas las filas alineadas
    # Anchos: Label1 (100), Valor1 (200), Espacio (20), Label2 (80), Valor2 (120)
    tabla_maestra = Table(datos_completos, colWidths=[100, 200, 20, 80, 120])
    tabla_maestra.setStyle(TableStyle([
        # Alineación vertical
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        # Padding
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        # Bordes para los campos de valores (columnas 1 y 4)
        ('BOX', (1, 0), (1, 0), 1, colors.HexColor('#1e3a5f')),
        ('BOX', (4, 0), (4, 0), 1, colors.HexColor('#1e3a5f')),
        ('BOX', (1, 1), (1, 1), 1, colors.HexColor('#1e3a5f')),
        ('BOX', (4, 1), (4, 1), 1, colors.HexColor('#1e3a5f')),
        ('BOX', (1, 2), (1, 2), 1, colors.HexColor('#1e3a5f')),
        ('BOX', (4, 2), (4, 2), 1, colors.HexColor('#1e3a5f')),
        # Borde para Laminero (que abarca desde columna 1 hasta 4)
        ('BOX', (1, 3), (4, 3), 1, colors.HexColor('#1e3a5f')),
        # Combinar celdas vacías para Laminero
        ('SPAN', (2, 3), (4, 3)),
    ]))
    all_elements.append(tabla_maestra)
    all_elements.append(Spacer(1, 25))
    
    # ===== TABLA DE PIEZAS =====
    if piezas:
        table_data = [
            [
                Paragraph("<b>Pieza</b>", table_header_style),
                Paragraph("<b>Cantidad</b>", table_header_style),
                Paragraph("<b>Proveedor</b>", table_header_style),
                Paragraph("<b>Fecha</b>", table_header_style),
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
        from pypdf import PdfReader, PdfWriter
        
        buffer.seek(0)
        pdf_reader = PdfReader(buffer)
        pdf_writer = PdfWriter()
        
        for page in pdf_reader.pages:
            pdf_writer.add_page(page)
        
        fotos_por_pagina = 6
        titulos = ["Almacén 2do piso", "Almacén 2do piso", "oficina", "Primer piso"]
        
        for i in range(0, len(fotos), fotos_por_pagina):
            batch_fotos = fotos[i:i + fotos_por_pagina]
            titulo_idx = min(i // fotos_por_pagina, len(titulos) - 1)
            titulo = titulos[titulo_idx]
            
            foto_buffer = io.BytesIO()
            foto_canvas = canvas.Canvas(foto_buffer, pagesize=letter)
            width, height = letter
            
            _draw_header(foto_canvas, None)
            
            foto_canvas.setFillColorRGB(0.118, 0.227, 0.373)
            foto_canvas.rect(0, height - 110, width, 40, fill=1, stroke=0)
            foto_canvas.setFillColorRGB(1, 1, 1)
            foto_canvas.setFont(font_name_bold, 16)
            foto_canvas.drawCentredString(width / 2, height - 95, titulo)
            
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
                y = height - 150 - (row + 1) * (foto_height + spacing) + spacing
                
                foto_path_str = foto.get('file_path', '')
                if foto_path_str:
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
            
            _draw_footer(foto_canvas, None)
            
            foto_canvas.save()
            foto_buffer.seek(0)
            
            foto_pdf = PdfReader(foto_buffer)
            for page in foto_pdf.pages:
                pdf_writer.add_page(page)
        
        final_buffer = io.BytesIO()
        pdf_writer.write(final_buffer)
        final_buffer.seek(0)
        pdf_bytes = final_buffer.getvalue()
    else:
        buffer.seek(0)
        pdf_bytes = buffer.getvalue()
    
    buffer.close()
    return pdf_bytes
