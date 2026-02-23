import math
import re
import unicodedata
from statistics import median

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from psycopg.rows import dict_row

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


@router.get("/ordenes/{orden_id}/sugerencias")
def suggest_valuacion_by_orden(
    orden_id: int,
    limit: int = Query(default=20, ge=1, le=80),
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
              modelo_anio
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

    grouped: dict[str, dict] = {}
    candidate_rows = 0
    for row in hist_rows:
        desc = (row.get("descripcion_pieza") or "").strip()
        if not desc:
            continue
        desc_norm = _normalize_text(desc)
        if not desc_norm:
            continue

        hist_marca = _normalize_text(row.get("marca"))
        hist_tipo = _normalize_text(row.get("tipo_vehiculo"))
        hist_aseguradora = _normalize_text(row.get("aseguradora"))
        hist_anio_raw = str(row.get("anio") or "").strip()
        hist_anio = int(hist_anio_raw) if hist_anio_raw.isdigit() else None

        score = 0.0
        if target_aseguradora and hist_aseguradora == target_aseguradora:
            score += 2.0
        if target_marca and hist_marca == target_marca:
            score += 4.0
        if target_tipo and (target_tipo == hist_tipo or target_tipo in hist_tipo or hist_tipo in target_tipo):
            score += 3.0
        if target_anio and hist_anio:
            if target_anio == hist_anio:
                score += 2.0
            elif abs(target_anio - hist_anio) <= 1:
                score += 1.0
        if score <= 0:
            continue

        candidate_rows += 1
        matched_part = _match_catalog_part(desc_norm, catalog)
        canonical = matched_part.strip() if matched_part else desc.strip()
        key = _normalize_text(canonical)
        if not key:
            continue

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
                "count": 0,
            },
        )
        mo = max(0.0, _safe_float(row.get("mano_obra"), 0.0))
        pintura = max(0.0, _safe_float(row.get("pintura"), 0.0))
        refacciones = max(0.0, _safe_float(row.get("refacciones"), 0.0))
        total = max(0.0, _safe_float(row.get("total"), mo + pintura + refacciones))
        if total == 0 and (mo > 0 or pintura > 0 or refacciones > 0):
            total = mo + pintura + refacciones

        bucket["mano_obra"].append(mo)
        bucket["pintura"].append(pintura)
        bucket["refacciones"].append(refacciones)
        bucket["total"].append(total)
        bucket["score_sum"] += score
        bucket["count"] += 1

    ranked = []
    for bucket in grouped.values():
        count = int(bucket["count"])
        if count < 2:
            continue
        mo_m = round(float(median(bucket["mano_obra"])), 2)
        pi_m = round(float(median(bucket["pintura"])), 2)
        re_m = round(float(median(bucket["refacciones"])), 2)
        to_m = round(float(median(bucket["total"])), 2)
        if to_m <= 0:
            to_m = round(mo_m + pi_m + re_m, 2)
        confidence = min(0.97, 0.35 + min(0.5, math.log10(count + 1) / 2) + min(0.12, bucket["score_sum"] / 500))
        ranked.append(
            {
                "tipo": bucket["tipo"],
                "descripcion": bucket["descripcion"],
                "mano_obra": mo_m,
                "pintura": pi_m,
                "refacciones": re_m,
                "monto": to_m,
                "confianza": round(confidence, 3),
                "muestras": count,
                "score": round(bucket["score_sum"], 2),
            }
        )

    ranked.sort(key=lambda x: (x["score"], x["muestras"], x["monto"]), reverse=True)
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
