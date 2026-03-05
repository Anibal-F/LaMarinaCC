-- =====================================================
-- FIX COMPLETO: Limpiar datos corruptos y reparar vista
-- =====================================================

-- 1. Ver qué estatus problemáticos existen
SELECT estatus, COUNT(*) as total 
FROM qualitas_ordenes_asignadas 
GROUP BY estatus 
ORDER BY total DESC
LIMIT 30;

-- 2. Eliminar órdenes con estatus que son placas (patrón: 1-3 letras + 1-4 números)
-- o estatus vacíos/inválidos
DELETE FROM qualitas_ordenes_asignadas 
WHERE estatus ~ '^[A-Z]{1,3}\d{1,4}$'      -- Placas tipo ABC123
   OR estatus ~ '^[A-Z]{1,3}\d{1,4}[A-Z]$' -- Placas tipo ABC123A
   OR estatus IN ('SP', 'NA', '', ' ')
   OR estatus IS NULL;

-- 3. Eliminar órdenes de extracciones viejas (más de 7 días) para limpiar
DELETE FROM qualitas_ordenes_asignadas 
WHERE fecha_extraccion < NOW() - INTERVAL '7 days';

-- 4. Eliminar duplicados (misma orden, mismo estatus, misma fecha)
DELETE FROM qualitas_ordenes_asignadas a
USING qualitas_ordenes_asignadas b
WHERE a.id > b.id  -- Mantener el primero, eliminar el duplicado
  AND a.num_expediente = b.num_expediente
  AND a.estatus = b.estatus
  AND DATE(a.fecha_extraccion) = DATE(b.fecha_extraccion);

-- 5. Recrear vista corregida
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

-- 6. Verificar resultado final
SELECT 
    estatus, 
    COUNT(*) as total,
    MIN(fecha_asignacion) as primera,
    MAX(fecha_asignacion) as ultima
FROM v_qualitas_ordenes_recientes 
GROUP BY estatus 
ORDER BY total DESC;

-- 7. Contar total
SELECT COUNT(*) as total_ordenes FROM v_qualitas_ordenes_recientes;
