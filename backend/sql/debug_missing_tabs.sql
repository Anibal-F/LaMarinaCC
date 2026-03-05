-- Debug: Ver últimas extracciones por estatus con fecha
SELECT 
    estatus,
    COUNT(*) as total,
    MIN(fecha_extraccion) as primera_fecha,
    MAX(fecha_extraccion) as ultima_fecha
FROM qualitas_ordenes_asignadas
GROUP BY estatus
ORDER BY ultima_fecha DESC;

-- Ver total general
SELECT COUNT(*) as total_ordenes FROM qualitas_ordenes_asignadas;

-- Verificar si hay órdenes recientes (últimas 2 horas)
SELECT 
    estatus,
    COUNT(*) as total
FROM qualitas_ordenes_asignadas
WHERE fecha_extraccion > NOW() - INTERVAL '2 hours'
GROUP BY estatus
ORDER BY total DESC;
