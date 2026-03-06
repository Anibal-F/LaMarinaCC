-- Verificar si los expedientes de Pérdida Total ya existen
SELECT num_expediente, estatus, fecha_extraccion
FROM qualitas_ordenes_asignadas
WHERE num_expediente IN (
    '8896152', '8909348', '8925197', '8972202', '9020126', 
    '9065294', '9063217', '9069371', '9249638', '9263170',
    '9276847', '9259151', '9280146', '9270484', '9279093',
    '9284023', '9287054', '9294538'
)
ORDER BY num_expediente;

-- Ver total de órdenes en la tabla
SELECT COUNT(*) as total_ordenes FROM qualitas_ordenes_asignadas;

-- Ver últimas 5 órdenes insertadas
SELECT num_expediente, estatus, fecha_extraccion
FROM qualitas_ordenes_asignadas
ORDER BY fecha_extraccion DESC
LIMIT 5;
