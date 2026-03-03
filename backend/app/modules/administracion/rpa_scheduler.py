"""
Scheduler automático para actualización de indicadores de Qualitas y CHUBB.

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

# Estado del scheduler
_schedulers = {}  # Diccionario para múltiples schedulers


class RPAScheduler:
    """Scheduler para ejecutar RPA periódicamente."""
    
    def __init__(self, name: str, task_type: TaskType, interval_hours: int = DEFAULT_INTERVAL_HOURS):
        self.name = name
        self.task_type = task_type
        self.interval_hours = interval_hours
        self.interval_seconds = interval_hours * 3600
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._current_task_id: Optional[str] = None
        self._last_run_time: Optional[datetime] = None
        self._next_run_time: Optional[datetime] = None
        self._running = False
        
    def start(self):
        """Inicia el scheduler en un thread separado."""
        if self._thread and self._thread.is_alive():
            logger.info(f"[Scheduler {self.name}] Ya está corriendo")
            return
        
        self._running = True
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        logger.info(f"[Scheduler {self.name}] Iniciado - Intervalo: {self.interval_hours} horas")
    
    def stop(self):
        """Detiene el scheduler."""
        self._running = False
        self._stop_event.set()
        logger.info(f"[Scheduler {self.name}] Deteniendo...")
    
    def _run_loop(self):
        """Loop principal del scheduler."""
        # Esperar un poco al inicio para que el servidor termine de cargar
        time.sleep(30)
        
        while not self._stop_event.is_set():
            try:
                self._next_run_time = datetime.now() + timedelta(seconds=self.interval_seconds)
                logger.info(f"[Scheduler {self.name}] Próxima ejecución: {self._next_run_time.strftime('%Y-%m-%d %H:%M:%S')}")
                
                # Esperar hasta el próximo intervalo
                if self._stop_event.wait(self.interval_seconds):
                    break
                
                # Ejecutar actualización
                self._execute_update()
                
            except Exception as e:
                logger.exception(f"[Scheduler {self.name}] Error en loop")
                time.sleep(60)  # Esperar 1 minuto antes de reintentar
    
    def _execute_update(self):
        """Ejecuta la actualización de indicadores."""
        logger.info(f"[Scheduler {self.name}] Iniciando actualización programada")
        self._last_run_time = datetime.now()
        
        # Verificar si hay una tarea en curso
        if self._current_task_id:
            task = get_task(self._current_task_id)
            if task and task['status'] in [TaskStatus.PENDING.value, TaskStatus.RUNNING.value]:
                logger.info(f"[Scheduler {self.name}] Ya hay una tarea en curso: {self._current_task_id}")
                return
        
        # Crear tarea en la cola
        self._current_task_id = create_task(
            self.task_type,
            {
                "auto_retry": True,
                "scheduled": True,
                "scheduled_at": datetime.now().isoformat()
            }
        )
        
        logger.info(f"[Scheduler {self.name}] Tarea creada: {self._current_task_id}")
    
    def force_run(self) -> str:
        """Fuerza una ejecución inmediata. Retorna el ID de la tarea."""
        logger.info(f"[Scheduler {self.name}] Ejecución forzada solicitada")
        
        task_id = create_task(
            self.task_type,
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
            "name": self.name,
            "running": self._running,
            "interval_hours": self.interval_hours,
            "last_run": self._last_run_time.isoformat() if self._last_run_time else None,
            "next_run": self._next_run_time.isoformat() if self._next_run_time else None,
            "current_task_id": self._current_task_id,
            "time_until_next_run": (
                (self._next_run_time - datetime.now()).total_seconds() 
                if self._next_run_time else None
            )
        }


def get_or_create_scheduler(name: str, task_type: TaskType, interval_hours: int = DEFAULT_INTERVAL_HOURS) -> RPAScheduler:
    """Obtiene o crea un scheduler."""
    global _schedulers
    
    if name not in _schedulers:
        _schedulers[name] = RPAScheduler(name, task_type, interval_hours)
    
    return _schedulers[name]


def start_scheduler(name: str = "qualitas", interval_hours: int = DEFAULT_INTERVAL_HOURS):
    """Inicia un scheduler específico."""
    global _schedulers
    
    task_type_map = {
        "qualitas": TaskType.QUALITAS_EXTRACT,
        "chubb": TaskType.CHUBB_EXTRACT
    }
    
    if name not in task_type_map:
        raise ValueError(f"Scheduler desconocido: {name}. Opciones: {list(task_type_map.keys())}")
    
    scheduler = get_or_create_scheduler(name, task_type_map[name], interval_hours)
    scheduler.start()
    
    return scheduler


def stop_scheduler(name: str = None):
    """Detiene un scheduler específico o todos."""
    global _schedulers
    
    if name:
        if name in _schedulers:
            _schedulers[name].stop()
    else:
        for scheduler in _schedulers.values():
            scheduler.stop()


def force_run_scheduler(name: str = "qualitas") -> str:
    """Fuerza una ejecución inmediata."""
    global _schedulers
    
    if name not in _schedulers:
        start_scheduler(name)
    
    return _schedulers[name].force_run()


def get_scheduler_status(name: str = None) -> Dict[str, Any]:
    """Obtiene el estado del scheduler."""
    global _schedulers
    
    if name:
        if name not in _schedulers:
            return {
                "name": name,
                "running": False,
                "message": f"Scheduler {name} no iniciado"
            }
        return _schedulers[name].get_status()
    
    # Retornar estado de todos los schedulers
    return {
        name: scheduler.get_status()
        for name, scheduler in _schedulers.items()
    }


# Iniciar schedulers automáticamente al importar el módulo
try:
    # Iniciar scheduler de Qualitas
    start_scheduler("qualitas")
    
    # Iniciar scheduler de CHUBB
    start_scheduler("chubb")
    
    logger.info("[Scheduler] Todos los schedulers iniciados automáticamente")
except Exception as e:
    logger.error(f"[Scheduler] Error al iniciar schedulers: {e}")
