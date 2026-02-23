CREATE TABLE IF NOT EXISTS public.presupuesto_historico_documentos (
  id BIGSERIAL PRIMARY KEY,
  aseguradora VARCHAR(40) NOT NULL DEFAULT 'QUALITAS',
  layout_version VARCHAR(30) NOT NULL DEFAULT 'qualitas_v1',
  moneda CHAR(3) NOT NULL DEFAULT 'MXN',

  reporte VARCHAR(80),
  folio VARCHAR(80),
  cliente TEXT,
  telefono_contacto VARCHAR(80),
  orden_taller VARCHAR(80),
  fecha_ingreso VARCHAR(80),
  marca VARCHAR(120),
  modelo VARCHAR(120),
  anio VARCHAR(30),
  tipo_vehiculo VARCHAR(120),
  placas VARCHAR(80),
  serie VARCHAR(120),
  color VARCHAR(80),
  transmision VARCHAR(80),
  kilometraje VARCHAR(80),
  puertas VARCHAR(40),
  poliza VARCHAR(80),

  fuente_archivo_nombre TEXT NOT NULL,
  fuente_archivo_ruta TEXT NOT NULL,
  fuente_archivo_hash CHAR(64) NOT NULL UNIQUE,
  fuente_s3_bucket TEXT,
  fuente_s3_key TEXT,

  lineas_count INTEGER NOT NULL DEFAULT 0,
  subtotal_mano_obra NUMERIC(14,2) NOT NULL DEFAULT 0,
  subtotal_pintura NUMERIC(14,2) NOT NULL DEFAULT 0,
  subtotal_refacciones NUMERIC(14,2) NOT NULL DEFAULT 0,
  subtotal_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  observaciones TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_presupuesto_hist_doc_vehiculo
  ON public.presupuesto_historico_documentos (marca, modelo, anio);

CREATE INDEX IF NOT EXISTS idx_presupuesto_hist_doc_aseguradora
  ON public.presupuesto_historico_documentos (aseguradora);

CREATE TABLE IF NOT EXISTS public.presupuesto_historico_lineas (
  id BIGSERIAL PRIMARY KEY,
  documento_id BIGINT NOT NULL
    REFERENCES public.presupuesto_historico_documentos(id)
    ON DELETE CASCADE,
  renglon INTEGER NOT NULL,
  ref_tipo VARCHAR(80),
  descripcion_pieza TEXT NOT NULL,
  mano_obra NUMERIC(14,2) NOT NULL DEFAULT 0,
  pintura NUMERIC(14,2) NOT NULL DEFAULT 0,
  refacciones NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  diferencia_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  tiene_valor_pendiente BOOLEAN NOT NULL DEFAULT FALSE,
  valor_raw_mano_obra TEXT,
  valor_raw_pintura TEXT,
  valor_raw_refacciones TEXT,
  valor_raw_total TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_presupuesto_hist_lineas_doc
  ON public.presupuesto_historico_lineas (documento_id);

CREATE INDEX IF NOT EXISTS idx_presupuesto_hist_lineas_ref_tipo
  ON public.presupuesto_historico_lineas (ref_tipo);

CREATE TABLE IF NOT EXISTS public.presupuesto_historico_ingesta_errores (
  id BIGSERIAL PRIMARY KEY,
  fuente_archivo_nombre TEXT NOT NULL,
  fuente_archivo_ruta TEXT NOT NULL,
  fuente_archivo_hash CHAR(64),
  error_etapa VARCHAR(60) NOT NULL,
  error_mensaje TEXT NOT NULL,
  error_traceback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_presupuesto_hist_err_hash
  ON public.presupuesto_historico_ingesta_errores (fuente_archivo_hash);
