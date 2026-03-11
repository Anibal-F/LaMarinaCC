#!/bin/bash
# Script para ejecutar la adjudicación con logs detallados en tiempo real
# Uso: ./ejecutar_adjudicacion_debug.sh [archivo_json]

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  RPA ADJUDICACIÓN - MODO DEBUG/LOGS      ${NC}"
echo -e "${BLUE}============================================${NC}"

# Verificar que estamos en el directorio correcto
if [ ! -f "app/rpa/qualitas_adjudicacion_runner.py" ]; then
    echo -e "${RED}Error: No se encuentra el runner. Ejecuta desde /app en el contenedor.${NC}"
    exit 1
fi

# Archivo JSON de datos
if [ -z "$1" ]; then
    # Crear archivo de ejemplo si no se proporciona
    echo -e "${YELLOW}No se proporcionó archivo JSON, creando ejemplo...${NC}"
    
    cat > /tmp/test_adjudicacion.json << 'EOF'
{
  "num_reporte": "04260407947",
  "nombre": "JOSE LUIS",
  "apellidos": "TRUJILLO VAZQUEZ",
  "celular": "6671234567",
  "marca_qualitas_codigo": "DE",
  "placa": "SINPLA",
  "anio_vehiculo": "2023",
  "estatus_exp_id": "1",
  "ingreso_grua": "0",
  "ubicacion": "Taller Principal",
  "headless": true
}
EOF
    DATOS_FILE="/tmp/test_adjudicacion.json"
else
    DATOS_FILE="$1"
fi

echo -e "${GREEN}Archivo de datos: ${DATOS_FILE}${NC}"
echo -e "${GREEN}Contenido:${NC}"
cat "${DATOS_FILE}" | python3 -m json.tool 2>/dev/null || cat "${DATOS_FILE}"
echo ""

# Verificar credenciales
echo -e "${BLUE}--------------------------------------------${NC}"
echo -e "${BLUE}Verificando credenciales...${NC}"
python3 -c "
from app.rpa.credentials_helper import setup_qualitas_env, get_qualitas_credentials
creds = get_qualitas_credentials()
if creds:
    print(f'Usuario: {creds.get(\"usuario\", \"N/A\")}')
    print(f'Taller ID: {creds.get(\"taller_id\", \"N/A\")}')
    print(f'URL: {creds.get(\"plataforma_url\", \"N/A\")}')
else:
    print('No se encontraron credenciales en BD')
"
echo ""

# Ejecutar el runner con unbuffered output
echo -e "${BLUE}--------------------------------------------${NC}"
echo -e "${BLUE}Ejecutando RPA (con logs en tiempo real)...${NC}"
echo -e "${YELLOW}Esto puede tomar 1-2 minutos...${NC}"
echo ""

# Ejecutar con python -u para unbuffered output
python3 -u -m app.rpa.qualitas_adjudicacion_runner \
    "${DATOS_FILE}" \
    --headless \
    --use-db 2>&1 | tee /tmp/rpa_adjudicacion.log

EXIT_CODE=${PIPESTATUS[0]}

echo ""
echo -e "${BLUE}--------------------------------------------${NC}"
echo -e "${BLUE}Resultado:${NC}"

if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✓ ÉXITO - Todas las adjudicaciones completadas${NC}"
elif [ $EXIT_CODE -eq 1 ]; then
    echo -e "${YELLOW}⚠ ALGUNAS FALLARON - Revisa los logs arriba${NC}"
else
    echo -e "${RED}✗ ERROR - Falló el proceso (código $EXIT_CODE)${NC}"
fi

echo ""
echo -e "${BLUE}Log completo guardado en: /tmp/rpa_adjudicacion.log${NC}"

# Mostrar resultado si existe
if [ -f "${DATOS_FILE}.result.json" ]; then
    echo -e "${BLUE}Resultado detallado:${NC}"
    cat "${DATOS_FILE}.result.json" | python3 -m json.tool 2>/dev/null || cat "${DATOS_FILE}.result.json"
fi

exit $EXIT_CODE
