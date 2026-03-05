-- Debug: Ver qué estatus están realmente en la BD
SELECT 
    estatus,
    COUNT(*) as total,
    MIN(fecha_extraccion) as primera_extraccion,
    MAX(fecha_extraccion) as ultima_extraccion
FROM qualitas_ordenes_asignadas
GROUP BY estatus
ORDER BY total DESC;

-- Ver órdenes sin estatus
SELECT COUNT(*) as ordenes_sin_estatus 
FROM qualitas_ordenes_asignadas 
WHERE estatus IS NULL OR estatus = '';

-- Ver total de órdenes
SELECT COUNT(*) as total_ordenes FROM qualitas_ordenes_asignadas;

-- Ver órdenes recientes (última extracción)
SELECT estatus, COUNT(*) as total
FROM qualitas_ordenes_asignadas
WHERE fecha_extraccion = (SELECT MAX(fecha_extraccion) FROM qualitas_ordenes_asignadas)
GROUP BY estatus
ORDER BY total DESC;
