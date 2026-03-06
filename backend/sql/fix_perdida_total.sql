-- Limpiar el conteo guardado de Pérdida Total para forzar re-extracción
-- Ejecutar esto en pgAdmin4

DELETE FROM qualitas_extraccion_conteos 
WHERE estatus = 'Pérdida Total y Pago De Daños';

-- Verificar
SELECT * FROM qualitas_extraccion_conteos;
