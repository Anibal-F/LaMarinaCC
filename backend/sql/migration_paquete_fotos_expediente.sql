-- =====================================================
-- MIGRACIÓN: Copiar fotos de paquetes a expediente
-- Fecha: 2026-03-18
-- =====================================================

-- Asegurar que la columna tipo en expediente_archivos acepte el nuevo tipo
-- Nota: Si hay una constraint CHECK, debe modificarse

-- Verificar si existe la tabla expediente_archivos
DO $$
BEGIN
    -- Asegurar columnas necesarias
    ALTER TABLE expediente_archivos 
    ADD COLUMN IF NOT EXISTS categoria VARCHAR(40);
    
    ALTER TABLE expediente_archivos 
    ADD COLUMN IF NOT EXISTS anotaciones JSONB NOT NULL DEFAULT '[]'::jsonb;
    
    -- Crear tabla expedientes si no existe
    CREATE TABLE IF NOT EXISTS expedientes (
        id SERIAL PRIMARY KEY,
        reporte_siniestro VARCHAR(100) NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    
    -- Crear tabla expediente_archivos si no existe
    CREATE TABLE IF NOT EXISTS expediente_archivos (
        id SERIAL PRIMARY KEY,
        expediente_id INTEGER NOT NULL REFERENCES expedientes(id) ON DELETE CASCADE,
        tipo VARCHAR(50) NOT NULL,
        categoria VARCHAR(40),
        archivo_path TEXT NOT NULL,
        archivo_nombre TEXT,
        archivo_size BIGINT,
        mime_type VARCHAR(120),
        anotaciones JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    
    -- Crear índices
    CREATE INDEX IF NOT EXISTS idx_expediente_archivos_expediente 
    ON expediente_archivos(expediente_id);
    
    CREATE INDEX IF NOT EXISTS idx_expediente_archivos_tipo 
    ON expediente_archivos(expediente_id, tipo);
    
END $$;

-- Confirmar
SELECT '✅ Migración completada: Fotos de paquetes se copiarán al expediente' as mensaje;
