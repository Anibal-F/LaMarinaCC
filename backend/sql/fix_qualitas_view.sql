-- =====================================================
-- FIX: Vista corregida para mostrar todas las órdenes
-- =====================================================

-- Primero, eliminar órdenes con estatus que son placas (datos corruptos)
DELETE FROM qualitas_ordenes_asignadas 
WHERE estatus ~ '^[A-Z]{1,3}[0-9]{1,4}$'  -- Patrón de placas
   OR estatus IN ('SP', 'NA', '');

-- Vista corregida: muestra todas las órdenes de la última extracción
DROP VIEW IF EXISTS v_qualitas_ordenes_recientes;

CREATE OR REPLACE VIEW v_qualitas_ordenes_recientes AS
WITH ultima_extraccion AS (
    SELECT MAX(fecha_extraccion) as max_fecha
    FROM qualitas_ordenes_asignadas
)
SELECT 
    id,
    num_expediente,
    fecha_asignacion,
    poliza,
    siniestro,
    reporte,
    riesgo,
    vehiculo,
    anio,
    placas,
    estatus,
    fecha_extraccion
FROM qualitas_ordenes_asignadas
WHERE fecha_extraccion >= (SELECT max_fecha FROM ultima_extraccion)
ORDER BY fecha_asignacion DESC NULLS LAST;

-- Verificar resultado
SELECT estatus, COUNT(*) as total 
FROM v_qualitas_ordenes_recientes 
GROUP BY estatus 
ORDER BY total DESC;
