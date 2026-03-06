-- Buscar cualquier estatus que contenga 'Total' o similar
SELECT DISTINCT estatus, COUNT(*) as total, LENGTH(estatus) as longitud
FROM qualitas_ordenes_asignadas
WHERE estatus ILIKE '%total%' 
   OR estatus ILIKE '%perdida%'
   OR estatus ILIKE '%pago%'
   OR estatus ILIKE '%danos%'
GROUP BY estatus
ORDER BY total DESC;

-- Verificar codificación de caracteres
SELECT 
    estatus,
    encode(estatus::bytea, 'hex') as hex,
    COUNT(*)
FROM qualitas_ordenes_asignadas
GROUP BY estatus
HAVING estatus ILIKE '%total%' OR estatus ILIKE '%perdida%'
ORDER BY COUNT(*) DESC;

-- Ver todas las órdenes con estatus largo (más de 20 caracteres)
SELECT estatus, COUNT(*) 
FROM qualitas_ordenes_asignadas 
WHERE LENGTH(estatus) > 20
GROUP BY estatus;
