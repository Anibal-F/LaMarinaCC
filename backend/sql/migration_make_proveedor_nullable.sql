-- =====================================================
-- MIGRACIÓN: Hacer proveedor_nombre nullable en paquetes_piezas
-- Fecha: 2026-03-18
-- =====================================================

-- Hacer que proveedor_nombre permita valores NULL
ALTER TABLE paquetes_piezas
ALTER COLUMN proveedor_nombre DROP NOT NULL;

-- Confirmar el cambio
SELECT column_name, is_nullable, data_type 
FROM information_schema.columns 
WHERE table_name = 'paquetes_piezas' 
AND column_name = 'proveedor_nombre';
