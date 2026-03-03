-- ============================================================================
-- SCRIPT DE CONFIGURACIÓN DE BASE DE DATOS PARA CHUBB
-- Ejecutar en pgAdmin4 para crear las tablas necesarias
-- ============================================================================

-- Tabla de indicadores de CHUBB
CREATE TABLE IF NOT EXISTS chubb_indicadores (
    id SERIAL PRIMARY KEY,
    taller_id VARCHAR(50) NOT NULL,
    taller_nombre VARCHAR(255),
    fecha_extraccion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    por_autorizar INTEGER DEFAULT 0,
    autorizadas INTEGER DEFAULT 0,
    rechazadas INTEGER DEFAULT 0,
    complementos INTEGER DEFAULT 0,
    total_expedientes INTEGER DEFAULT 0,
    raw_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de expedientes de CHUBB
CREATE TABLE IF NOT EXISTS chubb_expedientes (
    id SERIAL PRIMARY KEY,
    num_expediente VARCHAR(100) NOT NULL,
    tipo_vehiculo VARCHAR(255),
    estado VARCHAR(100) NOT NULL,
    fecha_creacion TIMESTAMP,
    fecha_inspeccion TIMESTAMP,
    fecha_actualizacion TIMESTAMP,
    placas VARCHAR(50),
    asignado_a VARCHAR(255),
    compania VARCHAR(100),
    fecha_accidente TIMESTAMP,
    fecha_extraccion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(num_expediente, fecha_extraccion)
);

-- Índices para mejorar performance
CREATE INDEX IF NOT EXISTS idx_chubb_expedientes_estado 
ON chubb_expedientes(estado);

CREATE INDEX IF NOT EXISTS idx_chubb_expedientes_fecha_ext 
ON chubb_expedientes(fecha_extraccion DESC);

CREATE INDEX IF NOT EXISTS idx_chubb_expedientes_num_exp 
ON chubb_expedientes(num_expediente);

CREATE INDEX IF NOT EXISTS idx_chubb_indicadores_fecha 
ON chubb_indicadores(fecha_extraccion DESC);

-- Vista para obtener expedientes recientes (última extracción)
CREATE OR REPLACE VIEW v_chubb_expedientes_recientes AS
SELECT *
FROM chubb_expedientes
WHERE fecha_extraccion = (
    SELECT MAX(fecha_extraccion) 
    FROM chubb_expedientes
);

-- Comentarios en las tablas
COMMENT ON TABLE chubb_indicadores IS 'Indicadores de expedientes CHUBB extraídos por RPA';
COMMENT ON TABLE chubb_expedientes IS 'Expedientes CHUBB extraídos por RPA';

-- Verificar que las tablas se crearon correctamente
SELECT 
    'chubb_indicadores' as tabla,
    COUNT(*) as columnas
FROM information_schema.columns 
WHERE table_name = 'chubb_indicadores'
UNION ALL
SELECT 
    'chubb_expedientes' as tabla,
    COUNT(*) as columnas
FROM information_schema.columns 
WHERE table_name = 'chubb_expedientes';
