from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from psycopg.rows import dict_row

from app.core.db import get_connection

router = APIRouter(prefix="/valuacion", tags=["valuacion"])


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


class ValuacionPayload(BaseModel):
    aseguradora_activa: str | None = None
    autorizado_aseguradora: float | None = None
    observaciones: str | None = None
    detalle: list[ValuacionDetalle] = []


@router.get("/ordenes/{orden_id}")
def get_valuacion_by_orden(orden_id: int):
    with get_connection() as conn:
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
            SELECT id, tipo, descripcion, monto
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
                INSERT INTO valuacion_detalle (valuacion_id, tipo, descripcion, monto)
                VALUES (%s, %s, %s, %s)
                """,
                (valuacion_id, item.tipo, item.descripcion, item.monto),
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
