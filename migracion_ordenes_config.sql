-- Migración: Agregar configuración de modo diario para extracción de órdenes
-- Ejecutar esto en pgAdmin4

-- Agregar columnas para configuración de órdenes (modo intervalo o diario)
ALTER TABLE aseguradora_credenciales 
ADD COLUMN IF NOT EXISTS autosync_ordenes_mode VARCHAR(20) DEFAULT 'intervalo',
ADD COLUMN IF NOT EXISTS synctime_ordenes_diaria VARCHAR(5) DEFAULT '06:00';

-- Verificar que se crearon correctamente
SELECT 
    id, 
    seguro, 
    autosync, 
    synctime,
    autosync_ordenes_mode,
    synctime_ordenes_diaria
FROM aseguradora_credenciales;

-- Ejemplo: Configurar QUALITAS para ejecución diaria a las 5:00 AM
-- UPDATE aseguradora_credenciales 
-- SET autosync_ordenes_mode = 'diario',
--     synctime_ordenes_diaria = '05:00'
-- WHERE seguro = 'QUALITAS';

-- Ejemplo: Configurar CHUBB para ejecución diaria a las 7:00 AM
-- UPDATE aseguradora_credenciales 
-- SET autosync_ordenes_mode = 'diario',
--     synctime_ordenes_diaria = '07:00'
-- WHERE seguro = 'CHUBB';
