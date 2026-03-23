"""
Scheduler automático para extracción de piezas de Qualitas y CHUBB.

Ejecuta extracción de piezas diariamente a las 6:00 AM (configurable).
"""

import asyncio
import logging
import threading
import time
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

from app.modules.administracion.rpa_queue import (
    create_task, TaskType
)

logger = logging.getLogger(__name__)

# Configuración del scheduler de piezas
DEFAULT_PIEZAS_HOUR = 6  # 6:00 AM
DEFAULT_PIEZAS_MINUTE = 0

# Estado del scheduler
_piezas_scheduler = None
_scheduler_lock = threading.Lock()


class PiezasScheduler:
    """Scheduler para ejecutar extracción de piezas diariamente a una hora específica."""
    
    def __init__(self, hour: int = DEFAULT_PIEZAS_HOUR, minute: int = DEFAULT_PIEZAS_MINUTE):
        self.hour = hour
        self.minute = minute
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._running = False
        self._last_run: Optional[datetime] = None
        self._next_run: Optional[datetime] = None
        self._enabled = True  # Por defecto habilitado
        
    def start(self):
        """Inicia el scheduler en un thread separado."""
        if self._thread and self._thread.is_alive():
            logger.info("[PiezasScheduler] Ya está corriendo")
            return
        
        self._running = True
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        logger.info(f"[PiezasScheduler] Iniciado - Hora de ejecución: {self.hour:02d}:{self.minute:02d}")
    
    def stop(self):
        """Detiene el scheduler."""
        self._running = False
        self._stop_event.set()
        logger.info("[PiezasScheduler] Deteniendo...")
    
    def _calculate_next_run(self) -> datetime:
        """Calcula la próxima hora de ejecución (hoy o mañana)."""
        now = datetime.now()
        next_run = now.replace(hour=self.hour, minute=self.minute, second=0, microsecond=0)
        
        # Si ya pasó la hora hoy, programar para mañana
        if next_run <= now:
            next_run = next_run + timedelta(days=1)
        
        return next_run
    
    def _run_loop(self):
        """Loop principal del scheduler."""
        # Esperar un poco al inicio para que el servidor termine de cargar
        time.sleep(30)
        
        while not self._stop_event.is_set():
            try:
                if not self._enabled:
                    logger.debug("[PiezasScheduler] Deshabilitado, esperando...")
                    if self._stop_event.wait(60):  # Verificar cada minuto
                        break
                    continue
                
                # Calcular próxima ejecución
                self._next_run = self._calculate_next_run()
                seconds_until_next = (self._next_run - datetime.now()).total_seconds()
                
                logger.info(f"[PiezasScheduler] Próxima ejecución: {self._next_run.strftime('%Y-%m-%d %H:%M:%S')} "
                          f"(en {seconds_until_next/3600:.1f} horas)")
                
                # Esperar hasta la próxima ejecución
                if self._stop_event.wait(seconds_until_next):
                    break
                
                # Ejecutar extracción de piezas
                self._execute_piezas_extraction()
                
            except Exception as e:
                logger.exception("[PiezasScheduler] Error en loop")
                time.sleep(60)  # Esperar 1 minuto antes de reintentar
        
        logger.info("[PiezasScheduler] Loop terminado")
    
    def _execute_piezas_extraction(self):
        """Ejecuta la extracción de piezas para Qualitas y CHUBB."""
        self._last_run = datetime.now()
        logger.info("[PiezasScheduler] Iniciando extracción de piezas programada")
        
        # Crear tarea para Qualitas piezas
        try:
            task_id_qualitas = create_task(
                TaskType.QUALITAS_PIEZAS,
                {
                    "scheduled": True,
                    "scheduled_at": datetime.now().isoformat(),
                    "auto_retry": True
                }
            )
            logger.info(f"[PiezasScheduler] Tarea Qualitas creada: {task_id_qualitas}")
        except Exception as e:
            logger.error(f"[PiezasScheduler] Error creando tarea Qualitas: {e}")
        
        # Esperar 5 minutos antes de iniciar CHUBB (para no saturar el servidor)
        time.sleep(300)
        
        # Crear tarea para CHUBB piezas
        try:
            task_id_chubb = create_task(
                TaskType.CHUBB_PIEZAS,
                {
                    "scheduled": True,
                    "scheduled_at": datetime.now().isoformat(),
                    "auto_retry": True,
                    "fecha_desde": (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")  # Últimos 7 días
                }
            )
            logger.info(f"[PiezasScheduler] Tarea CHUBB creada: {task_id_chubb}")
        except Exception as e:
            logger.error(f"[PiezasScheduler] Error creando tarea CHUBB: {e}")
    
    def force_run(self) -> Dict[str, str]:
        """Fuerza una ejecución inmediata. Retorna los IDs de las tareas."""
        logger.info("[PiezasScheduler] Ejecución forzada solicitada")
        
        task_ids = {}
        
        # Qualitas
        try:
            task_id = create_task(
                TaskType.QUALITAS_PIEZAS,
                {"forced": True, "scheduled_at": datetime.now().isoformat()}
            )
            task_ids['qualitas'] = task_id
        except Exception as e:
            logger.error(f"[PiezasScheduler] Error creando tarea Qualitas: {e}")
        
        # CHUBB
        try:
            task_id = create_task(
                TaskType.CHUBB_PIEZAS,
                {"forced": True, "scheduled_at": datetime.now().isoformat()}
            )
            task_ids['chubb'] = task_id
        except Exception as e:
            logger.error(f"[PiezasScheduler] Error creando tarea CHUBB: {e}")
        
        return task_ids
    
    def get_status(self) -> Dict[str, Any]:
        """Retorna el estado actual del scheduler."""
        return {
            "running": self._running,
            "enabled": self._enabled,
            "schedule_time": f"{self.hour:02d}:{self.minute:02d}",
            "last_run": self._last_run.isoformat() if self._last_run else None,
            "next_run": self._next_run.isoformat() if self._next_run else None,
            "time_until_next_run": (
                (self._next_run - datetime.now()).total_seconds()
                if self._next_run else None
            )
        }
    
    def set_enabled(self, enabled: bool):
        """Habilita o deshabilita el scheduler."""
        self._enabled = enabled
        logger.info(f"[PiezasScheduler] {'Habilitado' if enabled else 'Deshabilitado'}")
    
    def set_schedule(self, hour: int, minute: int = 0):
        """Cambia la hora de ejecución."""
        self.hour = hour
        self.minute = minute
        # Recalcular próxima ejecución
        self._next_run = self._calculate_next_run()
        logger.info(f"[PiezasScheduler] Nueva hora de ejecución: {hour:02d}:{minute:02d}")


def get_piezas_scheduler() -> PiezasScheduler:
    """Obtiene la instancia singleton del scheduler de piezas."""
    global _piezas_scheduler
    
    with _scheduler_lock:
        if _piezas_scheduler is None:
            _piezas_scheduler = PiezasScheduler()
    
    return _piezas_scheduler


def start_piezas_scheduler():
    """Inicia el scheduler de piezas."""
    scheduler = get_piezas_scheduler()
    scheduler.start()
    return scheduler


def stop_piezas_scheduler():
    """Detiene el scheduler de piezas."""
    scheduler = get_piezas_scheduler()
    scheduler.stop()


def force_run_piezas() -> Dict[str, str]:
    """Fuerza una ejecución inmediata de extracción de piezas."""
    scheduler = get_piezas_scheduler()
    return scheduler.force_run()


def get_piezas_scheduler_status() -> Dict[str, Any]:
    """Obtiene el estado del scheduler de piezas."""
    scheduler = get_piezas_scheduler()
    return scheduler.get_status()


# Iniciar automáticamente al importar el módulo
def init_piezas_scheduler():
    """Inicializa el scheduler de piezas."""
    try:
        logger.info("[PiezasScheduler] Inicializando...")
        start_piezas_scheduler()
        logger.info("[PiezasScheduler] Scheduler iniciado automáticamente")
    except Exception as e:
        logger.error(f"[PiezasScheduler] Error al iniciar: {e}")


# Inicializar al importar el módulo (con delay para permitir que el servidor cargue)
threading.Timer(35, init_piezas_scheduler).start()
