import math
import re
import unicodedata
from io import BytesIO
from pathlib import Path
from statistics import median

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from psycopg.rows import dict_row
import xlsxwriter

from app.core.db import get_connection

router = APIRouter(prefix="/valuacion", tags=["valuacion"])


def _ensure_detalle_columns(conn):
    conn.execute(
        """
        ALTER TABLE valuacion_detalle
        ADD COLUMN IF NOT EXISTS mano_obra NUMERIC(12,2) NOT NULL DEFAULT 0
        """
    )
    conn.execute(
        """
        ALTER TABLE valuacion_detalle
        ADD COLUMN IF NOT EXISTS pintura NUMERIC(12,2) NOT NULL DEFAULT 0
        """
    )
    conn.execute(
        """
        ALTER TABLE valuacion_detalle
        ADD COLUMN IF NOT EXISTS refacciones NUMERIC(12,2) NOT NULL DEFAULT 0
        """
    )


def _normalize_text(value: str | None) -> str:
    text = str(value or "").strip().lower()
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _normalize_part_text(value: str | None) -> str:
    text = _normalize_text(value)
    aliases = {
        "facia": "fascia",
        "tolva interior": "tolva",
        "tolva ext": "tolva",
        "salpicadera der": "salpicadera derecha",
        "salpicadera izq": "salpicadera izquierda",
        "puerta delantera der": "puerta delantera derecha",
        "puerta delantera izq": "puerta delantera izquierda",
    }
    for source, target in aliases.items():
        text = re.sub(rf"\b{re.escape(source)}\b", target, text)
    return re.sub(r"\s+", " ", text).strip()


def _safe_float(value, default: float = 0.0) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return default


def _match_catalog_part(description_norm: str, catalog: list[dict]) -> str:
    best = ""
    best_len = 0
    for item in catalog:
        part_raw = item.get("nb_parte") or ""
        part_norm = item.get("_norm") or ""
        if not part_norm:
            continue
        if part_norm in description_norm and len(part_norm) > best_len:
            best = part_raw
            best_len = len(part_norm)
    return best


def _percentile(sorted_values: list[float], p: float) -> float:
    if not sorted_values:
        return 0.0
    if len(sorted_values) == 1:
        return sorted_values[0]
    idx = (len(sorted_values) - 1) * p
    lo = int(math.floor(idx))
    hi = int(math.ceil(idx))
    if lo == hi:
        return sorted_values[lo]
    frac = idx - lo
    return sorted_values[lo] * (1 - frac) + sorted_values[hi] * frac


def _iqr_trim(values: list[float]) -> list[float]:
    if len(values) < 6:
        return values
    clean = sorted(values)
    q1 = _percentile(clean, 0.25)
    q3 = _percentile(clean, 0.75)
    iqr = q3 - q1
    if iqr <= 0:
        return values
    low = q1 - 1.5 * iqr
    high = q3 + 1.5 * iqr
    trimmed = [v for v in values if low <= v <= high]
    return trimmed or values


STOPWORDS = {
    "de", "la", "el", "los", "las", "del", "y", "con", "sin", "para", "por", "en",
    "izquierda", "derecha", "delantera", "trasera", "completo", "completa",
}


def _keyword_tokens(value: str | None) -> set[str]:
    text = _normalize_part_text(value)
    tokens = [t for t in text.split(" ") if len(t) >= 4 and t not in STOPWORDS]
    return set(tokens)


@router.get("/health")
def health_check():
    return {"module": "valuacion", "status": "ok"}


@router.get("/vehiculos")
def list_vehiculos_valuacion():
    with get_connection() as conn:
        conn.row_factory = dict_row
        rows = conn.execute(
            """
            SELECT
                id,
                reporte_siniestro,
                seguro_comp,
                fecha_adm,
                nb_cliente,
                tel_cliente,
                marca_vehiculo,
                tipo_vehiculo,
                modelo_anio,
                color_vehiculo,
                serie_auto,
                placas,
                danos_siniestro,
                descripcion_siniestro,
                COALESCE(estatus, 'Pendiente Valuacion') AS estatus,
                GREATEST(
                    0,
                    (CURRENT_DATE - DATE(fecha_adm))
                )::int AS dias_espera
            FROM orden_admision
            ORDER BY fecha_adm ASC, id ASC
            """
        ).fetchall()

    payload = []
    for row in rows:
        vehiculo_display = " ".join(
            str(item)
            for item in [
                row.get("marca_vehiculo"),
                row.get("modelo_anio"),
                row.get("tipo_vehiculo"),
                row.get("color_vehiculo"),
            ]
            if item
        ).strip()

        payload.append(
            {
                "id": row.get("id"),
                "reporte_siniestro": row.get("reporte_siniestro"),
                "seguro_comp": row.get("seguro_comp"),
                "fecha_adm": row.get("fecha_adm"),
                "nb_cliente": row.get("nb_cliente"),
                "tel_cliente": row.get("tel_cliente"),
                "vehiculo": vehiculo_display,
                "serie_auto": row.get("serie_auto"),
                "placas": row.get("placas"),
                "danos_siniestro": row.get("danos_siniestro"),
                "descripcion_siniestro": row.get("descripcion_siniestro"),
                "estatus": row.get("estatus"),
                "dias_espera": row.get("dias_espera") or 0,
            }
        )

    return payload


class ValuacionDetalle(BaseModel):
    tipo: str
    descripcion: str
    monto: float
    mano_obra: float = 0
    pintura: float = 0
    refacciones: float = 0


class ValuacionPayload(BaseModel):
    aseguradora_activa: str | None = None
    autorizado_aseguradora: float | None = None
    observaciones: str | None = None
    detalle: list[ValuacionDetalle] = []


class QualitasExportPayload(BaseModel):
    nb_cliente: str | None = None
    tel_cliente: str | None = None
    fecha_adm: str | None = None
    reporte_siniestro: str | None = None
    marca_vehiculo: str | None = None
    color_vehiculo: str | None = None
    tipo_vehiculo: str | None = None
    placas: str | None = None
    transmision: str | None = None
    poliza: str | None = None
    modelo_anio: str | None = None
    serie_auto: str | None = None
    puertas: str | None = None
    observaciones: str | None = None
    detalle: list[ValuacionDetalle] = []


@router.get("/ordenes/{orden_id}/sugerencias")
def suggest_valuacion_by_orden(
    orden_id: int,
    limit: int = Query(default=12, ge=1, le=80),
    min_confidence: float = Query(default=0.62, ge=0.0, le=1.0),
    min_samples: int = Query(default=2, ge=1, le=50),
    context: str = Query(default="", max_length=1200),
):
    with get_connection() as conn:
        conn.row_factory = dict_row
        orden = conn.execute(
            """
            SELECT
              id,
              seguro_comp,
              marca_vehiculo,
              tipo_vehiculo,
              modelo_anio,
              danos_siniestro,
              descripcion_siniestro
            FROM orden_admision
            WHERE id = %s
            """,
            (orden_id,),
        ).fetchone()
        if not orden:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Orden de admision no encontrada",
            )

        partes_auto = conn.execute(
            """
            SELECT nb_parte
            FROM partes_auto
            ORDER BY nb_parte ASC
            """
        ).fetchall()
        catalog = []
        for row in partes_auto:
            nb_parte = (row.get("nb_parte") or "").strip()
            if not nb_parte:
                continue
            catalog.append({"nb_parte": nb_parte, "_norm": _normalize_text(nb_parte)})

        hist_rows = conn.execute(
            """
            SELECT
              l.ref_tipo,
              l.descripcion_pieza,
              l.mano_obra,
              l.pintura,
              l.refacciones,
              l.total,
              d.marca,
              d.tipo_vehiculo,
              d.anio,
              d.aseguradora
            FROM presupuesto_historico_lineas l
            JOIN presupuesto_historico_documentos d ON d.id = l.documento_id
            WHERE l.descripcion_pieza IS NOT NULL
              AND TRIM(l.descripcion_pieza) <> ''
            ORDER BY l.id DESC
            """
        ).fetchall()

    if not hist_rows:
        return {
            "orden_id": orden_id,
            "vehiculo": {
                "marca": orden.get("marca_vehiculo"),
                "tipo_vehiculo": orden.get("tipo_vehiculo"),
                "modelo_anio": orden.get("modelo_anio"),
                "aseguradora": orden.get("seguro_comp"),
            },
            "items": [],
            "stats": {"total_historicos": 0, "candidatos": 0},
        }

    target_marca = _normalize_text(orden.get("marca_vehiculo"))
    target_tipo = _normalize_text(orden.get("tipo_vehiculo"))
    target_aseguradora = _normalize_text(orden.get("seguro_comp"))
    target_anio_raw = str(orden.get("modelo_anio") or "").strip()
    target_anio = int(target_anio_raw) if target_anio_raw.isdigit() else None
    context_text = " ".join(
        part
        for part in [
            context,
            orden.get("danos_siniestro"),
            orden.get("descripcion_siniestro"),
        ]
        if part
    )
    context_tokens = _keyword_tokens(context_text)

    enriched = []
    for row in hist_rows:
        desc = (row.get("descripcion_pieza") or "").strip()
        if not desc:
            continue
        desc_norm = _normalize_part_text(desc)
        if not desc_norm:
            continue
        hist_anio_raw = str(row.get("anio") or "").strip()
        hist_anio = int(hist_anio_raw) if hist_anio_raw.isdigit() else None
        enriched.append(
            {
                **row,
                "_desc_norm": desc_norm,
                "_marca": _normalize_text(row.get("marca")),
                "_tipo": _normalize_text(row.get("tipo_vehiculo")),
                "_aseguradora": _normalize_text(row.get("aseguradora")),
                "_anio": hist_anio,
            }
        )

    def _filter_level(level: str, rows: list[dict]) -> list[dict]:
        if level == "strict":
            return [
                r
                for r in rows
                if r["_marca"] == target_marca
                and (not target_tipo or r["_tipo"] == target_tipo)
                and (not target_anio or (r["_anio"] and abs(r["_anio"] - target_anio) <= 1))
                and (not target_aseguradora or r["_aseguradora"] == target_aseguradora)
            ]
        if level == "brand_type_year":
            return [
                r
                for r in rows
                if r["_marca"] == target_marca
                and (not target_tipo or r["_tipo"] == target_tipo)
                and (not target_anio or (r["_anio"] and abs(r["_anio"] - target_anio) <= 1))
            ]
        if level == "brand_type":
            return [
                r
                for r in rows
                if r["_marca"] == target_marca and (not target_tipo or r["_tipo"] == target_tipo)
            ]
        if level == "brand":
            return [r for r in rows if r["_marca"] == target_marca]
        return rows

    levels = [
        ("strict", 18),
        ("brand_type_year", 18),
        ("brand_type", 24),
        ("brand", 32),
        ("all", 1),
    ]
    selected_level = "all"
    selected_rows: list[dict] = enriched
    for level_name, min_rows_needed in levels:
        rows_for_level = _filter_level(level_name, enriched)
        if len(rows_for_level) >= min_rows_needed:
            selected_level = level_name
            selected_rows = rows_for_level
            break

    grouped: dict[str, dict] = {}
    candidate_rows = 0
    for row in selected_rows:
        desc_norm = row["_desc_norm"]
        matched_part = _match_catalog_part(desc_norm, catalog)
        canonical = matched_part.strip() if matched_part else (row.get("descripcion_pieza") or "").strip()
        key = _normalize_part_text(canonical)
        if not key:
            continue

        score = 0.0
        if target_marca and row["_marca"] == target_marca:
            score += 4.0
        if target_tipo and row["_tipo"] == target_tipo:
            score += 3.0
        if target_aseguradora and row["_aseguradora"] == target_aseguradora:
            score += 2.0
        if target_anio and row["_anio"]:
            if row["_anio"] == target_anio:
                score += 2.0
            elif abs(row["_anio"] - target_anio) <= 1:
                score += 1.0

        overlap = 0
        if context_tokens:
            desc_tokens = _keyword_tokens(key)
            overlap = len(context_tokens.intersection(desc_tokens))
            if overlap == 0 and score < 7:
                continue
            score += min(3.0, overlap * 0.8)
        candidate_rows += 1

        bucket = grouped.setdefault(
            key,
            {
                "descripcion": canonical,
                "tipo": (row.get("ref_tipo") or "SUST").strip() or "SUST",
                "mano_obra": [],
                "pintura": [],
                "refacciones": [],
                "total": [],
                "score_sum": 0.0,
                "context_hits": 0,
                "count": 0,
            },
        )

        mo = max(0.0, _safe_float(row.get("mano_obra"), 0.0))
        pintura = max(0.0, _safe_float(row.get("pintura"), 0.0))
        refacciones = max(0.0, _safe_float(row.get("refacciones"), 0.0))
        total = max(0.0, _safe_float(row.get("total"), mo + pintura + refacciones))
        if total <= 0 and (mo > 0 or pintura > 0 or refacciones > 0):
            total = mo + pintura + refacciones

        bucket["mano_obra"].append(mo)
        bucket["pintura"].append(pintura)
        bucket["refacciones"].append(refacciones)
        bucket["total"].append(total)
        bucket["score_sum"] += score
        bucket["context_hits"] += overlap
        bucket["count"] += 1

    ranked = []
    for bucket in grouped.values():
        count = int(bucket["count"])
        if count < min_samples:
            continue

        mo_vals = _iqr_trim(bucket["mano_obra"])
        pi_vals = _iqr_trim(bucket["pintura"])
        re_vals = _iqr_trim(bucket["refacciones"])
        to_vals = _iqr_trim(bucket["total"])
        mo_m = round(float(median(mo_vals)), 2)
        pi_m = round(float(median(pi_vals)), 2)
        re_m = round(float(median(re_vals)), 2)
        to_m = round(float(median(to_vals)), 2)
        if to_m <= 0:
            to_m = round(mo_m + pi_m + re_m, 2)

        avg_score = bucket["score_sum"] / max(1, count)
        confidence = (
            0.30
            + min(0.40, math.log10(count + 1) / 2.5)
            + min(0.20, avg_score / 12)
            + min(0.07, bucket["context_hits"] * 0.01)
        )
        level_penalty = {"strict": 0.0, "brand_type_year": 0.03, "brand_type": 0.06, "brand": 0.10, "all": 0.15}
        confidence = max(0.0, min(0.97, confidence - level_penalty.get(selected_level, 0.1)))

        if confidence < min_confidence:
            continue
        ranked.append(
            {
                "tipo": bucket["tipo"],
                "descripcion": bucket["descripcion"],
                "mano_obra": mo_m,
                "pintura": pi_m,
                "refacciones": re_m,
                "monto": to_m,
                "confianza": round(float(confidence), 3),
                "muestras": count,
                "score": round(bucket["score_sum"], 2),
            }
        )

    ranked.sort(key=lambda x: (x["confianza"], x["muestras"], x["score"]), reverse=True)
    items = ranked[:limit]
    return {
        "orden_id": orden_id,
        "vehiculo": {
            "marca": orden.get("marca_vehiculo"),
            "tipo_vehiculo": orden.get("tipo_vehiculo"),
            "modelo_anio": orden.get("modelo_anio"),
            "aseguradora": orden.get("seguro_comp"),
        },
        "items": items,
        "stats": {
            "total_historicos": len(hist_rows),
            "candidatos": candidate_rows,
            "grupos": len(grouped),
            "devueltos": len(items),
            "nivel": selected_level,
            "contexto_tokens": len(context_tokens),
        },
    }


@router.get("/ordenes/{orden_id}")
def get_valuacion_by_orden(orden_id: int):
    with get_connection() as conn:
        _ensure_detalle_columns(conn)
        conn.row_factory = dict_row
        valuacion = conn.execute(
            """
            SELECT id, orden_admision_id, aseguradora_activa, autorizado_aseguradora, observaciones
            FROM valuaciones
            WHERE orden_admision_id = %s
            """,
            (orden_id,),
        ).fetchone()
        if not valuacion:
            return {"orden_admision_id": orden_id, "detalle": []}

        detalle = conn.execute(
            """
            SELECT
                id,
                tipo,
                descripcion,
                monto,
                COALESCE(mano_obra, 0)::float8 AS mano_obra,
                COALESCE(pintura, 0)::float8 AS pintura,
                COALESCE(refacciones, 0)::float8 AS refacciones
            FROM valuacion_detalle
            WHERE valuacion_id = %s
            ORDER BY id ASC
            """,
            (valuacion["id"],),
        ).fetchall()

    return {**valuacion, "detalle": detalle}


@router.post("/ordenes/{orden_id}", status_code=status.HTTP_201_CREATED)
def upsert_valuacion_by_orden(orden_id: int, payload: ValuacionPayload):
    with get_connection() as conn:
        _ensure_detalle_columns(conn)
        conn.row_factory = dict_row
        orden = conn.execute(
            "SELECT id FROM orden_admision WHERE id = %s",
            (orden_id,),
        ).fetchone()
        if not orden:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Orden de admision no encontrada",
            )

        row = conn.execute(
            "SELECT id FROM valuaciones WHERE orden_admision_id = %s",
            (orden_id,),
        ).fetchone()
        if row:
            conn.execute(
                """
                UPDATE valuaciones
                SET aseguradora_activa = %s,
                    autorizado_aseguradora = %s,
                    observaciones = %s,
                    updated_at = NOW()
                WHERE orden_admision_id = %s
                """,
                (
                    payload.aseguradora_activa,
                    payload.autorizado_aseguradora,
                    payload.observaciones,
                    orden_id,
                ),
            )
            valuacion_id = row["id"]
        else:
            row = conn.execute(
                """
                INSERT INTO valuaciones (orden_admision_id, aseguradora_activa, autorizado_aseguradora, observaciones)
                VALUES (%s, %s, %s, %s)
                RETURNING id
                """,
                (
                    orden_id,
                    payload.aseguradora_activa,
                    payload.autorizado_aseguradora,
                    payload.observaciones,
                ),
            ).fetchone()
            valuacion_id = row["id"]

        conn.execute("DELETE FROM valuacion_detalle WHERE valuacion_id = %s", (valuacion_id,))
        for item in payload.detalle:
            conn.execute(
                """
                INSERT INTO valuacion_detalle (
                    valuacion_id,
                    tipo,
                    descripcion,
                    monto,
                    mano_obra,
                    pintura,
                    refacciones
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    valuacion_id,
                    item.tipo,
                    item.descripcion,
                    item.monto,
                    item.mano_obra,
                    item.pintura,
                    item.refacciones,
                ),
            )

        # Al guardar una valuacion se marca como borrador.
        conn.execute(
            """
            UPDATE orden_admision
            SET estatus = 'Borrador'
            WHERE id = %s
            """,
            (orden_id,),
        )

    return {"id": valuacion_id, "estatus": "Borrador"}


@router.post("/ordenes/{orden_id}/export-qualitas")
def export_qualitas_budget(orden_id: int, payload: QualitasExportPayload):
    detalle = payload.detalle[:8]

    mano_obra_total = round(sum(_safe_float(item.mano_obra) for item in detalle), 2)
    pintura_total = round(sum(_safe_float(item.pintura) for item in detalle), 2)
    refacciones_total = round(sum(_safe_float(item.refacciones) for item in detalle), 2)
    total_general = round(sum(_safe_float(item.monto) for item in detalle), 2)

    output = BytesIO()
    workbook = xlsxwriter.Workbook(output, {"in_memory": True})
    sheet = workbook.add_worksheet("VALUACION")

    # Estructura principal del formato Qualitas.
    sheet.set_landscape()
    sheet.set_paper(9)
    sheet.fit_to_pages(1, 1)
    sheet.set_margins(0.3, 0.3, 0.5, 0.5)
    # Oculta cuadricula de Excel para que solo se vean los bordes del formato.
    sheet.hide_gridlines(2)
    sheet.set_zoom(100)
    sheet.set_column("A:A", 14)
    sheet.set_column("B:B", 20)
    sheet.set_column("C:C", 13)
    sheet.set_column("D:D", 16)
    sheet.set_column("E:E", 16)
    sheet.set_column("F:F", 10)
    sheet.set_column("G:G", 10)
    sheet.set_column("H:H", 10)
    sheet.set_column("I:I", 10)

    bold_center = workbook.add_format({"bold": True, "align": "center", "valign": "vcenter"})
    header = workbook.add_format(
        {"bold": True, "align": "center", "valign": "vcenter", "border": 1}
    )
    cell = workbook.add_format({"align": "left", "valign": "vcenter", "border": 1})
    cell_center = workbook.add_format({"align": "center", "valign": "vcenter", "border": 1})
    cell_num = workbook.add_format(
        {"align": "right", "valign": "vcenter", "border": 1, "num_format": "#,##0.00"}
    )
    total_label = workbook.add_format(
        {"bold": True, "align": "right", "valign": "vcenter", "border": 1}
    )
    total_value = workbook.add_format(
        {"bold": True, "align": "right", "valign": "vcenter", "border": 1, "num_format": "#,##0.00"}
    )
    bold_left = workbook.add_format({"bold": True, "align": "left", "valign": "vcenter", "border": 1})
    blue_bold_center = workbook.add_format(
        {"bold": True, "align": "center", "valign": "vcenter", "border": 1, "font_color": "#0000FF"}
    )
    no_border = workbook.add_format({"align": "left", "valign": "vcenter"})

    for row in range(1, 45):
        sheet.set_row(row - 1, 22 if row in (3, 4) else 20)

    # Logo (opcional): primero frontend/public/assets y luego backend/app/static.
    workspace_root = Path(__file__).resolve().parents[4]
    logo_candidates = [
        workspace_root / "frontend" / "public" / "assets" / "Logo_Presupusto_qualitas.png",
        Path(__file__).resolve().parents[2] / "static" / "qualitas_logo.png",
    ]
    logo_path = next((candidate for candidate in logo_candidates if candidate.exists()), None)
    if logo_path:
        sheet.insert_image("A2", str(logo_path), {"x_scale": 0.34, "y_scale": 0.34})

    # Encabezado.
    sheet.merge_range("B3:E4", "PRESUPUESTO DE VALUACION", bold_center)
    sheet.merge_range("A5:E5", "ASEGURADO", header)
    sheet.merge_range("F5:G5", "Tel contacto", header)
    sheet.merge_range("H5:I5", "Fecha ingreso", header)
    sheet.merge_range("A6:E6", payload.nb_cliente or "", cell_center)
    sheet.merge_range("F6:G6", payload.tel_cliente or "", cell_center)
    sheet.merge_range("H6:I6", payload.fecha_adm or "", cell_center)
    sheet.merge_range("A7:E7", "TERCERO:", header)
    sheet.merge_range("F7:G7", "Cel contacto", header)
    sheet.merge_range("H7:I7", "No. orden taller", header)
    sheet.merge_range("A8:E8", "", cell)
    sheet.merge_range("F8:G8", "", cell)
    sheet.merge_range("H8:I8", "", cell)

    # Datos del vehiculo.
    sheet.write("A9", "Reporte", bold_left)
    sheet.merge_range("B9:C9", "Marca", header)
    sheet.merge_range("D9:E9", "Kilometraje", header)
    sheet.merge_range("F9:G9", "Color", header)
    sheet.merge_range("H9:I9", "", header)
    sheet.write("A10", payload.reporte_siniestro or "", blue_bold_center)
    sheet.merge_range("B10:C10", payload.marca_vehiculo or "", cell_center)
    sheet.merge_range("D10:E10", "", cell_center)
    sheet.merge_range("F10:G10", payload.color_vehiculo or "", cell_center)
    sheet.merge_range("H10:I10", "", cell_center)

    sheet.write("A11", "Siniestro", bold_left)
    sheet.merge_range("B11:C11", "Tipo", header)
    sheet.merge_range("D11:E11", "Placas", header)
    sheet.merge_range("F11:G11", "Transmision", header)
    sheet.merge_range("H11:I11", "", header)
    sheet.write("A12", "", cell_center)
    sheet.merge_range("B12:C12", payload.tipo_vehiculo or "", cell_center)
    sheet.merge_range("D12:E12", payload.placas or "", cell_center)
    sheet.merge_range("F12:G12", payload.transmision or "", blue_bold_center)
    sheet.merge_range("H12:I12", "", cell_center)

    sheet.write("A13", "Poliza", bold_left)
    sheet.merge_range("B13:C13", "Modelo", header)
    sheet.merge_range("D13:E13", "Serie", header)
    sheet.merge_range("F13:G13", "Puertas", header)
    sheet.merge_range("H13:I13", "", header)
    sheet.write("A14", payload.poliza or "", cell_center)
    sheet.merge_range("B14:C14", payload.modelo_anio or "", cell_center)
    sheet.merge_range("D14:E14", payload.serie_auto or "", cell_center)
    sheet.merge_range("F14:G14", payload.puertas or "", cell_center)
    sheet.merge_range("H14:I14", "", cell_center)

    # Tabla de operaciones.
    sheet.write("A15", "REF.:", header)
    sheet.merge_range("B15:E15", "DESCRIPCION DE LA PIEZA", header)
    sheet.write("F15", "M. DE OBRA", header)
    sheet.write("G15", "PINTURA", header)
    sheet.write("H15", "REFACC.", header)
    sheet.write("I15", "T.O.T.", header)

    for idx in range(8):
        row = 16 + idx
        item = detalle[idx] if idx < len(detalle) else None
        tipo = (item.tipo if item else "") or ""
        if str(tipo).strip().upper() == "SUST":
            tipo = "SUSTITUCION"
        descripcion = (item.descripcion if item else "") or ""
        mano_obra = _safe_float(item.mano_obra if item else 0)
        pintura = _safe_float(item.pintura if item else 0)
        refacciones = _safe_float(item.refacciones if item else 0)
        monto = _safe_float(item.monto if item else 0)

        sheet.write(f"A{row}", tipo, cell)
        sheet.merge_range(f"B{row}:E{row}", descripcion, cell)
        sheet.write_number(f"F{row}", mano_obra, cell_num)
        sheet.write_number(f"G{row}", pintura, cell_num)
        sheet.write_number(f"H{row}", refacciones, cell_num)
        sheet.write_number(f"I{row}", monto, cell_num)

    sheet.merge_range("A24:E24", "TOTALES:", total_label)
    sheet.write_number("F24", mano_obra_total, total_value)
    sheet.write_number("G24", pintura_total, total_value)
    sheet.write_number("H24", refacciones_total, total_value)
    sheet.write_number("I24", total_general, total_value)

    # Totales inferiores.
    sheet.merge_range("A26:B26", "MANO DE OBRA:", cell)
    sheet.merge_range("C26:E26", mano_obra_total, cell_num)
    sheet.merge_range("A28:B28", "PINTURA", cell)
    sheet.merge_range("C28:E28", pintura_total, cell_num)
    sheet.merge_range("A30:B30", "REFACCIONES:", cell)
    sheet.merge_range("C30:E30", refacciones_total, cell_num)
    sheet.merge_range("A32:B32", "TOT", cell)
    sheet.merge_range("C32:E32", total_general, cell_num)
    sheet.merge_range("A34:E34", "", cell)

    sheet.merge_range("F26:G26", "TOTAL HRS", cell)
    sheet.write("H26", "$", cell_center)
    sheet.write_number("I26", total_general, cell_num)
    sheet.merge_range("F28:I28", "", cell)
    sheet.merge_range("F30:G30", "DEDUCIBLE:", cell)
    sheet.write("H30", "$", cell_center)
    sheet.write("I30", "", cell_center)
    sheet.merge_range("F32:G32", "OTROS", cell)
    sheet.merge_range("H32:I32", "", cell)
    sheet.merge_range("F34:G34", "TOTAL:", total_label)
    sheet.merge_range("H34:I34", total_general, total_value)

    # Observaciones.
    sheet.merge_range("A37:I37", "OBSERVACIONES", no_border)
    sheet.merge_range("A38:I38", payload.observaciones or "", no_border)
    sheet.merge_range("A39:I39", "", no_border)
    sheet.write("A40", "_" * 120, no_border)
    sheet.write("A41", "_" * 120, no_border)

    workbook.close()
    output.seek(0)

    reporte = re.sub(r"[^A-Za-z0-9_-]", "", str(payload.reporte_siniestro or "")) or f"orden_{orden_id}"
    filename = f"{reporte}_presupuesto_qualitas.xlsx"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers,
    )
