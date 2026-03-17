-- =====================================================
-- PAQUETES DE PIEZAS
-- Esquema base para recepción de paquetes vinculados a OT/siniestro
-- =====================================================

CREATE SEQUENCE IF NOT EXISTS paquetes_piezas_folio_seq
    START WITH 1
    INCREMENT BY 1
    MINVALUE 1;


CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';


CREATE TABLE IF NOT EXISTS paquetes_piezas (
    id BIGSERIAL PRIMARY KEY,
    folio VARCHAR(30) NOT NULL UNIQUE
        DEFAULT ('PKG-' || LPAD(nextval('paquetes_piezas_folio_seq')::text, 3, '0')),
    orden_admision_id BIGINT REFERENCES orden_admision(id) ON DELETE SET NULL,
    folio_ot VARCHAR(50),
    numero_reporte_siniestro VARCHAR(100),
    proveedor_nombre VARCHAR(255) NOT NULL,
    fecha_arribo TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    estatus VARCHAR(30) NOT NULL DEFAULT 'Generado',
    comentarios TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_paquetes_piezas_orden
    ON paquetes_piezas(orden_admision_id);

CREATE INDEX IF NOT EXISTS idx_paquetes_piezas_ot
    ON paquetes_piezas(folio_ot);

CREATE INDEX IF NOT EXISTS idx_paquetes_piezas_reporte
    ON paquetes_piezas(numero_reporte_siniestro);

CREATE INDEX IF NOT EXISTS idx_paquetes_piezas_estatus
    ON paquetes_piezas(estatus);

CREATE INDEX IF NOT EXISTS idx_paquetes_piezas_arribo
    ON paquetes_piezas(fecha_arribo DESC);


CREATE TABLE IF NOT EXISTS paquetes_piezas_relaciones (
    id BIGSERIAL PRIMARY KEY,
    paquete_id BIGINT NOT NULL REFERENCES paquetes_piezas(id) ON DELETE CASCADE,
    bitacora_pieza_id INTEGER REFERENCES bitacora_piezas(id) ON DELETE SET NULL,
    nombre_pieza VARCHAR(255) NOT NULL,
    numero_parte VARCHAR(100),
    cantidad INTEGER NOT NULL DEFAULT 1 CHECK (cantidad > 0),
    estatus VARCHAR(30) NOT NULL DEFAULT 'Generado',
    observaciones TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_paquetes_piezas_relaciones_paquete
    ON paquetes_piezas_relaciones(paquete_id);

CREATE INDEX IF NOT EXISTS idx_paquetes_piezas_relaciones_bitacora
    ON paquetes_piezas_relaciones(bitacora_pieza_id);

CREATE INDEX IF NOT EXISTS idx_paquetes_piezas_relaciones_estatus
    ON paquetes_piezas_relaciones(estatus);


CREATE TABLE IF NOT EXISTS paquetes_piezas_media (
    id BIGSERIAL PRIMARY KEY,
    paquete_id BIGINT NOT NULL REFERENCES paquetes_piezas(id) ON DELETE CASCADE,
    media_type VARCHAR(40) NOT NULL DEFAULT 'photo',
    file_path TEXT NOT NULL,
    original_name TEXT,
    mime_type VARCHAR(120),
    file_size BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_paquetes_piezas_media_paquete
    ON paquetes_piezas_media(paquete_id);

CREATE INDEX IF NOT EXISTS idx_paquetes_piezas_media_tipo
    ON paquetes_piezas_media(paquete_id, media_type);

ALTER TABLE paquetes_piezas
    ALTER COLUMN estatus SET DEFAULT 'Generado';

ALTER TABLE paquetes_piezas_relaciones
    ALTER COLUMN estatus SET DEFAULT 'Generado';

UPDATE paquetes_piezas
SET estatus = CASE
    WHEN LOWER(COALESCE(estatus, '')) IN ('recibido', 'completado') THEN 'Completado'
    ELSE 'Generado'
END
WHERE LOWER(COALESCE(estatus, '')) IN ('pendiente', 'demorado', 'recibido', 'completado', 'generado');

UPDATE paquetes_piezas_relaciones
SET estatus = CASE
    WHEN LOWER(COALESCE(estatus, '')) IN ('recibido', 'completado') THEN 'Completado'
    ELSE 'Generado'
END
WHERE LOWER(COALESCE(estatus, '')) IN ('pendiente', 'demorado', 'recibido', 'completado', 'generado');


DROP TRIGGER IF EXISTS update_paquetes_piezas_updated_at ON paquetes_piezas;
CREATE TRIGGER update_paquetes_piezas_updated_at
    BEFORE UPDATE ON paquetes_piezas
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_paquetes_piezas_relaciones_updated_at ON paquetes_piezas_relaciones;
CREATE TRIGGER update_paquetes_piezas_relaciones_updated_at
    BEFORE UPDATE ON paquetes_piezas_relaciones
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


SELECT 'Esquema de paquetes_piezas creado exitosamente' AS resultado;
