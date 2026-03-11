#!/bin/bash
# Script para configurar X11 forwarding en Mac

echo "=========================================="
echo "Configuración X11 para Mac"
echo "=========================================="

# Verificar si XQuartz está instalado
if ! command -v xquartz &> /dev/null; then
    echo "❌ XQuartz no está instalado"
    echo ""
    echo "Para instalar:"
    echo "  1. Descarga desde: https://www.xquartz.org/"
    echo "  2. Instala el .dmg"
    echo "  3. Reinicia tu Mac"
    echo "  4. Ejecuta este script nuevamente"
    exit 1
fi

echo "✓ XQuartz está instalado"

# Verificar si está corriendo
if ! ps aux | grep -v grep | grep X11 > /dev/null; then
    echo "⚠ XQuartz no está corriendo"
    echo "Iniciando XQuartz..."
    open -a XQuartz
    sleep 3
fi

echo "✓ XQuartz está corriendo"

# Configurar X11 forwarding
echo ""
echo "=========================================="
echo "Instrucciones de conexión:"
echo "=========================================="
echo ""
echo "1. Abre una nueva terminal en tu Mac"
echo ""
echo "2. Conecta al servidor con X11 forwarding:"
echo "   ssh -X -i LaMarinaCC.pem ubuntu@<IP_DEL_SERVIDOR>"
echo ""
echo "3. Una vez conectado, ejecuta:"
echo "   cd ~/LaMarinaCC/backend"
echo "   python3 test_adjudicacion_visual_debug.py 04260407947"
echo ""
echo "4. Deberías ver una ventana de Chromium abrirse en tu Mac"
echo ""
echo "=========================================="
echo "Solución de problemas:"
echo "=========================================="
echo ""
echo "Si la ventana no aparece:"
echo "  - Asegúrate de que XQuartz esté abierto"
echo "  - Prueba con: ssh -Y en lugar de -X"
echo "  - Verifica que DISPLAY esté seteado: echo \$DISPLAY"
echo "  - Debería mostrar algo como: localhost:10.0"
echo ""
