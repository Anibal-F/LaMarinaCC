-- Script para diagnosticar el problema de Pérdida Total
-- Ejecutar esto en pgAdmin4 para ver qué está pasando

-- 1. Ver TODOS los estatus distintos en la tabla
SELECT 
    estatus, 
    COUNT(*) as total,
    LENGTH(estatus) as longitud,
    pg_typeof(estatus) as tipo
FROM qualitas_ordenes_asignadas 
GROUP BY estatus 
ORDER BY total DESC;

-- 2. Ver órdenes específicas de Pérdida Total (búsqueda flexible)
SELECT 
    id,
    num_expediente,
    estatus,
    LENGTH(estatus) as longitud_estatus,
    fecha_extraccion
FROM qualitas_ordenes_asignadas 
WHERE LOWER(estatus) LIKE '%perdida%' 
   OR LOWER(estatus) LIKE '%pago%'
ORDER BY fecha_extraccion DESC
LIMIT 20;

-- 3. Contar órdenes por estatus (para verificar totales)
SELECT 
    'TOTAL_GENERAL' as metrica,
    COUNT(*) as valor
FROM qualitas_ordenes_asignadas
UNION ALL
SELECT 
    estatus,
    COUNT(*)::text
FROM qualitas_ordenes_asignadas
GROUP BY estatus
ORDER BY metrica;

-- 4. Verificar si hay problemas de codificación con caracteres especiales
SELECT 
    estatus,
    encode(estatus::bytea, 'hex') as hex_encoding,
    COUNT(*)
FROM qualitas_ordenes_asignadas
WHERE estatus LIKE '%Pérdida%' OR estatus LIKE '%Histórico%'
GROUP BY estatus, encode(estatus::bytea, 'hex');
