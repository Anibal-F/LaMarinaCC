from fastapi import APIRouter, HTTPException, status
from psycopg.rows import dict_row

from app.core.db import get_connection

router = APIRouter(prefix="/catalogos", tags=["catalogos"])


@router.get("/grupos-autos")
def list_grupos_autos():
    with get_connection() as conn:
        conn.row_factory = dict_row
        rows = conn.execute(
            """
            SELECT id, nb_grupo, created_at
            FROM grupos_autos
            ORDER BY id ASC
            """
        ).fetchall()
    return rows


@router.post("/grupos-autos", status_code=status.HTTP_201_CREATED)
def create_grupo_auto(payload: dict):
    nb_grupo = (payload.get("nb_grupo") or "").strip()
    if not nb_grupo:
        raise HTTPException(status_code=400, detail="nb_grupo requerido")

    with get_connection() as conn:
        exists = conn.execute(
            "SELECT 1 FROM grupos_autos WHERE LOWER(nb_grupo) = LOWER(%s) LIMIT 1",
            (nb_grupo,),
        ).fetchone()
        if exists:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Grupo ya existe")

        row = conn.execute(
            """
            INSERT INTO grupos_autos (nb_grupo)
            VALUES (%s)
            RETURNING id, nb_grupo, created_at
            """,
            (nb_grupo,),
        ).fetchone()

    return {"id": row[0], "nb_grupo": row[1], "created_at": row[2]}


@router.put("/grupos-autos/{grupo_id}")
def update_grupo_auto(grupo_id: int, payload: dict):
    nb_grupo = (payload.get("nb_grupo") or "").strip()
    if not nb_grupo:
        raise HTTPException(status_code=400, detail="nb_grupo requerido")

    with get_connection() as conn:
        row = conn.execute(
            """
            UPDATE grupos_autos
            SET nb_grupo = %s
            WHERE id = %s
            RETURNING id, nb_grupo, created_at
            """,
            (nb_grupo, grupo_id),
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")

    return {"id": row[0], "nb_grupo": row[1], "created_at": row[2]}


@router.delete("/grupos-autos/{grupo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_grupo_auto(grupo_id: int):
    with get_connection() as conn:
        result = conn.execute("DELETE FROM grupos_autos WHERE id = %s", (grupo_id,))
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    return None


@router.get("/marcas-autos")
def list_marcas_autos():
    with get_connection() as conn:
        conn.row_factory = dict_row
        rows = conn.execute(
            """
            SELECT id, gpo_marca, nb_marca, created_at
            FROM marcas_autos
            ORDER BY id ASC
            """
        ).fetchall()
    return rows


@router.post("/marcas-autos", status_code=status.HTTP_201_CREATED)
def create_marca_auto(payload: dict):
    gpo_marca = (payload.get("gpo_marca") or "").strip()
    nb_marca = (payload.get("nb_marca") or "").strip()

    if not gpo_marca or not nb_marca:
        raise HTTPException(status_code=400, detail="gpo_marca y nb_marca requeridos")

    with get_connection() as conn:
        exists_group = conn.execute(
            "SELECT 1 FROM grupos_autos WHERE LOWER(nb_grupo) = LOWER(%s) LIMIT 1",
            (gpo_marca,),
        ).fetchone()
        if not exists_group:
            raise HTTPException(status_code=404, detail="Grupo no encontrado")

        exists = conn.execute(
            """
            SELECT 1 FROM marcas_autos
            WHERE LOWER(gpo_marca) = LOWER(%s) AND LOWER(nb_marca) = LOWER(%s)
            LIMIT 1
            """,
            (gpo_marca, nb_marca),
        ).fetchone()
        if exists:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Marca ya existe")

        row = conn.execute(
            """
            INSERT INTO marcas_autos (gpo_marca, nb_marca)
            VALUES (%s, %s)
            RETURNING id, gpo_marca, nb_marca, created_at
            """,
            (gpo_marca, nb_marca),
        ).fetchone()

    return {"id": row[0], "gpo_marca": row[1], "nb_marca": row[2], "created_at": row[3]}


@router.put("/marcas-autos/{marca_id}")
def update_marca_auto(marca_id: int, payload: dict):
    gpo_marca = (payload.get("gpo_marca") or "").strip()
    nb_marca = (payload.get("nb_marca") or "").strip()

    if not gpo_marca or not nb_marca:
        raise HTTPException(status_code=400, detail="gpo_marca y nb_marca requeridos")

    with get_connection() as conn:
        exists_group = conn.execute(
            "SELECT 1 FROM grupos_autos WHERE LOWER(nb_grupo) = LOWER(%s) LIMIT 1",
            (gpo_marca,),
        ).fetchone()
        if not exists_group:
            raise HTTPException(status_code=404, detail="Grupo no encontrado")

        row = conn.execute(
            """
            UPDATE marcas_autos
            SET gpo_marca = %s, nb_marca = %s
            WHERE id = %s
            RETURNING id, gpo_marca, nb_marca, created_at
            """,
            (gpo_marca, nb_marca, marca_id),
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Marca no encontrada")

    return {"id": row[0], "gpo_marca": row[1], "nb_marca": row[2], "created_at": row[3]}


@router.delete("/marcas-autos/{marca_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_marca_auto(marca_id: int):
    with get_connection() as conn:
        result = conn.execute("DELETE FROM marcas_autos WHERE id = %s", (marca_id,))
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Marca no encontrada")
    return None


@router.get("/aseguradoras")
def list_aseguradoras():
    with get_connection() as conn:
        conn.row_factory = dict_row
        rows = conn.execute(
            """
            SELECT id, nb_aseguradora, tel_contacto, email_contacto, created_at
            FROM aseguradoras
            ORDER BY id ASC
            """
        ).fetchall()
    return rows


@router.post("/aseguradoras", status_code=status.HTTP_201_CREATED)
def create_aseguradora(payload: dict):
    nb_aseguradora = (payload.get("nb_aseguradora") or "").strip()
    tel_contacto = (payload.get("tel_contacto") or "").strip()
    email_contacto = (payload.get("email_contacto") or "").strip()

    if not nb_aseguradora:
        raise HTTPException(status_code=400, detail="nb_aseguradora requerido")

    with get_connection() as conn:
        exists = conn.execute(
            "SELECT 1 FROM aseguradoras WHERE LOWER(nb_aseguradora) = LOWER(%s) LIMIT 1",
            (nb_aseguradora,),
        ).fetchone()
        if exists:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Aseguradora ya existe")

        row = conn.execute(
            """
            INSERT INTO aseguradoras (nb_aseguradora, tel_contacto, email_contacto)
            VALUES (%s, %s, %s)
            RETURNING id, nb_aseguradora, tel_contacto, email_contacto, created_at
            """,
            (nb_aseguradora, tel_contacto or None, email_contacto or None),
        ).fetchone()

    return {
        "id": row[0],
        "nb_aseguradora": row[1],
        "tel_contacto": row[2],
        "email_contacto": row[3],
        "created_at": row[4],
    }


@router.put("/aseguradoras/{aseguradora_id}")
def update_aseguradora(aseguradora_id: int, payload: dict):
    allowed = {"nb_aseguradora", "tel_contacto", "email_contacto"}
    updates = {key: value for key, value in payload.items() if key in allowed}
    if not updates:
        raise HTTPException(status_code=400, detail="Sin cambios para actualizar")

    fields = ", ".join(f"{key} = %s" for key in updates)
    values = list(updates.values()) + [aseguradora_id]

    with get_connection() as conn:
        row = conn.execute(
            f"""
            UPDATE aseguradoras
            SET {fields}
            WHERE id = %s
            RETURNING id, nb_aseguradora, tel_contacto, email_contacto, created_at
            """,
            values,
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Aseguradora no encontrada")

    return {
        "id": row[0],
        "nb_aseguradora": row[1],
        "tel_contacto": row[2],
        "email_contacto": row[3],
        "created_at": row[4],
    }


@router.delete("/aseguradoras/{aseguradora_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_aseguradora(aseguradora_id: int):
    with get_connection() as conn:
        result = conn.execute("DELETE FROM aseguradoras WHERE id = %s", (aseguradora_id,))
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Aseguradora no encontrada")
    return None


@router.get("/partes-auto")
def list_partes_auto():
    with get_connection() as conn:
        conn.row_factory = dict_row
        rows = conn.execute(
            """
            SELECT id, nb_parte, created_at
            FROM partes_auto
            ORDER BY id ASC
            """
        ).fetchall()
    return rows


@router.post("/partes-auto", status_code=status.HTTP_201_CREATED)
def create_parte_auto(payload: dict):
    nb_parte = (payload.get("nb_parte") or "").strip()
    if not nb_parte:
        raise HTTPException(status_code=400, detail="nb_parte requerido")

    with get_connection() as conn:
        exists = conn.execute(
            "SELECT 1 FROM partes_auto WHERE LOWER(nb_parte) = LOWER(%s) LIMIT 1",
            (nb_parte,),
        ).fetchone()
        if exists:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Parte ya existe")

        row = conn.execute(
            """
            INSERT INTO partes_auto (nb_parte)
            VALUES (%s)
            RETURNING id, nb_parte, created_at
            """,
            (nb_parte,),
        ).fetchone()

    return {"id": row[0], "nb_parte": row[1], "created_at": row[2]}


@router.put("/partes-auto/{parte_id}")
def update_parte_auto(parte_id: int, payload: dict):
    nb_parte = (payload.get("nb_parte") or "").strip()
    if not nb_parte:
        raise HTTPException(status_code=400, detail="nb_parte requerido")

    with get_connection() as conn:
        row = conn.execute(
            """
            UPDATE partes_auto
            SET nb_parte = %s
            WHERE id = %s
            RETURNING id, nb_parte, created_at
            """,
            (nb_parte, parte_id),
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Parte no encontrada")

    return {"id": row[0], "nb_parte": row[1], "created_at": row[2]}


@router.delete("/partes-auto/{parte_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_parte_auto(parte_id: int):
    with get_connection() as conn:
        result = conn.execute("DELETE FROM partes_auto WHERE id = %s", (parte_id,))
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Parte no encontrada")
    return None


@router.get("/estatus-valuacion")
def list_estatus_valuacion():
    with get_connection() as conn:
        conn.row_factory = dict_row
        rows = conn.execute(
            """
            SELECT id, nombre_estatus, descripcion, created_at
            FROM estatus_valuacion
            ORDER BY id ASC
            """
        ).fetchall()
    return rows


@router.post("/estatus-valuacion", status_code=status.HTTP_201_CREATED)
def create_estatus_valuacion(payload: dict):
    nombre_estatus = (payload.get("nombre_estatus") or "").strip()
    descripcion = (payload.get("descripcion") or "").strip()

    if not nombre_estatus:
        raise HTTPException(status_code=400, detail="nombre_estatus requerido")

    with get_connection() as conn:
        exists = conn.execute(
            "SELECT 1 FROM estatus_valuacion WHERE LOWER(nombre_estatus) = LOWER(%s) LIMIT 1",
            (nombre_estatus,),
        ).fetchone()
        if exists:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Estatus ya existe")

        row = conn.execute(
            """
            INSERT INTO estatus_valuacion (nombre_estatus, descripcion)
            VALUES (%s, %s)
            RETURNING id, nombre_estatus, descripcion, created_at
            """,
            (nombre_estatus, descripcion or None),
        ).fetchone()

    return {
        "id": row[0],
        "nombre_estatus": row[1],
        "descripcion": row[2],
        "created_at": row[3],
    }


@router.put("/estatus-valuacion/{estatus_id}")
def update_estatus_valuacion(estatus_id: int, payload: dict):
    allowed = {"nombre_estatus", "descripcion"}
    updates = {key: value for key, value in payload.items() if key in allowed}
    if not updates:
        raise HTTPException(status_code=400, detail="Sin cambios para actualizar")

    fields = ", ".join(f"{key} = %s" for key in updates)
    values = list(updates.values()) + [estatus_id]

    with get_connection() as conn:
        row = conn.execute(
            f"""
            UPDATE estatus_valuacion
            SET {fields}
            WHERE id = %s
            RETURNING id, nombre_estatus, descripcion, created_at
            """,
            values,
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Estatus no encontrado")

    return {
        "id": row[0],
        "nombre_estatus": row[1],
        "descripcion": row[2],
        "created_at": row[3],
    }


@router.delete("/estatus-valuacion/{estatus_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_estatus_valuacion(estatus_id: int):
    with get_connection() as conn:
        result = conn.execute("DELETE FROM estatus_valuacion WHERE id = %s", (estatus_id,))
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Estatus no encontrado")
    return None


@router.get("/estatus-valuacion")
def list_estatus_valuacion():
    with get_connection() as conn:
        conn.row_factory = dict_row
        rows = conn.execute(
            """
            SELECT id, nombre_estatus, descripcion, created_at
            FROM estatus_valuacion
            ORDER BY id ASC
            """
        ).fetchall()
    return rows


@router.post("/estatus-valuacion", status_code=status.HTTP_201_CREATED)
def create_estatus_valuacion(payload: dict):
    nombre_estatus = (payload.get("nombre_estatus") or "").strip()
    descripcion = (payload.get("descripcion") or "").strip()
    if not nombre_estatus:
        raise HTTPException(status_code=400, detail="nombre_estatus requerido")

    with get_connection() as conn:
        exists = conn.execute(
            """
            SELECT 1 FROM estatus_valuacion
            WHERE LOWER(nombre_estatus) = LOWER(%s)
            LIMIT 1
            """,
            (nombre_estatus,),
        ).fetchone()
        if exists:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Estatus ya existe"
            )

        row = conn.execute(
            """
            INSERT INTO estatus_valuacion (nombre_estatus, descripcion)
            VALUES (%s, %s)
            RETURNING id, nombre_estatus, descripcion, created_at
            """,
            (nombre_estatus, descripcion or None),
        ).fetchone()

    return {
        "id": row[0],
        "nombre_estatus": row[1],
        "descripcion": row[2],
        "created_at": row[3],
    }


@router.put("/estatus-valuacion/{estatus_id}")
def update_estatus_valuacion(estatus_id: int, payload: dict):
    nombre_estatus = (payload.get("nombre_estatus") or "").strip()
    descripcion = (payload.get("descripcion") or "").strip()

    if not nombre_estatus:
        raise HTTPException(status_code=400, detail="nombre_estatus requerido")

    with get_connection() as conn:
        row = conn.execute(
            """
            UPDATE estatus_valuacion
            SET nombre_estatus = %s, descripcion = %s
            WHERE id = %s
            RETURNING id, nombre_estatus, descripcion, created_at
            """,
            (nombre_estatus, descripcion or None, estatus_id),
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Estatus no encontrado")

    return {
        "id": row[0],
        "nombre_estatus": row[1],
        "descripcion": row[2],
        "created_at": row[3],
    }


@router.delete("/estatus-valuacion/{estatus_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_estatus_valuacion(estatus_id: int):
    with get_connection() as conn:
        result = conn.execute(
            "DELETE FROM estatus_valuacion WHERE id = %s", (estatus_id,)
        )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Estatus no encontrado")
    return None
