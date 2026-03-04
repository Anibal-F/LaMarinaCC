-- Agregar columnas de configuración de sincronización automática a aseguradora_credenciales
-- Ejecutar: psql -h <host> -U <user> -d <database> -f scripts/add_autosync_columns.sql

-- Agregar columna autosync (habilitar/deshabilitar sincronización automática)
ALTER TABLE aseguradora_credenciales
ADD COLUMN IF NOT EXISTS autosync BOOLEAN DEFAULT false;

-- Agregar columna synctime (tiempo en horas entre sincronizaciones)
ALTER TABLE aseguradora_credenciales
ADD COLUMN IF NOT EXISTS synctime INTEGER DEFAULT 2;

-- Agregar comentarios para documentación
COMMENT ON COLUMN aseguradora_credenciales.autosync IS 'Habilita/deshabilita la sincronización automática del RPA';
COMMENT ON COLUMN aseguradora_credenciales.synctime IS 'Intervalo en horas entre sincronizaciones automáticas (default: 2 horas)';

-- Actualizar registros existentes para tener valores por defecto
UPDATE aseguradora_credenciales
SET autosync = false,
    synctime = 2
WHERE autosync IS NULL OR synctime IS NULL;

-- Verificar cambios
SELECT id, seguro, usuario, autosync, synctime, activo
FROM aseguradora_credenciales
ORDER BY id;
