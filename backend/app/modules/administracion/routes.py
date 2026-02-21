from fastapi import APIRouter, HTTPException, status
from psycopg.rows import dict_row

from app.core.db import get_connection
from app.auth.routes import pwd_context

router = APIRouter(prefix="/admin", tags=["admin"])

# Importar y registrar rutas de RPA
from app.modules.administracion.rpa_routes import router as rpa_router
router.include_router(rpa_router)


@router.get("/health")
def health_check():
    return {"module": "admin", "status": "ok"}


@router.get("/users")
def list_users():
    with get_connection() as conn:
        conn.row_factory = dict_row
        rows = conn.execute(
            """
            SELECT
                u.id,
                u.name,
                u.user_name,
                u.email,
                COALESCE(p.profile_name, u.profile) AS profile_name,
                u.profile_id,
                u.status,
                u.created_at
            FROM users u
            LEFT JOIN profiles p ON p.id = u.profile_id
            ORDER BY u.id ASC
            """
        ).fetchall()
    return rows


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int):
    with get_connection() as conn:
        result = conn.execute("DELETE FROM users WHERE id = %s", (user_id,))
    if result.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    return None


@router.put("/users/{user_id}")
def update_user(user_id: int, payload: dict):
    allowed = {"name", "user_name", "email", "profile", "profile_id", "status", "password"}
    updates = {key: value for key, value in payload.items() if key in allowed}

    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Sin cambios para actualizar")

    if "password" in updates:
        updates["password"] = pwd_context.hash(str(updates["password"]))

    fields = ", ".join(f"{key} = %s" for key in updates)
    values = list(updates.values()) + [user_id]

    with get_connection() as conn:
        result = conn.execute(
            f"""
            UPDATE users
            SET {fields}
            WHERE id = %s
            RETURNING id, name, user_name, email, profile_id, status, created_at
            """,
            values,
        ).fetchone()

    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    return {
        "id": result[0],
        "name": result[1],
        "user_name": result[2],
        "email": result[3],
        "profile_id": result[4],
        "status": result[5],
        "created_at": result[6],
    }


@router.get("/profiles")
def list_profiles():
    with get_connection() as conn:
        conn.row_factory = dict_row
        rows = conn.execute(
            """
            SELECT id, profile_name, description, status, created_at
            FROM profiles
            ORDER BY id ASC
            """
        ).fetchall()
    return rows


@router.post("/profiles", status_code=status.HTTP_201_CREATED)
def create_profile(payload: dict):
    profile_name = (payload.get("profile_name") or "").strip()
    description = payload.get("description")
    status_flag = payload.get("status", True)

    if not profile_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="profile_name requerido")

    with get_connection() as conn:
        exists = conn.execute(
            "SELECT 1 FROM profiles WHERE profile_name = %s LIMIT 1",
            (profile_name,),
        ).fetchone()
        if exists:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Perfil ya existe")

        row = conn.execute(
            """
            INSERT INTO profiles (profile_name, description, status)
            VALUES (%s, %s, %s)
            RETURNING id, profile_name, description, status, created_at
            """,
            (profile_name, description, status_flag),
        ).fetchone()

    return {
        "id": row[0],
        "profile_name": row[1],
        "description": row[2],
        "status": row[3],
        "created_at": row[4],
    }


@router.put("/profiles/{profile_id}")
def update_profile(profile_id: int, payload: dict):
    allowed = {"profile_name", "description", "status"}
    updates = {key: value for key, value in payload.items() if key in allowed}

    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Sin cambios para actualizar")

    fields = ", ".join(f"{key} = %s" for key in updates)
    values = list(updates.values()) + [profile_id]

    with get_connection() as conn:
        row = conn.execute(
            f"""
            UPDATE profiles
            SET {fields}
            WHERE id = %s
            RETURNING id, profile_name, description, status, created_at
            """,
            values,
        ).fetchone()

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Perfil no encontrado")

    return {
        "id": row[0],
        "profile_name": row[1],
        "description": row[2],
        "status": row[3],
        "created_at": row[4],
    }


@router.delete("/profiles/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_profile(profile_id: int):
    with get_connection() as conn:
        result = conn.execute("DELETE FROM profiles WHERE id = %s", (profile_id,))
    if result.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Perfil no encontrado")
    return None


# ============================================================================
# CREDENCIALES DE ASEGURADORAS (RPA)
# ============================================================================

@router.get("/credenciales")
def list_credenciales():
    """Lista todas las credenciales de aseguradoras para RPA."""
    with get_connection() as conn:
        conn.row_factory = dict_row
        rows = conn.execute(
            """
            SELECT id, seguro, plataforma_url, usuario, password, taller_id, activo, created_at, updated_at
            FROM aseguradora_credenciales
            ORDER BY id ASC
            """
        ).fetchall()
    return rows


@router.post("/credenciales", status_code=status.HTTP_201_CREATED)
def create_credencial(payload: dict):
    """Crea una nueva credencial de aseguradora."""
    seguro = (payload.get("seguro") or "").strip()
    plataforma_url = (payload.get("plataforma_url") or "").strip()
    usuario = (payload.get("usuario") or "").strip()
    password = payload.get("password")
    taller_id = (payload.get("taller_id") or "").strip() or None
    activo = payload.get("activo", True)

    if not seguro:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="seguro requerido")
    if not plataforma_url:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="plataforma_url requerida")
    if not usuario:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="usuario requerido")
    if not password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="password requerido")

    with get_connection() as conn:
        row = conn.execute(
            """
            INSERT INTO aseguradora_credenciales (seguro, plataforma_url, usuario, password, taller_id, activo)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id, seguro, plataforma_url, usuario, password, taller_id, activo, created_at
            """,
            (seguro, plataforma_url, usuario, password, taller_id, activo),
        ).fetchone()

    return {
        "id": row[0],
        "seguro": row[1],
        "plataforma_url": row[2],
        "usuario": row[3],
        "password": row[4],
        "taller_id": row[5],
        "activo": row[6],
        "created_at": row[7],
    }


@router.put("/credenciales/{credencial_id}")
def update_credencial(credencial_id: int, payload: dict):
    """Actualiza una credencial existente."""
    allowed = {"seguro", "plataforma_url", "usuario", "password", "taller_id", "activo"}
    updates = {key: value for key, value in payload.items() if key in allowed}

    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Sin cambios para actualizar")

    # Si no se envía password (edición), no lo actualizamos
    if "password" in updates and not updates["password"]:
        del updates["password"]

    fields = ", ".join(f"{key} = %s" for key in updates)
    values = list(updates.values()) + [credencial_id]

    with get_connection() as conn:
        row = conn.execute(
            f"""
            UPDATE aseguradora_credenciales
            SET {fields}, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            RETURNING id, seguro, plataforma_url, usuario, password, taller_id, activo, created_at, updated_at
            """,
            values,
        ).fetchone()

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Credencial no encontrada")

    return {
        "id": row[0],
        "seguro": row[1],
        "plataforma_url": row[2],
        "usuario": row[3],
        "password": row[4],
        "taller_id": row[5],
        "activo": row[6],
        "created_at": row[7],
        "updated_at": row[8],
    }


@router.delete("/credenciales/{credencial_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_credencial(credencial_id: int):
    """Elimina una credencial."""
    with get_connection() as conn:
        result = conn.execute("DELETE FROM aseguradora_credenciales WHERE id = %s", (credencial_id,))
    if result.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Credencial no encontrada")
    return None
