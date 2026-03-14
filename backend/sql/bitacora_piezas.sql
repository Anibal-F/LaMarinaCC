-- =====================================================
-- TABLA: proveedores
-- Catálogo de proveedores para Qualitas y CHUBB
-- =====================================================

CREATE TABLE IF NOT EXISTS proveedores (
    id SERIAL PRIMARY KEY,
    
    -- Datos del proveedor (igual que en Qualitas)
    id_externo INTEGER NOT NULL,           -- ID del proveedor en la plataforma (Qualitas/CHUBB)
    fuente VARCHAR(50) NOT NULL,           -- 'Qualitas' o 'CHUBB'
    nombre VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    celular VARCHAR(20),
    
    -- Metadatos
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraint único para evitar duplicados por fuente
    UNIQUE(id_externo, fuente)
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_proveedores_id_ext 
    ON proveedores(id_externo);

CREATE INDEX IF NOT EXISTS idx_proveedores_fuente 
    ON proveedores(fuente);

CREATE INDEX IF NOT EXISTS idx_proveedores_nombre 
    ON proveedores(nombre);

-- Comentario de la tabla
COMMENT ON TABLE proveedores IS 'Catálogo de proveedores de Qualitas y CHUBB';


-- =====================================================
-- TABLA: bitacora_piezas
-- Almacena las piezas de Qualitas (Tablas 1 y 2 unificadas)
-- Preparada para futura integración con CHUBB
-- =====================================================

CREATE TABLE IF NOT EXISTS bitacora_piezas (
    id SERIAL PRIMARY KEY,
    
    -- Identificación de la pieza
    nombre VARCHAR(255) NOT NULL,          -- Nombre de la pieza
    origen VARCHAR(50),                     -- ORIGINAL, GENERICO, etc.
    numero_parte VARCHAR(100),              -- # de parte
    observaciones TEXT,                     -- Observaciones libres
    
    -- Relación con proveedor
    proveedor_id INTEGER REFERENCES proveedores(id) ON DELETE SET NULL,
    
    -- Números de orden y reporte
    numero_orden VARCHAR(50),               -- Número de orden (ej: 8530181)
    numero_reporte VARCHAR(100),            -- Número de reporte/siniestro (ej: R: 04 0540704 25 A)
    
    -- Fechas (separadas como solicitaste)
    fecha_promesa TIMESTAMP,                -- Fecha promesa de entrega
    fecha_estatus TIMESTAMP,                -- Fecha del estatus actual
    
    -- Estatus y deméritos
    estatus VARCHAR(50),                    -- En Proceso, Cancelada, Pendiente, etc.
    demeritos DECIMAL(10,2) DEFAULT 0,      -- Deméritos en $
    
    -- Ubicación física
    ubicacion VARCHAR(50) DEFAULT 'ND',     -- ND, ALMACEN, TALLER, etc.
    
    -- Checkboxes booleanos
    devolucion_proveedor BOOLEAN DEFAULT FALSE,
    recibido BOOLEAN DEFAULT FALSE,
    entregado BOOLEAN DEFAULT FALSE,
    portal BOOLEAN DEFAULT FALSE,
    
    -- Identificación de origen
    fuente VARCHAR(50) NOT NULL,            -- 'Qualitas' o 'CHUBB'
    tipo_registro VARCHAR(50) NOT NULL,     -- 'Proceso de Surtido' o 'Reasignada/Cancelada'
    
    -- Campos específicos de Qualitas
    num_expediente VARCHAR(50),             -- Relación con orden de Qualitas (si aplica)
    id_externo VARCHAR(100),                -- ID externo en la plataforma origen
    
    -- Metadatos
    fecha_extraccion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraint único para evitar duplicados por fuente y ID externo
    UNIQUE(id_externo, fuente)
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_bitacora_piezas_proveedor 
    ON bitacora_piezas(proveedor_id);

CREATE INDEX IF NOT EXISTS idx_bitacora_piezas_estatus 
    ON bitacora_piezas(estatus);

CREATE INDEX IF NOT EXISTS idx_bitacora_piezas_fuente 
    ON bitacora_piezas(fuente);

CREATE INDEX IF NOT EXISTS idx_bitacora_piezas_tipo_registro 
    ON bitacora_piezas(tipo_registro);

CREATE INDEX IF NOT EXISTS idx_bitacora_piezas_num_exp 
    ON bitacora_piezas(num_expediente);

CREATE INDEX IF NOT EXISTS idx_bitacora_piezas_numero_orden 
    ON bitacora_piezas(numero_orden);

CREATE INDEX IF NOT EXISTS idx_bitacora_piezas_numero_reporte 
    ON bitacora_piezas(numero_reporte);

CREATE INDEX IF NOT EXISTS idx_bitacora_piezas_fecha_ext 
    ON bitacora_piezas(fecha_extraccion DESC);

CREATE INDEX IF NOT EXISTS idx_bitacora_piezas_fecha_promesa 
    ON bitacora_piezas(fecha_promesa);

-- Comentario de la tabla
COMMENT ON TABLE bitacora_piezas IS 'Bitácora de piezas unificada de Qualitas y CHUBB';


-- =====================================================
-- VISTA: v_bitacora_piezas_completa
-- Vista con información completa incluyendo datos del proveedor
-- =====================================================

DROP VIEW IF EXISTS v_piezas_proceso_surtido;
DROP VIEW IF EXISTS v_piezas_reasignadas_canceladas;
DROP VIEW IF EXISTS v_bitacora_piezas_completa;

CREATE OR REPLACE VIEW v_bitacora_piezas_completa AS
SELECT 
    bp.id,
    bp.nombre,
    bp.origen,
    bp.numero_parte,
    bp.observaciones,
    
    -- Datos del proveedor
    bp.proveedor_id,
    p.id_externo AS proveedor_id_externo,
    p.nombre AS proveedor_nombre,
    p.email AS proveedor_email,
    p.celular AS proveedor_celular,
    
    -- Nuevos campos de orden y reporte
    bp.numero_orden,
    bp.numero_reporte,
    
    -- Fechas
    bp.fecha_promesa,
    bp.fecha_estatus,
    
    -- Estatus y deméritos
    bp.estatus,
    bp.demeritos,
    bp.ubicacion,
    
    -- Checkboxes
    bp.devolucion_proveedor,
    bp.recibido,
    bp.entregado,
    bp.portal,
    
    -- Origen
    bp.fuente,
    bp.tipo_registro,
    bp.num_expediente,
    bp.id_externo,
    bp.fecha_extraccion,
    bp.created_at,
    bp.updated_at
FROM bitacora_piezas bp
LEFT JOIN proveedores p ON bp.proveedor_id = p.id;


-- =====================================================
-- VISTA: v_piezas_proceso_surtido
-- Vista filtrada para piezas en proceso de surtido (Tabla 1)
-- =====================================================

CREATE OR REPLACE VIEW v_piezas_proceso_surtido AS
SELECT * FROM v_bitacora_piezas_completa
WHERE tipo_registro = 'Proceso de Surtido';


-- =====================================================
-- VISTA: v_piezas_reasignadas_canceladas
-- Vista filtrada para piezas reasignadas/canceladas (Tabla 2)
-- =====================================================

CREATE OR REPLACE VIEW v_piezas_reasignadas_canceladas AS
SELECT * FROM v_bitacora_piezas_completa
WHERE tipo_registro = 'Reasignada/Cancelada';


-- =====================================================
-- FUNCIÓN: Actualizar updated_at automáticamente
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger para proveedores
DROP TRIGGER IF EXISTS update_proveedores_updated_at ON proveedores;
CREATE TRIGGER update_proveedores_updated_at
    BEFORE UPDATE ON proveedores
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger para bitacora_piezas
DROP TRIGGER IF EXISTS update_bitacora_piezas_updated_at ON bitacora_piezas;
CREATE TRIGGER update_bitacora_piezas_updated_at
    BEFORE UPDATE ON bitacora_piezas
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- =====================================================
-- DATOS DE EJEMPLO (Opcional - puedes comentar esta sección)
-- =====================================================

-- Insertar proveedores de ejemplo
INSERT INTO proveedores (id_externo, fuente, nombre, email, celular) VALUES
(14936, 'Qualitas', 'OZ AUTOMOTRIZ COUNTRY', 'fernandofrias@oztoyotacountry.com', '3316158437'),
(14937, 'Qualitas', 'REFACCIONARIA DEL PACIFICO', 'ventas@rpacifico.com', '6691234567'),
(14938, 'Qualitas', 'AUTOPARTES LA MARINA', 'pedidos@autoparteslm.com', '6699876543')
ON CONFLICT (id_externo, fuente) DO NOTHING;

-- Insertar piezas de ejemplo
INSERT INTO bitacora_piezas (
    nombre, origen, numero_parte, observaciones, proveedor_id,
    numero_orden, numero_reporte,
    fecha_promesa, fecha_estatus, estatus, demeritos, ubicacion,
    devolucion_proveedor, recibido, entregado, portal,
    fuente, tipo_registro, num_expediente, id_externo
) VALUES
(
    'ANTIGRAVILLA PUERTA DESLIZABLE DERECHA', 'ORIGINAL', 'AG-2024-001', '', 
    (SELECT id FROM proveedores WHERE id_externo = 14936 AND fuente = 'Qualitas'),
    '8530181', 'R: 04 0540704 25 A',
    '2025-04-20 10:00:00', '2025-04-16 12:00:46', 'Cancelada', 0, 'ND',
    false, false, false, false,
    'Qualitas', 'Reasignada/Cancelada', 'EXP-001', 'Q-PZ-001'
),
(
    'FARO DELANTERO DERECHO', 'ORIGINAL', 'FD-2024-102', 'Urgente',
    (SELECT id FROM proveedores WHERE id_externo = 14937 AND fuente = 'Qualitas'),
    '8543615', 'R: 04 0575682 25 T1',
    '2025-04-18 14:00:00', '2025-04-15 09:30:00', 'En Proceso', 150, 'ALMACEN',
    false, true, false, true,
    'Qualitas', 'Proceso de Surtido', 'EXP-002', 'Q-PZ-002'
),
(
    'PARACHOQUE TRASERO', 'GENERICO', 'PT-2024-055', 'Pintar match',
    (SELECT id FROM proveedores WHERE id_externo = 14938 AND fuente = 'Qualitas'),
    '8553803', 'R: 04 0602113 25 A',
    '2025-04-22 11:00:00', '2025-04-14 16:45:00', 'Pendiente', 0, 'PENDIENTE',
    false, false, false, false,
    'Qualitas', 'Proceso de Surtido', 'EXP-003', 'Q-PZ-003'
)
ON CONFLICT (id_externo, fuente) DO NOTHING;


-- =====================================================
-- MENSAJE DE CONFIRMACIÓN
-- =====================================================

SELECT 'Tablas creadas exitosamente!' AS resultado;
SELECT ' - proveedores' AS tabla;
SELECT ' - bitacora_piezas (con numero_orden y numero_reporte)' AS tabla;
SELECT ' - Vistas: v_bitacora_piezas_completa, v_piezas_proceso_surtido, v_piezas_reasignadas_canceladas' AS info;
