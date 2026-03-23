from fastapi import APIRouter, HTTPException, status
from psycopg.rows import dict_row

from app.core.db import get_connection
from app.auth.routes import pwd_context

router = APIRouter(prefix="/admin", tags=["admin"])

# Importar y registrar rutas de RPA
from app.modules.administracion.rpa_routes import router as rpa_router
router.include_router(rpa_router)

# Importar y registrar rutas de Qualitas (indicadores)
from app.modules.administracion.qualitas_indicadores import router as qualitas_router
router.include_router(qualitas_router)

# Importar y registrar rutas de CHUBB (indicadores)
from app.modules.administracion.chubb_indicadores import router as chubb_router
router.include_router(chubb_router)

# Importar y registrar rutas de cola de RPA
from app.modules.administracion.rpa_queue import router as rpa_queue_router
router.include_router(rpa_queue_router)

# Importar y registrar rutas de autosync
from app.modules.administracion.autosync_routes import router as autosync_router
router.include_router(autosync_router)

# Importar schedulers para iniciarlos automáticamente
try:
    from app.modules.administracion import rpa_scheduler
except Exception as e:
    import logging
    logging.getLogger(__name__).error(f"Error cargando scheduler RPA: {e}")

# Importar scheduler de piezas
try:
    from app.modules.administracion import piezas_scheduler
except Exception as e:
    import logging
    logging.getLogger(__name__).error(f"Error cargando scheduler de piezas: {e}")


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
    if "email" in updates:
        updates["email"] = (str(updates["email"]).strip() if updates["email"] is not None else "") or None

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
            SELECT id, seguro, plataforma_url, usuario, password, taller_id, activo, 
                   COALESCE(autosync, false) as autosync,
                   COALESCE(synctime, 2) as synctime,
                   created_at, updated_at
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
    autosync = payload.get("autosync", False)
    synctime = payload.get("synctime", 2)

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
            INSERT INTO aseguradora_credenciales (seguro, plataforma_url, usuario, password, taller_id, activo, autosync, synctime)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, seguro, plataforma_url, usuario, password, taller_id, activo, autosync, synctime, created_at
            """,
            (seguro, plataforma_url, usuario, password, taller_id, activo, autosync, synctime),
        ).fetchone()

    return {
        "id": row[0],
        "seguro": row[1],
        "plataforma_url": row[2],
        "usuario": row[3],
        "password": row[4],
        "taller_id": row[5],
        "activo": row[6],
        "autosync": row[7],
        "synctime": row[8],
        "created_at": row[9],
    }


@router.put("/credenciales/{credencial_id}")
def update_credencial(credencial_id: int, payload: dict):
    """Actualiza una credencial existente."""
    allowed = {"seguro", "plataforma_url", "usuario", "password", "taller_id", "activo", "autosync", "synctime"}
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
            RETURNING id, seguro, plataforma_url, usuario, password, taller_id, activo, autosync, synctime, created_at, updated_at
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
        "autosync": row[7],
        "synctime": row[8],
        "created_at": row[9],
        "updated_at": row[10],
    }


@router.delete("/credenciales/{credencial_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_credencial(credencial_id: int):
    """Elimina una credencial."""
    with get_connection() as conn:
        result = conn.execute("DELETE FROM aseguradora_credenciales WHERE id = %s", (credencial_id,))
    if result.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Credencial no encontrada")
    return None


# =====================================================
# ENDPOINTS PARA SCHEDULER DE PIEZAS
# =====================================================

@router.get("/piezas-scheduler/status")
def get_piezas_scheduler_status():
    """
    Obtiene el estado del scheduler de piezas.
    """
    try:
        from app.modules.administracion.piezas_scheduler import get_piezas_scheduler_status
        return get_piezas_scheduler_status()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo estado: {str(e)}")


@router.post("/piezas-scheduler/start")
def start_piezas_scheduler():
    """
    Inicia el scheduler de piezas.
    """
    try:
        from app.modules.administracion.piezas_scheduler import start_piezas_scheduler
        scheduler = start_piezas_scheduler()
        return {
            "success": True,
            "message": "Scheduler de piezas iniciado",
            "schedule_time": f"{scheduler.hour:02d}:{scheduler.minute:02d}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error iniciando scheduler: {str(e)}")


@router.post("/piezas-scheduler/stop")
def stop_piezas_scheduler():
    """
    Detiene el scheduler de piezas.
    """
    try:
        from app.modules.administracion.piezas_scheduler import stop_piezas_scheduler
        stop_piezas_scheduler()
        return {"success": True, "message": "Scheduler de piezas detenido"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deteniendo scheduler: {str(e)}")


@router.post("/piezas-scheduler/force-run")
def force_run_piezas_scheduler():
    """
    Fuerza una ejecución inmediata de extracción de piezas.
    """
    try:
        from app.modules.administracion.piezas_scheduler import force_run_piezas
        task_ids = force_run_piezas()
        return {
            "success": True,
            "message": "Ejecución forzada iniciada",
            "task_ids": task_ids,
            "check_status_url": "/admin/rpa-queue/tasks"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error ejecutando scheduler: {str(e)}")


@router.post("/piezas-scheduler/enable")
def enable_piezas_scheduler():
    """
    Habilita el scheduler de piezas.
    """
    try:
        from app.modules.administracion.piezas_scheduler import get_piezas_scheduler
        scheduler = get_piezas_scheduler()
        scheduler.set_enabled(True)
        return {"success": True, "message": "Scheduler de piezas habilitado"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error habilitando scheduler: {str(e)}")


@router.post("/piezas-scheduler/disable")
def disable_piezas_scheduler():
    """
    Deshabilita el scheduler de piezas.
    """
    try:
        from app.modules.administracion.piezas_scheduler import get_piezas_scheduler
        scheduler = get_piezas_scheduler()
        scheduler.set_enabled(False)
        return {"success": True, "message": "Scheduler de piezas deshabilitado"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deshabilitando scheduler: {str(e)}")


@router.post("/piezas-scheduler/schedule")
def set_piezas_schedule(payload: dict):
    """
    Cambia la hora de ejecución del scheduler de piezas.
    
    Ejemplo de payload:
    {
        "hour": 6,
        "minute": 0
    }
    """
    hour = payload.get("hour")
    minute = payload.get("minute", 0)
    
    if hour is None:
        raise HTTPException(status_code=400, detail="hour requerido")
    
    if not (0 <= hour <= 23):
        raise HTTPException(status_code=400, detail="hour debe estar entre 0 y 23")
    
    if not (0 <= minute <= 59):
        raise HTTPException(status_code=400, detail="minute debe estar entre 0 y 59")
    
    try:
        from app.modules.administracion.piezas_scheduler import get_piezas_scheduler
        scheduler = get_piezas_scheduler()
        scheduler.set_schedule(hour, minute)
        return {
            "success": True,
            "message": f"Horario actualizado a {hour:02d}:{minute:02d}",
            "schedule_time": f"{hour:02d}:{minute:02d}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error actualizando horario: {str(e)}")
