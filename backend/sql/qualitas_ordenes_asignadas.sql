-- =====================================================
-- TABLA: qualitas_ordenes_asignadas
-- Almacena las órdenes asignadas extraídas de Qualitas
-- =====================================================

CREATE TABLE IF NOT EXISTS qualitas_ordenes_asignadas (
    id SERIAL PRIMARY KEY,
    
    -- Datos del expediente
    num_expediente VARCHAR(50) NOT NULL,
    fecha_asignacion TIMESTAMP,
    poliza VARCHAR(100),
    
    -- Datos del siniestro
    siniestro VARCHAR(100),
    reporte VARCHAR(100),
    riesgo VARCHAR(50),
    
    -- Datos del vehículo
    vehiculo TEXT,
    anio INTEGER,
    placas VARCHAR(20),
    
    -- Estado
    estatus VARCHAR(50),
    
    -- Metadatos
    fecha_extraccion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraint único para evitar duplicados
    UNIQUE(num_expediente, fecha_extraccion)
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_qualitas_ordenes_fecha_ext 
    ON qualitas_ordenes_asignadas(fecha_extraccion DESC);

CREATE INDEX IF NOT EXISTS idx_qualitas_ordenes_num_exp 
    ON qualitas_ordenes_asignadas(num_expediente);

CREATE INDEX IF NOT EXISTS idx_qualitas_ordenes_estatus 
    ON qualitas_ordenes_asignadas(estatus);

CREATE INDEX IF NOT EXISTS idx_qualitas_ordenes_placas 
    ON qualitas_ordenes_asignadas(placas);

-- Vista de últimas órdenes
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
ORDER BY fecha_asignacion DESC;

-- Comentario de la tabla
COMMENT ON TABLE qualitas_ordenes_asignadas IS 'Órdenes asignadas extraídas del portal de Qualitas';
