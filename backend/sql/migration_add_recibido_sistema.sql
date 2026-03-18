-- =====================================================
-- MIGRACIÓN: Agregar columna recibido_sistema a bitacora_piezas
-- Fecha: 2026-03-17
-- =====================================================

-- Agregar la nueva columna para tracking dual de recepción
-- recibido = viene del scraper (RPA)
-- recibido_sistema = viene del sistema (Paquetes)
ALTER TABLE bitacora_piezas 
ADD COLUMN IF NOT EXISTS recibido_sistema BOOLEAN DEFAULT FALSE;

-- Actualizar la vista para incluir el nuevo campo
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
    bp.recibido,              -- Del Scrapper (RPA)
    bp.recibido_sistema,      -- Del Sistema (Paquetes)
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
SELECT *
FROM v_bitacora_piezas_completa
WHERE 
    -- Piezas activas (no canceladas, no reasignadas)
    (estatus IS NULL OR estatus NOT IN ('Cancelada', 'Reasignada'))
    -- Piezas que tienen número de orden (del scrapper)
    AND numero_orden IS NOT NULL
    AND numero_orden != '';

-- =====================================================
-- VISTA: v_piezas_reasignadas_canceladas
-- Vista para piezas reasignadas o canceladas (Tabla 2)
-- =====================================================

CREATE OR REPLACE VIEW v_piezas_reasignadas_canceladas AS
SELECT *
FROM v_bitacora_piezas_completa
WHERE 
    estatus IN ('Cancelada', 'Reasignada')
    OR numero_orden IS NULL 
    OR numero_orden = '';

-- Confirmar que la migración fue exitosa
SELECT '✅ Migración completada exitosamente' as mensaje;
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'bitacora_piezas' 
AND column_name IN ('recibido', 'recibido_sistema')
ORDER BY ordinal_position;
