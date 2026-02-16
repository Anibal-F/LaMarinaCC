from fastapi import APIRouter
from psycopg.rows import dict_row

from app.core.db import get_connection

router = APIRouter(prefix="/reportes", tags=["reportes"])


@router.get("/historial")
def list_historial():
    with get_connection() as conn:
        conn.row_factory = dict_row
        rows = conn.execute(
            """
            SELECT
                id,
                fecha_seguro,
                fecha_recep,
                folio_seguro,
                folio_recep,
                folio_ot,
                nb_cliente,
                tel_cliente,
                seguro,
                marca_vehiculo,
                modelo_vehiculo,
                tipo_carroceria,
                color,
                placas,
                kilometraje,
                nivel_gas,
                estado_mecanico,
                observaciones,
                fecha_entregaestim,
                estatus,
                fecha_entrega
            FROM historical_entries
            ORDER BY id DESC
            """
        ).fetchall()

    return rows
