-- =====================================================
-- MIGRACION: proveedores.activo
-- Permite marcar proveedores como activos o inactivos
-- =====================================================

ALTER TABLE proveedores
    ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_proveedores_activo
    ON proveedores(activo);

UPDATE proveedores
SET activo = TRUE
WHERE activo IS NULL;

SELECT 'Columna activo agregada a proveedores' AS resultado;
