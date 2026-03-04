-- Actualizar la tabla de órdenes para soportar múltiples estatus
-- Ejecutar: psql -h <host> -U <user> -d <database> -f scripts/update_ordenes_table_for_all_status.sql

-- Verificar que existen los índices necesarios para búsquedas por estatus
CREATE INDEX IF NOT EXISTS idx_qualitas_ordenes_estatus 
    ON qualitas_ordenes_asignadas(estatus);

-- Actualizar la vista para que sea más eficiente
DROP VIEW IF EXISTS v_qualitas_ordenes_recientes;

CREATE OR REPLACE VIEW v_qualitas_ordenes_recientes AS
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
WHERE fecha_extraccion = (
    SELECT MAX(fecha_extraccion) 
    FROM qualitas_ordenes_asignadas
)
ORDER BY 
    CASE estatus
        WHEN 'Asignados' THEN 1
        WHEN 'Asignado por App' THEN 2
        WHEN 'Citados' THEN 3
        WHEN 'Tránsito' THEN 4
        WHEN 'Piso' THEN 5
        WHEN 'Terminadas' THEN 6
        WHEN 'Entregadas' THEN 7
        WHEN 'Facturadas' THEN 8
        WHEN 'Pérdida Total y Pago De Daños' THEN 9
        WHEN 'Histórico' THEN 10
        WHEN 'Histórico Facturados' THEN 11
        ELSE 99
    END,
    fecha_asignacion DESC;

-- Actualizar comentario de la tabla
COMMENT ON TABLE qualitas_ordenes_asignadas IS 'Órdenes de Qualitas extraídas de todos los estatus (Asignados, Citados, Tránsito, Piso, Terminadas, Entregadas, etc.)';

-- Verificar datos actuales
SELECT estatus, COUNT(*) as cantidad
FROM qualitas_ordenes_asignadas
WHERE fecha_extraccion = (SELECT MAX(fecha_extraccion) FROM qualitas_ordenes_asignadas)
GROUP BY estatus
ORDER BY cantidad DESC;
