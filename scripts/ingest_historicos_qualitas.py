#!/usr/bin/env python3
"""
Ingesta de historicos de presupuesto Qualitas (layout fijo).

Paso 1 (historico):
- Lee .xls/.xlsx de una carpeta (batch).
- Extrae cabecera y lineas de presupuesto.
- Inserta en tablas historicas normalizadas.
- Opcional: sube el archivo bruto a S3.
- Idempotencia por hash SHA-256 del archivo.
- Registra errores por archivo en tabla de errores.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import traceback
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import boto3
import psycopg
from psycopg.rows import dict_row

try:
    import openpyxl
except Exception:  # pragma: no cover
    openpyxl = None

try:
    import xlrd
except Exception:  # pragma: no cover
    xlrd = None


DDL_SQL = Path(__file__).resolve().parent / "sql" / "001_presupuestos_historicos.sql"


@dataclass
class ParsedLine:
    renglon: int
    ref_tipo: str
    descripcion_pieza: str
    mano_obra: float
    pintura: float
    refacciones: float
    total: float
    diferencia_total: float
    tiene_valor_pendiente: bool
    valor_raw_mano_obra: str
    valor_raw_pintura: str
    valor_raw_refacciones: str
    valor_raw_total: str


def normalize_dsn(dsn: str) -> str:
    if dsn.startswith("postgresql+psycopg://"):
        return dsn.replace("postgresql+psycopg://", "postgresql://", 1)
    return dsn


def norm_text(value: Any) -> str:
    text = str(value or "").strip()
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"\s+", " ", text)
    return text.upper().strip()


def file_hash_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def parse_amount(raw: Any) -> tuple[float, bool, str]:
    original = str(raw or "").strip()
    if original in {"", "-", "N/A"}:
        return 0.0, False, original
    if "*" in original:
        return 0.0, True, original
    cleaned = re.sub(r"[^0-9.\-]", "", original.replace(",", ""))
    if not cleaned:
        return 0.0, False, original
    try:
        return float(cleaned), False, original
    except ValueError:
        return 0.0, False, original


def load_sheet_rows(path: Path) -> list[list[str]]:
    suffix = path.suffix.lower()
    if suffix == ".xlsx":
        if openpyxl is None:
            raise RuntimeError("Falta dependencia openpyxl para leer .xlsx")
        wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
        ws = wb.worksheets[0]
        rows: list[list[str]] = []
        for row in ws.iter_rows(values_only=True):
            rows.append([str(v).strip() if v is not None else "" for v in row])
        return rows
    if suffix == ".xls":
        if xlrd is None:
            raise RuntimeError("Falta dependencia xlrd para leer .xls")
        wb = xlrd.open_workbook(path.as_posix())
        sh = wb.sheet_by_index(0)
        rows = []
        for r in range(sh.nrows):
            row: list[str] = []
            for c in range(sh.ncols):
                value = sh.cell_value(r, c)
                if isinstance(value, float) and value.is_integer():
                    row.append(str(int(value)))
                else:
                    row.append(str(value).strip())
            rows.append(row)
        return rows
    raise RuntimeError(f"Formato no soportado: {suffix}")


def find_header_row_and_cols(rows: list[list[str]]) -> tuple[int, dict[str, int]]:
    for idx, row in enumerate(rows):
        norm = [norm_text(c) for c in row]
        if not norm:
            continue
        has_ref = any(c.startswith("REF") or c == "TIPO" for c in norm)
        has_desc = any("DESCRIPCION" in c for c in norm)
        has_mo = any("OBRA" in c or "M.O" in c for c in norm)
        has_pint = any("PINTURA" in c for c in norm)
        has_refacc = any("REFACC" in c for c in norm)
        has_total = any("T.O.T" in c or c.startswith("TOTAL") or c == "TOT" for c in norm)
        if has_ref and has_desc and has_mo and has_pint and has_refacc and has_total:
            cols: dict[str, int] = {}
            for col_idx, c in enumerate(norm):
                if "DESCRIPCION" in c and "desc" not in cols:
                    cols["desc"] = col_idx
                elif (c.startswith("REF") or c == "TIPO") and "ref" not in cols:
                    cols["ref"] = col_idx
                elif ("OBRA" in c or "M.O" in c) and "mo" not in cols:
                    cols["mo"] = col_idx
                elif "PINTURA" in c and "pint" not in cols:
                    cols["pint"] = col_idx
                elif "REFACC" in c and "refacc" not in cols:
                    cols["refacc"] = col_idx
                elif ("T.O.T" in c or c.startswith("TOTAL") or c == "TOT") and "tot" not in cols:
                    cols["tot"] = col_idx
            needed = {"ref", "desc", "mo", "pint", "refacc", "tot"}
            if needed.issubset(cols.keys()):
                return idx, cols
    raise RuntimeError("No se encontro fila de encabezados de lineas (REF/DESCRIPCION/MO/PINTURA/REFACC/TOTAL)")


def safe_cell(rows: list[list[str]], r: int, c: int) -> str:
    if r < 0 or r >= len(rows):
        return ""
    row = rows[r]
    if c < 0 or c >= len(row):
        return ""
    return str(row[c] or "").strip()


def find_value_after_label(rows: list[list[str]], label: str) -> str:
    target = norm_text(label)
    for r, row in enumerate(rows):
        for c, cell in enumerate(row):
            if norm_text(cell) == target:
                for offset in (1, 2, 3):
                    value = safe_cell(rows, r, c + offset)
                    if value:
                        return value
    return ""


def parse_document_metadata(rows: list[list[str]], filename: str) -> dict[str, str]:
    def _clean_value(raw: Any) -> str:
        text = str(raw or "").strip()
        if re.fullmatch(r"-?\d+\.0+", text):
            return text.split(".", 1)[0]
        return text

    # En layout Qualitas la mayoria de valores vienen en la fila siguiente
    # a la fila de etiquetas, en la misma columna.
    label_map = {
        "REPORTE": "reporte",
        "ASEGURADO": "cliente",
        "TEL CONTACTO": "telefono_contacto",
        "NO. ORDEN TALLER": "orden_taller",
        "NO ORDEN TALLER": "orden_taller",
        "FECHA INGRESO": "fecha_ingreso",
        "MARCA": "marca",
        "MODELO": "anio",
        "TIPO": "tipo_vehiculo",
        "PLACAS": "placas",
        "SERIE": "serie",
        "COLOR": "color",
        "TRANSMISION": "transmision",
        "KILOMETRAJE": "kilometraje",
        "PUERTAS": "puertas",
        "POLIZA": "poliza",
    }
    data = {
        "reporte": "",
        "cliente": "",
        "telefono_contacto": "",
        "orden_taller": "",
        "fecha_ingreso": "",
        "marca": "",
        "modelo": "",
        "anio": "",
        "tipo_vehiculo": "",
        "placas": "",
        "serie": "",
        "color": "",
        "transmision": "",
        "kilometraje": "",
        "puertas": "",
        "poliza": "",
        "folio": "",
    }
    all_labels = set(label_map.keys())
    for r in range(len(rows) - 1):
        label_row = rows[r]
        value_row = rows[r + 1]
        for c, cell in enumerate(label_row):
            normalized = norm_text(cell)
            key = label_map.get(normalized)
            if not key or data.get(key):
                continue
            value = _clean_value(value_row[c] if c < len(value_row) else "")
            if not value:
                continue
            if norm_text(value) in all_labels:
                continue
            data[key] = value

    # En estos formatos "MODELO" suele representar anio; mantenemos
    # tambien un campo "modelo" por si se desea completar posteriormente.
    if not data["modelo"]:
        data["modelo"] = data["anio"]
    if not data["folio"]:
        # Usa nombre de archivo como folio fallback.
        stem = Path(filename).stem
        data["folio"] = stem
    return data


def parse_lines(rows: list[list[str]], start_row: int, cols: dict[str, int]) -> list[ParsedLine]:
    parsed: list[ParsedLine] = []
    empty_streak = 0
    for r in range(start_row + 1, len(rows)):
        ref_tipo = safe_cell(rows, r, cols["ref"])
        descripcion = safe_cell(rows, r, cols["desc"])
        if not ref_tipo and not descripcion:
            empty_streak += 1
            if empty_streak >= 8:
                break
            continue
        empty_streak = 0

        mo, mo_pending, raw_mo = parse_amount(safe_cell(rows, r, cols["mo"]))
        pint, pint_pending, raw_pint = parse_amount(safe_cell(rows, r, cols["pint"]))
        refacc, ref_pending, raw_refacc = parse_amount(safe_cell(rows, r, cols["refacc"]))
        total, tot_pending, raw_tot = parse_amount(safe_cell(rows, r, cols["tot"]))
        calc = mo + pint + refacc
        total_missing = str(raw_tot or "").strip() == ""
        if total_missing and not tot_pending:
            # En varios layouts Qualitas el T.O.T. no viene capturado por linea.
            # En ese caso, el total de la linea se toma como suma de conceptos.
            total = calc
        diff = total - calc
        pending = mo_pending or pint_pending or ref_pending or tot_pending

        if not descripcion:
            # Si no hay descripcion no se considera linea util.
            continue

        parsed.append(
            ParsedLine(
                renglon=len(parsed) + 1,
                ref_tipo=ref_tipo,
                descripcion_pieza=descripcion,
                mano_obra=mo,
                pintura=pint,
                refacciones=refacc,
                total=total,
                diferencia_total=diff,
                tiene_valor_pendiente=pending,
                valor_raw_mano_obra=raw_mo,
                valor_raw_pintura=raw_pint,
                valor_raw_refacciones=raw_refacc,
                valor_raw_total=raw_tot,
            )
        )

    if not parsed:
        raise RuntimeError("No se extrajeron lineas del presupuesto")
    return parsed


def upload_to_s3(path: Path, bucket: str, prefix: str, s3_client: Any) -> str:
    key = f"{prefix.rstrip('/')}/{path.name}" if prefix else path.name
    s3_client.upload_file(str(path), bucket, key)
    return key


def ensure_schema(conn: psycopg.Connection) -> None:
    sql = DDL_SQL.read_text(encoding="utf-8")
    conn.execute(sql)


def hash_exists(conn: psycopg.Connection, file_hash: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM presupuesto_historico_documentos WHERE fuente_archivo_hash = %s LIMIT 1",
        (file_hash,),
    ).fetchone()
    return bool(row)


def log_error(
    conn: psycopg.Connection,
    filename: str,
    filepath: str,
    file_hash: str | None,
    stage: str,
    message: str,
    tb: str,
) -> None:
    conn.execute(
        """
        INSERT INTO presupuesto_historico_ingesta_errores (
          fuente_archivo_nombre,
          fuente_archivo_ruta,
          fuente_archivo_hash,
          error_etapa,
          error_mensaje,
          error_traceback
        )
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (filename, filepath, file_hash, stage, message[:4000], tb[:16000]),
    )


def insert_document(
    conn: psycopg.Connection,
    metadata: dict[str, str],
    file_name: str,
    file_path: str,
    file_hash: str,
    s3_bucket: str | None,
    s3_key: str | None,
    lines: list[ParsedLine],
) -> int:
    subtotal_mo = sum(l.mano_obra for l in lines)
    subtotal_pint = sum(l.pintura for l in lines)
    subtotal_refacc = sum(l.refacciones for l in lines)
    subtotal_total = sum(l.total for l in lines)
    mismatch_count = sum(1 for l in lines if abs(l.diferencia_total) > 0.5)
    pending_count = sum(1 for l in lines if l.tiene_valor_pendiente)
    observations = []
    if mismatch_count:
        observations.append(f"{mismatch_count} lineas con diferencia entre total y suma de conceptos.")
    if pending_count:
        observations.append(f"{pending_count} lineas con valores pendientes ('*').")

    row = conn.execute(
        """
        INSERT INTO presupuesto_historico_documentos (
          aseguradora,
          layout_version,
          moneda,
          reporte,
          folio,
          cliente,
          telefono_contacto,
          orden_taller,
          fecha_ingreso,
          marca,
          modelo,
          anio,
          tipo_vehiculo,
          placas,
          serie,
          color,
          transmision,
          kilometraje,
          puertas,
          poliza,
          fuente_archivo_nombre,
          fuente_archivo_ruta,
          fuente_archivo_hash,
          fuente_s3_bucket,
          fuente_s3_key,
          lineas_count,
          subtotal_mano_obra,
          subtotal_pintura,
          subtotal_refacciones,
          subtotal_total,
          observaciones
        )
        VALUES (
          'QUALITAS',
          'qualitas_v1',
          'MXN',
          %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
          %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
        )
        RETURNING id
        """,
        (
            metadata.get("reporte"),
            metadata.get("folio"),
            metadata.get("cliente"),
            metadata.get("telefono_contacto"),
            metadata.get("orden_taller"),
            metadata.get("fecha_ingreso"),
            metadata.get("marca"),
            metadata.get("modelo"),
            metadata.get("anio"),
            metadata.get("tipo_vehiculo"),
            metadata.get("placas"),
            metadata.get("serie"),
            metadata.get("color"),
            metadata.get("transmision"),
            metadata.get("kilometraje"),
            metadata.get("puertas"),
            metadata.get("poliza"),
            file_name,
            file_path,
            file_hash,
            s3_bucket,
            s3_key,
            len(lines),
            subtotal_mo,
            subtotal_pint,
            subtotal_refacc,
            subtotal_total,
            " ".join(observations) if observations else None,
        ),
    ).fetchone()
    if row is None:
        raise RuntimeError("No se pudo obtener id del documento insertado")
    if isinstance(row, dict):
        return int(row["id"])
    return int(row[0])


def insert_lines(conn: psycopg.Connection, document_id: int, lines: list[ParsedLine]) -> None:
    for line in lines:
        conn.execute(
            """
            INSERT INTO presupuesto_historico_lineas (
              documento_id,
              renglon,
              ref_tipo,
              descripcion_pieza,
              mano_obra,
              pintura,
              refacciones,
              total,
              diferencia_total,
              tiene_valor_pendiente,
              valor_raw_mano_obra,
              valor_raw_pintura,
              valor_raw_refacciones,
              valor_raw_total
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                document_id,
                line.renglon,
                line.ref_tipo,
                line.descripcion_pieza,
                line.mano_obra,
                line.pintura,
                line.refacciones,
                line.total,
                line.diferencia_total,
                line.tiene_valor_pendiente,
                line.valor_raw_mano_obra,
                line.valor_raw_pintura,
                line.valor_raw_refacciones,
                line.valor_raw_total,
            ),
        )


def iter_files(input_dir: Path, recursive: bool) -> list[Path]:
    pattern = "**/*" if recursive else "*"
    files = []
    for p in input_dir.glob(pattern):
        if not p.is_file():
            continue
        if p.suffix.lower() not in {".xls", ".xlsx"}:
            continue
        files.append(p)
    files.sort()
    return files


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingesta batch de presupuestos historicos Qualitas")
    parser.add_argument("--input-dir", required=True, help="Carpeta con .xls/.xlsx")
    parser.add_argument("--recursive", action="store_true", help="Busca archivos recursivamente")
    parser.add_argument("--db-url", default=os.getenv("DATABASE_URL", ""), help="DSN PostgreSQL")
    parser.add_argument("--ensure-schema", action="store_true", help="Ejecuta DDL antes de ingerir")
    parser.add_argument("--s3-bucket", default="", help="Bucket S3 destino (opcional)")
    parser.add_argument("--s3-prefix", default="historicos/qualitas", help="Prefijo S3")
    parser.add_argument("--dry-run", action="store_true", help="Solo parsea y valida, no inserta")
    parser.add_argument("--limit", type=int, default=0, help="Procesa solo N archivos")
    args = parser.parse_args()

    input_dir = Path(args.input_dir).resolve()
    if not input_dir.exists() or not input_dir.is_dir():
        print(f"[ERROR] Ruta invalida: {input_dir}")
        return 1

    if not args.db_url and not args.dry_run:
        print("[ERROR] Falta --db-url o variable DATABASE_URL")
        return 1

    files = iter_files(input_dir, args.recursive)
    if args.limit and args.limit > 0:
        files = files[: args.limit]
    if not files:
        print("[INFO] No se encontraron archivos Excel para procesar.")
        return 0

    print(f"[INFO] Archivos encontrados: {len(files)}")
    s3_client = boto3.client("s3") if args.s3_bucket else None

    if args.dry_run:
        ok = 0
        err = 0
        for path in files:
            try:
                rows = load_sheet_rows(path)
                header_row, cols = find_header_row_and_cols(rows)
                _meta = parse_document_metadata(rows, path.name)
                _lines = parse_lines(rows, header_row, cols)
                ok += 1
                print(f"[OK][DRY] {path.name} -> lineas={len(_lines)}")
            except Exception as exc:
                err += 1
                print(f"[ERR][DRY] {path.name}: {exc}")
        print(f"[DONE][DRY] ok={ok} error={err}")
        return 0 if err == 0 else 2

    conn = psycopg.connect(normalize_dsn(args.db_url), autocommit=False)
    conn.row_factory = dict_row
    ok = 0
    skipped = 0
    err = 0
    try:
        if args.ensure_schema:
            ensure_schema(conn)
            conn.commit()
            print("[INFO] Esquema verificado/aplicado.")

        for path in files:
            file_hash = None
            try:
                file_hash = file_hash_sha256(path)
                if hash_exists(conn, file_hash):
                    skipped += 1
                    print(f"[SKIP] {path.name} (hash ya existe)")
                    continue

                rows = load_sheet_rows(path)
                header_row, cols = find_header_row_and_cols(rows)
                metadata = parse_document_metadata(rows, path.name)
                lines = parse_lines(rows, header_row, cols)

                s3_key = None
                if s3_client:
                    s3_key = upload_to_s3(path, args.s3_bucket, args.s3_prefix, s3_client)

                doc_id = insert_document(
                    conn=conn,
                    metadata=metadata,
                    file_name=path.name,
                    file_path=str(path),
                    file_hash=file_hash,
                    s3_bucket=args.s3_bucket or None,
                    s3_key=s3_key,
                    lines=lines,
                )
                insert_lines(conn, doc_id, lines)
                conn.commit()
                ok += 1
                print(f"[OK] {path.name} -> documento_id={doc_id}, lineas={len(lines)}")
            except Exception as exc:
                conn.rollback()
                err += 1
                tb = traceback.format_exc()
                try:
                    log_error(
                        conn=conn,
                        filename=path.name,
                        filepath=str(path),
                        file_hash=file_hash,
                        stage="ingesta",
                        message=str(exc),
                        tb=tb,
                    )
                    conn.commit()
                except Exception:
                    conn.rollback()
                print(f"[ERR] {path.name}: {type(exc).__name__}: {exc}")
        print(f"[DONE] ok={ok} skip={skipped} error={err}")
    finally:
        conn.close()

    return 0 if err == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
