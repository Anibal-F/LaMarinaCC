# FIX: Datos Corruptos en Qualitas

## Problema
Los datos de `qualitas_ordenes_asignadas` tienen estatus incorrectos (placas de autos en lugar de estatus reales).

## Solución

### Paso 1: Ejecutar SQL de limpieza
```bash
# Conectarse a la base de datos
psql postgresql://LaMarinaCC:A355Fu584$@lamarinacc-db.c7o8imsw0zss.us-east-1.rds.amazonaws.com:5432/postgres

# Ejecutar el script de limpieza
\i backend/sql/fix_qualitas_complete.sql
```

### Paso 2: Reconstruir backend
```bash
docker-compose -f docker-compose.prod.yml up -d --build backend
```

### Paso 3: Volver a ejecutar RPA
1. Ir al dashboard de Qualitas
2. Click en "Actualizar"
3. Esperar a que termine la extracción

## Verificación
Después de la extracción, deberías ver:
- Total de órdenes correcto (~900+ si sumas todos los tabs)
- Estatus correctos: Asignados, Tránsito, Piso, Terminadas, Entregadas, etc.
- Sin placas en los tabs (ej: VNT113D, VPY340B, etc.)
