-- Agregar columnas de paquetería a bitacora_piezas
ALTER TABLE bitacora_piezas 
ADD COLUMN IF NOT EXISTS paqueteria VARCHAR(100),
ADD COLUMN IF NOT EXISTS guia_paqueteria VARCHAR(100);

-- Crear índices para búsquedas
CREATE INDEX IF NOT EXISTS idx_bitacora_piezas_paqueteria 
    ON bitacora_piezas(paqueteria);

CREATE INDEX IF NOT EXISTS idx_bitacora_piezas_guia 
    ON bitacora_piezas(guia_paqueteria);

-- Recrear vistas para incluir nuevas columnas
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
    bp.proveedor_id,
    p.id_externo AS proveedor_id_externo,
    p.nombre AS proveedor_nombre,
    p.email AS proveedor_email,
    p.celular AS proveedor_celular,
    bp.numero_orden,
    bp.numero_reporte,
    bp.paqueteria,
    bp.guia_paqueteria,
    bp.fecha_promesa,
    bp.fecha_estatus,
    bp.estatus,
    bp.demeritos,
    bp.ubicacion,
    bp.devolucion_proveedor,
    bp.recibido,
    bp.entregado,
    bp.portal,
    bp.fuente,
    bp.tipo_registro,
    bp.num_expediente,
    bp.id_externo,
    bp.fecha_extraccion,
    bp.created_at,
    bp.updated_at
FROM bitacora_piezas bp
LEFT JOIN proveedores p ON bp.proveedor_id = p.id;

-- Recrear vistas filtradas
CREATE OR REPLACE VIEW v_piezas_proceso_surtido AS
SELECT * FROM v_bitacora_piezas_completa
WHERE tipo_registro = 'Proceso de Surtido';

CREATE OR REPLACE VIEW v_piezas_reasignadas_canceladas AS
SELECT * FROM v_bitacora_piezas_completa
WHERE tipo_registro = 'Reasignada/Cancelada';

SELECT 'Columnas de paquetería agregadas exitosamente' AS resultado;
