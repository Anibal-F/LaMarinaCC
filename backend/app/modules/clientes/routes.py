from fastapi import APIRouter, HTTPException, status
from psycopg.rows import dict_row

from app.core.db import get_connection

router = APIRouter(prefix="/clientes", tags=["clientes"])


@router.get("")
def list_clientes():
    with get_connection() as conn:
        conn.row_factory = dict_row
        rows = conn.execute(
            """
            SELECT id, nb_cliente, tel_cliente, email_cliente, direccion, cp, rfc, created_at
            FROM clientes
            ORDER BY id ASC
            """
        ).fetchall()

    return rows


@router.post("", status_code=status.HTTP_201_CREATED)
def create_cliente(payload: dict):
    nb_cliente = (payload.get("nb_cliente") or "").strip()
    tel_cliente = (payload.get("tel_cliente") or "").strip()
    email_cliente = payload.get("email_cliente")
    direccion = payload.get("direccion")
    cp = payload.get("cp")
    rfc = payload.get("rfc")

    if not nb_cliente or not tel_cliente:
        raise HTTPException(status_code=400, detail="nb_cliente y tel_cliente requeridos")

    with get_connection() as conn:
        exists = conn.execute(
            "SELECT 1 FROM clientes WHERE tel_cliente = %s LIMIT 1",
            (tel_cliente,),
        ).fetchone()
        if exists:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Teléfono ya existe")

        row = conn.execute(
            """
            INSERT INTO clientes (nb_cliente, tel_cliente, email_cliente, direccion, cp, rfc)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id, nb_cliente, tel_cliente, email_cliente, direccion, cp, rfc, created_at
            """,
            (nb_cliente, tel_cliente, email_cliente, direccion, cp, rfc),
        ).fetchone()

    return {
        "id": row[0],
        "nb_cliente": row[1],
        "tel_cliente": row[2],
        "email_cliente": row[3],
        "direccion": row[4],
        "cp": row[5],
        "rfc": row[6],
        "created_at": row[7],
    }


@router.put("/{cliente_id}")
def update_cliente(cliente_id: int, payload: dict):
    allowed = {"nb_cliente", "tel_cliente", "email_cliente", "direccion", "cp", "rfc"}
    updates = {key: value for key, value in payload.items() if key in allowed}

    if not updates:
        raise HTTPException(status_code=400, detail="Sin cambios para actualizar")

    fields = ", ".join(f"{key} = %s" for key in updates)
    values = list(updates.values()) + [cliente_id]

    with get_connection() as conn:
        row = conn.execute(
            f"""
            UPDATE clientes
            SET {fields}
            WHERE id = %s
            RETURNING id, nb_cliente, tel_cliente, email_cliente, direccion, cp, rfc, created_at
            """,
            values,
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    return {
        "id": row[0],
        "nb_cliente": row[1],
        "tel_cliente": row[2],
        "email_cliente": row[3],
        "direccion": row[4],
        "cp": row[5],
        "rfc": row[6],
        "created_at": row[7],
    }


@router.delete("/{cliente_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_cliente(cliente_id: int):
    with get_connection() as conn:
        result = conn.execute("DELETE FROM clientes WHERE id = %s", (cliente_id,))
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return None


@router.get("/by-telefono")
def get_by_telefono(tel: str):
    if not tel:
        raise HTTPException(status_code=400, detail="tel requerido")

    with get_connection() as conn:
        conn.row_factory = dict_row
        row = conn.execute(
            """
            SELECT id, nb_cliente, tel_cliente, email_cliente
            FROM clientes
            WHERE tel_cliente = %s
            LIMIT 1
            """,
            (tel,),
        ).fetchone()

    if not row:
        return None

    return row
