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
from reportlab.platypus import (
    Image,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


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
        rightMargin=20 * mm,
        leftMargin=20 * mm,
        topMargin=15 * mm,
        bottomMargin=15 * mm,
    )
    
    elements = []
    styles = getSampleStyleSheet()
    
    # Estilos personalizados
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=16,
        textColor=colors.white,
        alignment=1,  # Center
        spaceAfter=12,
    )
    
    header_style = ParagraphStyle(
        'HeaderStyle',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.HexColor('#1e3a5f'),
        fontName='Helvetica-Bold',
    )
    
    normal_style = styles['Normal']
    normal_style.fontSize = 9
    
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
    
    # Encabezado con fondo azul
    header_data = [[
        Image(str(logo_path), width=80, height=40) if logo_path else '',
        Paragraph("Inventario de Refacciones", title_style)
    ]]
    
    header_table = Table(header_data, colWidths=[100, 400])
    header_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#1e3a5f')),
        ('ALIGN', (0, 0), (0, 0), 'CENTER'),
        ('ALIGN', (1, 0), (1, 0), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (0, 0), 10),
        ('RIGHTPADDING', (1, 0), (1, 0), 10),
    ]))
    elements.append(header_table)
    elements.append(Spacer(1, 20))
    
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
            Paragraph(folio, normal_style),
        ],
        [
            Paragraph(f"<b>Vehículo:</b>", header_style),
            Paragraph(vehiculo, normal_style),
            Paragraph(f"<b>Inventario:</b>", header_style),
            Paragraph(folio_ot or '', normal_style),
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
    
    form_table = Table(form_data, colWidths=[70, 200, 70, 160])
    form_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('ALIGN', (2, 0), (2, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('BOX', (1, 0), (1, -1), 1, colors.HexColor('#1e3a5f')),
        ('BOX', (3, 0), (3, -1), 1, colors.HexColor('#1e3a5f')),
    ]))
    elements.append(form_table)
    elements.append(Spacer(1, 15))
    
    # Tabla de piezas
    if piezas:
        # Encabezados de tabla
        table_data = [
            [
                Paragraph("<b>Pieza</b>", header_style),
                Paragraph("<b>Cantidad</b>", header_style),
                Paragraph("<b>Proveedor</b>", header_style),
                Paragraph("<b>Fecha</b>", header_style),
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
                Paragraph(cantidad, normal_style),
                Paragraph(proveedor, normal_style),
                Paragraph(fecha_pieza, normal_style),
            ])
        
        # Crear tabla de piezas
        piezas_table = Table(table_data, colWidths=[200, 60, 180, 60])
        piezas_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e3a5f')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            ('ALIGN', (1, 1), (1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('RIGHTPADDING', (0, 0), (-1, -1), 5),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        elements.append(piezas_table)
    
    # Páginas de fotos
    if fotos:
        fotos_por_pagina = 6  # 3 columnas x 2 filas
        titulos = ["Almacén 2do piso", "Almacén 2do piso", "oficina", "Primer piso"]
        
        for i in range(0, len(fotos), fotos_por_pagina):
            batch_fotos = fotos[i:i + fotos_por_pagina]
            titulo_idx = min(i // fotos_por_pagina, len(titulos) - 1)
            titulo = titulos[titulo_idx]
            
            elements.append(PageBreak())
            
            # Título de página de fotos
            foto_title_style = ParagraphStyle(
                'FotoTitle',
                parent=styles['Heading2'],
                fontSize=14,
                textColor=colors.white,
                alignment=1,
                spaceAfter=20,
            )
            
            titulo_data = [[Paragraph(titulo, foto_title_style)]]
            titulo_table = Table(titulo_data, colWidths=[500])
            titulo_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#1e3a5f')),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING', (0, 0), (-1, -1), 10),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
            ]))
            elements.append(titulo_table)
            elements.append(Spacer(1, 20))
            
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
                    ('TOPPADDING', (0, 0), (-1, -1), 10),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
                ]))
                elements.append(foto_table)
    
    # Construir PDF
    doc.build(elements)
    
    pdf_bytes = buffer.getvalue()
    buffer.close()
    
    return pdf_bytes
