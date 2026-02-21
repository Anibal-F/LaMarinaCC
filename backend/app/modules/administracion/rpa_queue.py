"""
Sistema de cola asíncrona para ejecutar RPA en background.

Este módulo proporciona:
- Cola de tareas persistente en base de datos
- Worker que procesa tareas en background
- Notificaciones de estado
- Reintentos automáticos
"""

import json
import subprocess
import threading
import time
from datetime import datetime, timedelta
from enum import Enum
from pathlib import Path
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, asdict

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from psycopg.rows import dict_row
from app.core.db import get_connection

router = APIRouter(prefix="/rpa-queue", tags=["rpa-queue"])


# ============================================================================
# MODELOS
# ============================================================================

class TaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class TaskType(str, Enum):
    QUALITAS_LOGIN = "qualitas_login"
    QUALITAS_EXTRACT = "qualitas_extract"


@dataclass
class RPATask:
    id: str
    type: TaskType
    status: TaskStatus
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    logs: str = ""
    retry_count: int = 0
    max_retries: int = 3


class CreateTaskRequest(BaseModel):
    type: TaskType
    params: Optional[Dict[str, Any]] = {}


class TaskResponse(BaseModel):
    id: str
    type: str
    status: str
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    logs: str = ""
    retry_count: int = 0


# ============================================================================
# BASE DE DATOS
# ============================================================================

def ensure_tasks_table():
    """Crea la tabla de tareas si no existe."""
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS rpa_tasks (
                id VARCHAR(50) PRIMARY KEY,
                type VARCHAR(50) NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'pending',
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                started_at TIMESTAMP,
                completed_at TIMESTAMP,
                result JSONB,
                error TEXT,
                logs TEXT DEFAULT '',
                retry_count INTEGER DEFAULT 0,
                max_retries INTEGER DEFAULT 3,
                params JSONB DEFAULT '{}'
            )
        """)
        conn.commit()


def create_task(task_type: TaskType, params: Dict[str, Any] = None) -> str:
    """Crea una nueva tarea en la cola."""
    ensure_tasks_table()
    
    task_id = f"{task_type.value}_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{int(time.time())}"
    
    with get_connection() as conn:
        conn.execute("""
            INSERT INTO rpa_tasks (id, type, status, params)
            VALUES (%s, %s, %s, %s)
        """, (task_id, task_type.value, TaskStatus.PENDING.value, json.dumps(params or {})))
        conn.commit()
    
    return task_id


def get_task(task_id: str) -> Optional[Dict[str, Any]]:
    """Obtiene una tarea por ID."""
    ensure_tasks_table()
    
    with get_connection() as conn:
        conn.row_factory = dict_row
        row = conn.execute(
            "SELECT * FROM rpa_tasks WHERE id = %s",
            (task_id,)
        ).fetchone()
        
        return dict(row) if row else None


def update_task(task_id: str, **kwargs):
    """Actualiza una tarea."""
    ensure_tasks_table()
    
    allowed_fields = ['status', 'started_at', 'completed_at', 'result', 'error', 'logs', 'retry_count']
    updates = {k: v for k, v in kwargs.items() if k in allowed_fields}
    
    if not updates:
        return
    
    # Serializar campos JSON si son dict
    if 'result' in updates and isinstance(updates['result'], dict):
        updates['result'] = json.dumps(updates['result'])
    
    set_clause = ", ".join(f"{k} = %s" for k in updates.keys())
    values = list(updates.values()) + [task_id]
    
    with get_connection() as conn:
        conn.execute(
            f"UPDATE rpa_tasks SET {set_clause} WHERE id = %s",
            values
        )
        conn.commit()


def get_pending_tasks() -> List[Dict[str, Any]]:
    """Obtiene las tareas pendientes."""
    ensure_tasks_table()
    
    with get_connection() as conn:
        conn.row_factory = dict_row
        rows = conn.execute("""
            SELECT * FROM rpa_tasks 
            WHERE status = 'pending' 
            AND retry_count < max_retries
            ORDER BY created_at ASC
            LIMIT 10
        """).fetchall()
        
        return [dict(row) for row in rows]


def get_recent_tasks(limit: int = 20) -> List[Dict[str, Any]]:
    """Obtiene las tareas recientes."""
    ensure_tasks_table()
    
    with get_connection() as conn:
        conn.row_factory = dict_row
        rows = conn.execute("""
            SELECT id, type, status, created_at, started_at, completed_at, 
                   retry_count, error IS NOT NULL as has_error
            FROM rpa_tasks 
            ORDER BY created_at DESC
            LIMIT %s
        """, (limit,)).fetchall()
        
        return [dict(row) for row in rows]


# ============================================================================
# WORKER
# ============================================================================

_worker_thread = None
_worker_running = False


def run_qualitas_task(task_id: str, params: Dict[str, Any]):
    """Ejecuta una tarea de Qualitas."""
    import logging
    logger = logging.getLogger(__name__)
    
    backend_dir = Path(__file__).resolve().parents[3]
    logs = []
    
    def log(msg):
        logs.append(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")
        logger.info(f"[Task {task_id}] {msg}")
    
    try:
        log("Iniciando tarea de Qualitas")
        update_task(task_id, status=TaskStatus.RUNNING.value, started_at=datetime.now())
        
        # Determinar si usar sesión existente
        session_path = backend_dir / "app" / "rpa" / "sessions" / "qualitas_session.json"
        has_session = session_path.exists()
        
        if has_session:
            log("Sesión existente encontrada, usando --skip-login")
        else:
            log("No hay sesión, se requerirá resolver CAPTCHA (puede tardar)")
        
        # Construir comando
        cmd = [
            "python3", "-m", "app.rpa.qualitas_full_workflow",
            "--headless",
            "--use-db"
        ]
        
        if has_session:
            cmd.append("--skip-login")
        
        log(f"Ejecutando: {' '.join(cmd)}")
        
        # Ejecutar RPA
        result = subprocess.run(
            cmd,
            cwd=str(backend_dir),
            capture_output=True,
            text=True,
            timeout=600,  # 10 minutos máximo
            encoding='utf-8',
            errors='replace'
        )
        
        # Capturar logs
        if result.stdout:
            logs.append(result.stdout)
        if result.stderr:
            logs.append(f"STDERR: {result.stderr}")
        
        log(f"RPA terminó con código: {result.returncode}")
        
        if result.returncode != 0:
            raise RuntimeError(f"RPA falló con código {result.returncode}")
        
        # Buscar el archivo JSON más reciente generado por el RPA
        data_dir = backend_dir / "app" / "rpa" / "data"
        json_files = sorted(data_dir.glob("qualitas_dashboard_*.json"), reverse=True)
        
        if not json_files:
            raise RuntimeError("El RPA se ejecutó pero no se encontró archivo de datos")
        
        # Leer datos del archivo JSON
        with open(json_files[0], 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        log(f"Datos leídos del archivo: {json_files[0].name}")
        
        # Guardar en base de datos (desde el worker, no desde el RPA)
        from app.modules.administracion.qualitas_indicadores import save_indicadores, get_latest_indicadores
        
        try:
            record_id = save_indicadores(data)
            log(f"✓ Datos guardados en DB con ID: {record_id}")
        except Exception as db_error:
            log(f"⚠ Error guardando en DB: {db_error}")
            # Continuar de todos modos, los datos están en el archivo JSON
        
        # Verificar que se guardaron datos
        indicadores = get_latest_indicadores()
        
        if not indicadores:
            # Si no hay en DB, usar los datos del archivo
            log("Usando datos del archivo JSON (no se encontraron en DB)")
            indicadores = data
        
        log(f"✓ Éxito - {indicadores.get('total_ordenes', 0)} órdenes encontradas")
        
        # Actualizar tarea como completada
        # Serializar result a JSON string para evitar error de psycopg
        result_json = json.dumps(indicadores) if isinstance(indicadores, dict) else indicadores
        
        update_task(
            task_id,
            status=TaskStatus.COMPLETED.value,
            completed_at=datetime.now(),
            result=result_json,
            logs="\n".join(logs)
        )
        
    except subprocess.TimeoutExpired:
        log("✗ Timeout - El RPA tardó más de 10 minutos")
        update_task(
            task_id,
            status=TaskStatus.FAILED.value,
            completed_at=datetime.now(),
            error="Timeout: El proceso tardó más de 10 minutos",
            logs="\n".join(logs),
            retry_count=get_task(task_id)['retry_count'] + 1
        )
    except Exception as e:
        log(f"✗ Error: {str(e)}")
        update_task(
            task_id,
            status=TaskStatus.FAILED.value,
            completed_at=datetime.now(),
            error=str(e),
            logs="\n".join(logs),
            retry_count=get_task(task_id)['retry_count'] + 1
        )


def worker_loop():
    """Loop del worker que procesa tareas."""
    global _worker_running
    
    import logging
    logger = logging.getLogger(__name__)
    logger.info("[Worker] Iniciado")
    
    while _worker_running:
        try:
            # Obtener tareas pendientes
            pending = get_pending_tasks()
            
            for task in pending:
                if not _worker_running:
                    break
                
                task_id = task['id']
                task_type = task['type']
                
                # params puede ser dict (psycopg lo deserializa) o string
                params_raw = task.get('params', '{}')
                if isinstance(params_raw, dict):
                    params = params_raw
                else:
                    params = json.loads(params_raw or '{}')
                
                logger.info(f"[Worker] Procesando tarea: {task_id}")
                
                if task_type == TaskType.QUALITAS_LOGIN.value or task_type == TaskType.QUALITAS_EXTRACT.value:
                    run_qualitas_task(task_id, params)
                else:
                    logger.warning(f"[Worker] Tipo de tarea desconocido: {task_type}")
                    update_task(
                        task_id,
                        status=TaskStatus.FAILED.value,
                        error=f"Tipo de tarea desconocido: {task_type}",
                        completed_at=datetime.now()
                    )
            
            # Esperar antes de revisar nuevamente
            time.sleep(5)
            
        except Exception as e:
            logger.exception("[Worker] Error en loop")
            time.sleep(10)
    
    logger.info("[Worker] Detenido")


def start_worker():
    """Inicia el worker en un thread separado."""
    global _worker_thread, _worker_running
    
    if _worker_thread and _worker_thread.is_alive():
        return  # Ya está corriendo
    
    _worker_running = True
    _worker_thread = threading.Thread(target=worker_loop, daemon=True)
    _worker_thread.start()


def stop_worker():
    """Detiene el worker."""
    global _worker_running
    _worker_running = False


# Iniciar worker al importar
start_worker()


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.post("/tasks", response_model=TaskResponse)
async def create_task_endpoint(request: CreateTaskRequest):
    """
    Crea una nueva tarea en la cola.
    El worker la procesará automáticamente.
    """
    task_id = create_task(request.type, request.params)
    
    # Retornar estado inicial
    task = get_task(task_id)
    return {
        "id": task['id'],
        "type": task['type'],
        "status": task['status'],
        "created_at": task['created_at'].isoformat(),
        "started_at": task['started_at'].isoformat() if task['started_at'] else None,
        "completed_at": task['completed_at'].isoformat() if task['completed_at'] else None,
        "result": task['result'],
        "error": task['error'],
        "logs": task['logs'] or "",
        "retry_count": task['retry_count']
    }


@router.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_task_endpoint(task_id: str):
    """Obtiene el estado de una tarea."""
    task = get_task(task_id)
    
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    
    return {
        "id": task['id'],
        "type": task['type'],
        "status": task['status'],
        "created_at": task['created_at'].isoformat(),
        "started_at": task['started_at'].isoformat() if task['started_at'] else None,
        "completed_at": task['completed_at'].isoformat() if task['completed_at'] else None,
        "result": task['result'],
        "error": task['error'],
        "logs": task['logs'] or "",
        "retry_count": task['retry_count']
    }


@router.get("/tasks")
async def list_tasks(limit: int = 20):
    """Lista las tareas recientes."""
    return get_recent_tasks(limit)


@router.post("/qualitas/actualizar")
async def queue_qualitas_update():
    """
    Encola una actualización de indicadores de Qualitas.
    Retorna inmediatamente con el ID de la tarea.
    """
    task_id = create_task(TaskType.QUALITAS_EXTRACT, {"auto_retry": True})
    
    return {
        "success": True,
        "message": "Tarea encolada. El RPA se ejecutará en background.",
        "task_id": task_id,
        "status": "pending",
        "check_status_url": f"/admin/rpa-queue/tasks/{task_id}"
    }
