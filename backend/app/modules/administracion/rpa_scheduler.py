"""
Scheduler automático para actualización de indicadores de Qualitas.

Ejecuta actualizaciones cada 2 horas, verificando primero si la sesión es válida.
Si la sesión expiró, realiza login completo con CAPTCHA.
"""

import asyncio
import json
import logging
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict, Any

from app.modules.administracion.rpa_queue import (
    create_task, get_task, update_task, TaskType, TaskStatus
)

logger = logging.getLogger(__name__)

# Configuración del scheduler
DEFAULT_INTERVAL_HOURS = 2  # Ejecutar cada 2 horas
SESSION_CHECK_URL = "https://proordersistem.com.mx/dashboard"  # URL para verificar sesión

# Estado del scheduler
_scheduler_thread = None
_scheduler_running = False
_last_run_time = None
_next_run_time = None


class RPAScheduler:
    """Scheduler para ejecutar RPA de Qualitas periódicamente."""
    
    def __init__(self, interval_hours: int = DEFAULT_INTERVAL_HOURS):
        self.interval_hours = interval_hours
        self.interval_seconds = interval_hours * 3600
        self._stop_event = threading.Event()
        self._current_task_id: Optional[str] = None
        
    def start(self):
        """Inicia el scheduler en un thread separado."""
        global _scheduler_thread, _scheduler_running
        
        if _scheduler_thread and _scheduler_thread.is_alive():
            logger.info("[Scheduler] Ya está corriendo")
            return
        
        _scheduler_running = True
        _scheduler_thread = threading.Thread(target=self._run_loop, daemon=True)
        _scheduler_thread.start()
        logger.info(f"[Scheduler] Iniciado - Intervalo: {self.interval_hours} horas")
    
    def stop(self):
        """Detiene el scheduler."""
        global _scheduler_running
        self._stop_event.set()
        _scheduler_running = False
        logger.info("[Scheduler] Deteniendo...")
    
    def _run_loop(self):
        """Loop principal del scheduler."""
        global _last_run_time, _next_run_time
        
        # Esperar un poco al inicio para que el servidor termine de cargar
        time.sleep(30)
        
        while not self._stop_event.is_set():
            try:
                _next_run_time = datetime.now() + timedelta(seconds=self.interval_seconds)
                logger.info(f"[Scheduler] Próxima ejecución: {_next_run_time.strftime('%Y-%m-%d %H:%M:%S')}")
                
                # Esperar hasta el próximo intervalo
                if self._stop_event.wait(self.interval_seconds):
                    break
                
                # Ejecutar actualización
                self._execute_update()
                
            except Exception as e:
                logger.exception("[Scheduler] Error en loop")
                time.sleep(60)  # Esperar 1 minuto antes de reintentar
    
    def _execute_update(self):
        """Ejecuta la actualización de indicadores."""
        global _last_run_time
        
        logger.info("[Scheduler] Iniciando actualización programada")
        _last_run_time = datetime.now()
        
        # Verificar si hay una tarea en curso
        if self._current_task_id:
            task = get_task(self._current_task_id)
            if task and task['status'] in [TaskStatus.PENDING.value, TaskStatus.RUNNING.value]:
                logger.info(f"[Scheduler] Ya hay una tarea en curso: {self._current_task_id}")
                return
        
        # Crear tarea en la cola
        self._current_task_id = create_task(
            TaskType.QUALITAS_EXTRACT,
            {
                "auto_retry": True,
                "scheduled": True,
                "scheduled_at": datetime.now().isoformat()
            }
        )
        
        logger.info(f"[Scheduler] Tarea creada: {self._current_task_id}")
    
    def force_run(self) -> str:
        """Fuerza una ejecución inmediata. Retorna el ID de la tarea."""
        logger.info("[Scheduler] Ejecución forzada solicitada")
        
        task_id = create_task(
            TaskType.QUALITAS_EXTRACT,
            {
                "auto_retry": True,
                "forced": True,
                "scheduled_at": datetime.now().isoformat()
            }
        )
        
        return task_id
    
    def get_status(self) -> Dict[str, Any]:
        """Retorna el estado actual del scheduler."""
        return {
            "running": _scheduler_running,
            "interval_hours": self.interval_hours,
            "last_run": _last_run_time.isoformat() if _last_run_time else None,
            "next_run": _next_run_time.isoformat() if _next_run_time else None,
            "current_task_id": self._current_task_id,
            "time_until_next_run": (
                (_next_run_time - datetime.now()).total_seconds() 
                if _next_run_time else None
            )
        }


# Instancia global del scheduler
_scheduler_instance: Optional[RPAScheduler] = None


def start_scheduler(interval_hours: int = DEFAULT_INTERVAL_HOURS):
    """Inicia el scheduler global."""
    global _scheduler_instance
    
    if _scheduler_instance is None:
        _scheduler_instance = RPAScheduler(interval_hours)
    
    _scheduler_instance.start()
    return _scheduler_instance


def stop_scheduler():
    """Detiene el scheduler global."""
    global _scheduler_instance
    
    if _scheduler_instance:
        _scheduler_instance.stop()


def force_run_scheduler() -> str:
    """Fuerza una ejecución inmediata."""
    global _scheduler_instance
    
    if _scheduler_instance is None:
        _scheduler_instance = RPAScheduler(DEFAULT_INTERVAL_HOURS)
    
    return _scheduler_instance.force_run()


def get_scheduler_status() -> Dict[str, Any]:
    """Obtiene el estado del scheduler."""
    global _scheduler_instance
    
    if _scheduler_instance is None:
        return {
            "running": False,
            "message": "Scheduler no iniciado"
        }
    
    return _scheduler_instance.get_status()


# Iniciar automáticamente al importar el módulo
try:
    start_scheduler()
except Exception as e:
    logger.error(f"[Scheduler] Error al iniciar: {e}")
