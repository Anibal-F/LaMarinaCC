"""
Generador de PDF para Inventario de Refacciones de Paquetes
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
from reportlab.platypus import (
    Image,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


def _register_century_gothic():
    """Registra la fuente Century Gothic si está disponible."""
    try:
        # Intentar registrar Century Gothic desde el sistema
        pdfmetrics.registerFont(TTFont('CenturyGothic', 'GOTHIC.TTF'))
        pdfmetrics.registerFont(TTFont('CenturyGothic-Bold', 'GOTHICB.TTF'))
        return 'CenturyGothic'
    except:
        try:
            # En Linux, buscar en rutas comunes
            pdfmetrics.registerFont(TTFont('CenturyGothic', '/usr/share/fonts/truetype/msttcorefonts/Century_Gothic.ttf'))
            pdfmetrics.registerFont(TTFont('CenturyGothic-Bold', '/usr/share/fonts/truetype/msttcorefonts/Century_Gothic_Bold.ttf'))
            return 'CenturyGothic'
        except:
            # Fallback a fuentes estándar
            return 'Helvetica'


def generar_pdf_inventario_paquete(paquete_data: dict, piezas: list, fotos: list) -> bytes:
    """
    Genera un PDF de Inventario de Refacciones para un paquete.
    
    Args:
        paquete_data: Datos del paquete (folio, reporte, etc.)
        piezas: Lista de piezas del paquete
        fotos: Lista de fotos del paquete
    
    Returns:
        bytes: Contenido del PDF
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=15 * mm,
        leftMargin=15 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
    )
    
    elements = []
    styles = getSampleStyleSheet()
    
    # Registrar fuente Century Gothic
    font_name = _register_century_gothic()
    font_name_bold = f"{font_name}-Bold" if font_name == 'CenturyGothic' else f"{font_name}-Bold"
    
    # Estilos personalizados con Century Gothic
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontName=font_name_bold,
        fontSize=18,
        textColor=colors.white,
        alignment=1,  # Center
        spaceAfter=12,
        spaceBefore=12,
    )
    
    header_style = ParagraphStyle(
        'HeaderStyle',
        parent=styles['Normal'],
        fontName=font_name_bold,
        fontSize=11,
        textColor=colors.HexColor('#1e3a5f'),
    )
    
    normal_style = ParagraphStyle(
        'NormalStyle',
        parent=styles['Normal'],
        fontName=font_name,
        fontSize=10,
        textColor=colors.black,
    )
    
    table_header_style = ParagraphStyle(
        'TableHeaderStyle',
        parent=styles['Normal'],
        fontName=font_name_bold,
        fontSize=10,
        textColor=colors.white,
        alignment=1,  # Center
    )
    
    # Logo y título (buscar en múltiples ubicaciones)
    possible_logo_paths = [
        Path(__file__).resolve().parent.parent.parent / "static" / "logo_lamarina.png",
        Path(__file__).resolve().parent.parent.parent.parent.parent / "static" / "LaMarinaCollisionCenter_Logo.jpg",
    ]
    logo_path = None
    for path in possible_logo_paths:
        if path.exists():
            logo_path = path
            break
    
    # ===== BANNER SUPERIOR =====
    banner_top = Table([['']], colWidths=[500], rowHeights=[30])
    banner_top.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#1e3a5f')),
    ]))
    elements.append(banner_top)
    
    # Encabezado con logo y título
    header_data = [[
        Image(str(logo_path), width=100, height=50) if logo_path else '',
        Paragraph("Inventario de Refacciones", title_style)
    ]]
    
    header_table = Table(header_data, colWidths=[120, 380])
    header_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#2c5282')),
        ('ALIGN', (0, 0), (0, 0), 'CENTER'),
        ('ALIGN', (1, 0), (1, 0), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (0, 0), 15),
        ('RIGHTPADDING', (1, 0), (1, 0), 15),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
    ]))
    elements.append(header_table)
    elements.append(Spacer(1, 25))
    
    # Datos del formulario
    reporte = paquete_data.get('numero_reporte_siniestro', '') or ''
    folio = paquete_data.get('folio', '') or ''
    folio_ot = paquete_data.get('folio_ot', '') or ''
    vehiculo = paquete_data.get('vehiculo', '') or ''
    seguro = paquete_data.get('seguro', '') or ''
    fecha = datetime.now().strftime('%d.%m.%y')
    
    form_data = [
        [
            Paragraph(f"<b>Rep/sin:</b>", header_style),
            Paragraph(reporte, normal_style),
            Paragraph(f"<b>Folio:</b>", header_style),
            Paragraph(folio_ot or '', normal_style),
        ],
        [
            Paragraph(f"<b>Vehículo:</b>", header_style),
            Paragraph(vehiculo, normal_style),
            Paragraph(f"<b>Inventario:</b>", header_style),
            Paragraph(folio, normal_style),
        ],
        [
            Paragraph(f"<b>Seguro:</b>", header_style),
            Paragraph(seguro, normal_style),
            Paragraph(f"<b>Fecha:</b>", header_style),
            Paragraph(fecha, normal_style),
        ],
        [
            Paragraph(f"<b>Laminero:</b>", header_style),
            Paragraph("", normal_style),
            "",
            "",
        ],
    ]
    
    form_table = Table(form_data, colWidths=[80, 200, 80, 140])
    form_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('ALIGN', (2, 0), (2, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('BOX', (1, 0), (1, -1), 1.5, colors.HexColor('#1e3a5f')),
        ('BOX', (3, 0), (3, -1), 1.5, colors.HexColor('#1e3a5f')),
        ('BACKGROUND', (1, 0), (1, -1), colors.HexColor('#f7fafc')),
        ('BACKGROUND', (3, 0), (3, -1), colors.HexColor('#f7fafc')),
    ]))
    elements.append(form_table)
    elements.append(Spacer(1, 25))
    
    # Tabla de piezas con encabezados mejorados
    if piezas:
        # Título de sección
        section_title = Paragraph("<b>Listado de Piezas</b>", ParagraphStyle(
            'SectionTitle',
            fontName=font_name_bold,
            fontSize=14,
            textColor=colors.HexColor('#1e3a5f'),
            spaceAfter=10,
        ))
        elements.append(section_title)
        
        # Encabezados de tabla con títulos claros
        table_data = [
            [
                Paragraph("<b>PIEZA</b>", table_header_style),
                Paragraph("<b>CANT.</b>", table_header_style),
                Paragraph("<b>PROVEEDOR</b>", table_header_style),
                Paragraph("<b>FECHA</b>", table_header_style),
            ]
        ]
        
        # Datos de piezas
        for pieza in piezas:
            nombre = pieza.get('nombre_pieza', '') or ''
            cantidad = str(pieza.get('cantidad', 1) or 1)
            proveedor = pieza.get('proveedor_nombre', '') or ''
            fecha_pieza = ""
            
            table_data.append([
                Paragraph(nombre, normal_style),
                Paragraph(cantidad, ParagraphStyle('Center', parent=normal_style, alignment=1)),
                Paragraph(proveedor, normal_style),
                Paragraph(fecha_pieza, ParagraphStyle('Center', parent=normal_style, alignment=1)),
            ])
        
        # Crear tabla de piezas con estilo mejorado
        piezas_table = Table(table_data, colWidths=[220, 60, 200, 70])
        piezas_table.setStyle(TableStyle([
            # Encabezado
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e3a5f')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), font_name_bold),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('TOPPADDING', (0, 0), (-1, 0), 12),
            # Celdas de datos
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('TEXTCOLOR', (0, 1), (-1, -1), colors.black),
            ('ALIGN', (0, 1), (0, -1), 'LEFT'),
            ('ALIGN', (1, 1), (1, -1), 'CENTER'),
            ('ALIGN', (2, 1), (2, -1), 'LEFT'),
            ('ALIGN', (3, 1), (3, -1), 'CENTER'),
            # Bordes
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e0')),
            ('BOX', (0, 0), (-1, 0), 2, colors.HexColor('#1e3a5f')),
            ('LINEBELOW', (0, 0), (-1, 0), 2, colors.HexColor('#1e3a5f')),
            # Espaciado
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            # Alternar colores de fondo
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f7fafc')]),
        ]))
        elements.append(piezas_table)
    
    # ===== BANNER INFERIOR (primera página) =====
    elements.append(Spacer(1, 30))
    banner_bottom = Table([['']], colWidths=[500], rowHeights=[20])
    banner_bottom.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#1e3a5f')),
    ]))
    elements.append(banner_bottom)
    
    # Páginas de fotos
    if fotos:
        fotos_por_pagina = 6  # 3 columnas x 2 filas
        titulos = ["Almacén 2do piso", "Almacén 2do piso", "oficina", "Primer piso"]
        
        for i in range(0, len(fotos), fotos_por_pagina):
            batch_fotos = fotos[i:i + fotos_por_pagina]
            titulo_idx = min(i // fotos_por_pagina, len(titulos) - 1)
            titulo = titulos[titulo_idx]
            
            elements.append(PageBreak())
            
            # Banner superior en páginas de fotos
            banner_top_foto = Table([['']], colWidths=[500], rowHeights=[20])
            banner_top_foto.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#1e3a5f')),
            ]))
            elements.append(banner_top_foto)
            elements.append(Spacer(1, 10))
            
            # Título de página de fotos
            foto_title_style = ParagraphStyle(
                'FotoTitle',
                fontName=font_name_bold,
                fontSize=16,
                textColor=colors.white,
                alignment=1,
                spaceAfter=15,
            )
            
            titulo_data = [[Paragraph(titulo, foto_title_style)]]
            titulo_table = Table(titulo_data, colWidths=[500])
            titulo_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#2c5282')),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING', (0, 0), (-1, -1), 12),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
            ]))
            elements.append(titulo_table)
            elements.append(Spacer(1, 25))
            
            # Grid de fotos
            foto_table_data = []
            fila = []
            
            for idx, foto in enumerate(batch_fotos):
                foto_path = foto.get('file_path', '')
                img_cell = ""
                
                if foto_path:
                    # Construir ruta absoluta
                    if foto_path.startswith('/'):
                        full_path = Path(__file__).resolve().parent.parent.parent / foto_path.lstrip('/')
                    else:
                        full_path = Path(foto_path)
                    
                    # También buscar en directorio de paquetes
                    if not full_path.exists() and foto_path.startswith('/media/paquetes_piezas/'):
                        alt_path = Path(__file__).resolve().parent.parent.parent / foto_path.lstrip('/')
                        if alt_path.exists():
                            full_path = alt_path
                    
                    if full_path.exists():
                        try:
                            img = Image(str(full_path), width=150, height=100)
                            img.hAlign = 'CENTER'
                            img_cell = img
                        except Exception:
                            img_cell = Paragraph("[Foto no disponible]", normal_style)
                    else:
                        img_cell = Paragraph("[Foto no encontrada]", normal_style)
                
                fila.append(img_cell)
                
                # Cada 3 fotos creamos una nueva fila
                if (idx + 1) % 3 == 0:
                    foto_table_data.append(fila)
                    fila = []
            
            # Agregar fila restante si hay fotos pendientes
            if fila:
                while len(fila) < 3:
                    fila.append("")
                foto_table_data.append(fila)
            
            # Crear tabla de fotos
            if foto_table_data:
                foto_table = Table(foto_table_data, colWidths=[166, 166, 166])
                foto_table.setStyle(TableStyle([
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('TOPPADDING', (0, 0), (-1, -1), 15),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 15),
                    ('LEFTPADDING', (0, 0), (-1, -1), 10),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 10),
                ]))
                elements.append(foto_table)
            
            # Banner inferior en páginas de fotos
            elements.append(Spacer(1, 20))
            banner_bottom_foto = Table([['']], colWidths=[500], rowHeights=[20])
            banner_bottom_foto.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#1e3a5f')),
            ]))
            elements.append(banner_bottom_foto)
    
    # Construir PDF
    doc.build(elements)
    
    pdf_bytes = buffer.getvalue()
    buffer.close()
    
    return pdf_bytes
