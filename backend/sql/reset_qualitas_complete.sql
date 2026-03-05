-- =====================================================
-- RESET COMPLETO: Limpiar todas las tablas de Qualitas
-- =====================================================

-- 1. Eliminar vista
DROP VIEW IF EXISTS v_qualitas_ordenes_recientes;

-- 2. Eliminar tabla de órdenes
DROP TABLE IF EXISTS qualitas_ordenes_asignadas;

-- 3. Eliminar tabla de conteos
DROP TABLE IF EXISTS qualitas_extraccion_conteos;

-- 4. Recrear tabla de órdenes
CREATE TABLE qualitas_ordenes_asignadas (
    id SERIAL PRIMARY KEY,
    num_expediente VARCHAR(50) NOT NULL,
    fecha_asignacion TIMESTAMP,
    poliza VARCHAR(100),
    siniestro VARCHAR(100),
    reporte VARCHAR(100),
    riesgo VARCHAR(50),
    vehiculo TEXT,
    anio INTEGER,
    placas VARCHAR(20),
    estatus VARCHAR(50),
    fecha_extraccion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(num_expediente, fecha_extraccion)
);

-- 5. Crear índices
CREATE INDEX idx_qualitas_ordenes_fecha_ext 
    ON qualitas_ordenes_asignadas(fecha_extraccion DESC);

CREATE INDEX idx_qualitas_ordenes_num_exp 
    ON qualitas_ordenes_asignadas(num_expediente);

CREATE INDEX idx_qualitas_ordenes_estatus 
    ON qualitas_ordenes_asignadas(estatus);

-- 6. Recrear vista
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
ORDER BY fecha_extraccion DESC, fecha_asignacion DESC NULLS LAST;

-- 7. Verificar que está vacía
SELECT 'Tabla vacía' as status, COUNT(*) as total FROM qualitas_ordenes_asignadas;
