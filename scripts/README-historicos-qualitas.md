# Ingesta de historicos Qualitas (Paso 1)

Este flujo crea el historico estructurado en BD y opcionalmente sube los archivos brutos a S3.

## 1) Crear tablas

Ejecuta:

```sql
\i scripts/sql/001_presupuestos_historicos.sql
```

O usa el flag `--ensure-schema` del script.

## 2) Dependencias

Incluidas en `backend/requirements.txt`:

- `openpyxl` para `.xlsx`
- `xlrd` para `.xls`

## 3) Ingesta de carpeta

Dry-run (sin insertar, solo valida parseo):

```bash
python scripts/ingest_historicos_qualitas.py \
  --input-dir "C:\ruta\a\carpeta\historicos" \
  --recursive \
  --dry-run
```

Ingesta real a BD:

```bash
python scripts/ingest_historicos_qualitas.py \
  --input-dir "C:\ruta\a\carpeta\historicos" \
  --recursive \
  --db-url "postgresql://user:pass@host:5432/dbname" \
  --ensure-schema
```

Ingesta con subida opcional a S3:

```bash
python scripts/ingest_historicos_qualitas.py \
  --input-dir "C:\ruta\a\carpeta\historicos" \
  --recursive \
  --db-url "postgresql://user:pass@host:5432/dbname" \
  --s3-bucket "mi-bucket" \
  --s3-prefix "historicos/qualitas" \
  --ensure-schema
```

## 4) Lo que cubre

- Idempotencia por hash SHA-256 del archivo (`fuente_archivo_hash`).
- Tabla de errores por archivo (`presupuesto_historico_ingesta_errores`).
- Validaciones:
  - deteccion de encabezado esperado;
  - lineas vacias / sin descripcion;
  - diferencia entre `Total` y suma de conceptos;
  - valores pendientes (`*`) marcados por linea.

## 5) Tablas resultantes

- `presupuesto_historico_documentos`
- `presupuesto_historico_lineas`
- `presupuesto_historico_ingesta_errores`
