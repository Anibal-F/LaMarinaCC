"""
Scheduler automático para extracción de piezas de Qualitas y CHUBB.

Ejecuta extracción de piezas diariamente a la hora configurada en la DB.
Zona horaria: America/Mazatlan (Mazatlán, Sinaloa)
"""

import asyncio
import logging
import threading
import time
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, Tuple

import pytz
from app.modules.administracion.rpa_queue import (
    create_task, TaskType
)
from app.core.db import get_connection

logger = logging.getLogger(__name__)

# Zona horaria de Mazatlán
MAZATLAN_TZ = pytz.timezone('America/Mazatlan')

# Configuración por defecto
DEFAULT_PIEZAS_TIME = "06:00"  # Formato "HH:MM"

# Estado del scheduler
_piezas_scheduler = None
_scheduler_lock = threading.Lock()


def _now_mazatlan() -> datetime:
    """Retorna la fecha/hora actual en zona horaria de Mazatlán."""
    return datetime.now(MAZATLAN_TZ)


def _get_fecha_desde_piezas() -> str:
    """
    Calcula la fecha inicial para extracción de piezas.
    Retorna el primer día de hace 2 meses (sin contar el mes actual).
    
    Ejemplo: Hoy es 23 de Marzo 2026 → Retorna '2026-01-01'
             Hoy es 15 de Enero 2026 → Retorna '2025-11-01'
    """
    now = _now_mazatlan()
    
    # Restar 2 meses
    mes_target = now.month - 2
    año_target = now.year
    
    # Ajustar si nos pasamos de enero
    if mes_target <= 0:
        mes_target += 12
        año_target -= 1
    
    # Formatear como YYYY-MM-DD del primer día de ese mes
    fecha_desde = f"{año_target}-{mes_target:02d}-01"
    
    logger.info(f"[PiezasScheduler] Fecha inicial calculada: {fecha_desde} (hoy: {now.strftime('%Y-%m-%d')})")
    return fecha_desde


def _get_schedule_time_from_db() -> Tuple[int, int]:
    """
    Lee la hora de ejecución desde la base de datos.
    Busca la primera credencial con autosync_piezas = true.
    Retorna (hora, minuto) como enteros en hora de Mazatlán.
    """
    try:
        with get_connection() as conn:
            # Asegurar que las columnas existan
            conn.execute("""
                ALTER TABLE aseguradora_credenciales 
                ADD COLUMN IF NOT EXISTS autosync_piezas BOOLEAN NOT NULL DEFAULT FALSE,
                ADD COLUMN IF NOT EXISTS synctime_piezas VARCHAR(5) DEFAULT '06:00'
            """)
            
            row = conn.execute(
                """
                SELECT synctime_piezas 
                FROM aseguradora_credenciales 
                WHERE autosync_piezas = TRUE 
                ORDER BY id 
                LIMIT 1
                """
            ).fetchone()
            
            if row and row[0]:
                time_str = row[0]
                # Parsear "HH:MM"
                parts = time_str.split(':')
                if len(parts) == 2:
                    hour = int(parts[0])
                    minute = int(parts[1])
                    # Validar rango
                    if 0 <= hour <= 23 and 0 <= minute <= 59:
                        logger.info(f"[PiezasScheduler] Hora leída desde DB (Mazatlán): {hour:02d}:{minute:02d}")
                        return (hour, minute)
    except Exception as e:
        logger.error(f"[PiezasScheduler] Error leyendo hora de DB: {e}")
    
    # Valor por defecto (6:00 AM Mazatlán)
    return (6, 0)


class PiezasScheduler:
    """Scheduler para ejecutar extracción de piezas diariamente a una hora específica."""
    
    def __init__(self, hour: int = None, minute: int = None):
        # Si no se proporciona hora, leer desde DB
        if hour is None or minute is None:
            hour, minute = _get_schedule_time_from_db()
        
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
        """Calcula la próxima hora de ejecución (hoy o mañana) en hora de Mazatlán."""
        now = _now_mazatlan()
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
                
                # Recargar hora desde DB (permite cambios en caliente)
                new_hour, new_minute = _get_schedule_time_from_db()
                if new_hour != self.hour or new_minute != self.minute:
                    logger.info(f"[PiezasScheduler] Hora actualizada (Mazatlán): {self.hour:02d}:{self.minute:02d} -> {new_hour:02d}:{new_minute:02d}")
                    self.hour = new_hour
                    self.minute = new_minute
                
                # Calcular próxima ejecución
                self._next_run = self._calculate_next_run()
                seconds_until_next = (self._next_run - _now_mazatlan()).total_seconds()
                
                logger.info(f"[PiezasScheduler] Próxima ejecución: {self._next_run.strftime('%Y-%m-%d %H:%M:%S')} "
                          f"(en {seconds_until_next/3600:.1f} horas)")
                
                # Esperar hasta la próxima ejecución (verificar cada minuto si hay cambios)
                wait_interval = min(seconds_until_next, 60)  # Verificar cada minuto máximo
                elapsed = 0
                while elapsed < seconds_until_next and not self._stop_event.is_set():
                    if self._stop_event.wait(wait_interval):
                        return
                    elapsed += wait_interval
                
                if self._stop_event.is_set():
                    break
                
                # Ejecutar extracción de piezas
                self._execute_piezas_extraction()
                
            except Exception as e:
                logger.exception("[PiezasScheduler] Error en loop")
                time.sleep(60)  # Esperar 1 minuto antes de reintentar
        
        logger.info("[PiezasScheduler] Loop terminado")
    
    def _execute_piezas_extraction(self):
        """Ejecuta la extracción de piezas para Qualitas y CHUBB."""
        self._last_run = _now_mazatlan()
        logger.info(f"[PiezasScheduler] Iniciando extracción de piezas programada (Mazatlán: {self._last_run.strftime('%Y-%m-%d %H:%M:%S')})")
        
        # Crear tarea para Qualitas piezas
        try:
            task_id_qualitas = create_task(
                TaskType.QUALITAS_PIEZAS,
                {
                    "scheduled": True,
                    "scheduled_at": _now_mazatlan().isoformat(),
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
                    "scheduled_at": _now_mazatlan().isoformat(),
                    "auto_retry": True,
                    "fecha_desde": _get_fecha_desde_piezas()  # Primer día de hace 2 meses
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
        now = _now_mazatlan()
        return {
            "running": self._running,
            "enabled": self._enabled,
            "schedule_time": f"{self.hour:02d}:{self.minute:02d}",
            "timezone": "America/Mazatlan",
            "last_run": self._last_run.isoformat() if self._last_run else None,
            "next_run": self._next_run.isoformat() if self._next_run else None,
            "time_until_next_run": (
                (self._next_run - now).total_seconds()
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
