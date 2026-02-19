"""
Gestor de sesiones para el RPA de Qualitas.

Proporciona funcionalidades para:
- Reutilizar sesiones guardadas
- Refrescar cookies antes de expirar
- Rotar sesiones entre múltiples cuentas
- Monitorear el estado de la sesión
"""

import json
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from playwright.async_api import BrowserContext, Page


@dataclass
class SessionInfo:
    """Información sobre una sesión guardada."""
    path: Path
    created_at: datetime
    last_used: datetime
    cookie_count: int
    is_valid: bool


class QualitasSessionManager:
    """
    Gestor de sesiones para Qualitas.
    
    Permite reutilizar sesiones guardadas y mantener la persistencia
    entre ejecuciones del RPA.
    """
    
    def __init__(self, sessions_dir: Optional[Path] = None):
        if sessions_dir is None:
            sessions_dir = Path(__file__).resolve().parent / "sessions"
        self.sessions_dir = sessions_dir
        self.sessions_dir.mkdir(parents=True, exist_ok=True)
        
    def get_session_path(self, identifier: str = "default") -> Path:
        """Obtiene la ruta de una sesión por identificador."""
        return self.sessions_dir / f"qualitas_session_{identifier}.json"
    
    def session_exists(self, identifier: str = "default") -> bool:
        """Verifica si existe una sesión guardada."""
        return self.get_session_path(identifier).exists()
    
    def get_session_info(self, identifier: str = "default") -> Optional[SessionInfo]:
        """Obtiene información sobre una sesión."""
        path = self.get_session_path(identifier)
        if not path.exists():
            return None
            
        try:
            stat = path.stat()
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            cookie_count = len(data.get("cookies", []))
            
            # Verificar si la sesión tiene cookies de Qualitas
            has_qualitas_cookies = any(
                "qualitas" in cookie.get("domain", "").lower() or
                "proordersistem" in cookie.get("domain", "").lower()
                for cookie in data.get("cookies", [])
            )
            
            return SessionInfo(
                path=path,
                created_at=datetime.fromtimestamp(stat.st_ctime),
                last_used=datetime.fromtimestamp(stat.st_mtime),
                cookie_count=cookie_count,
                is_valid=has_qualitas_cookies and cookie_count > 0
            )
        except Exception as e:
            print(f"[SessionManager] Error leyendo sesión: {e}")
            return None
    
    def is_session_fresh(self, identifier: str = "default", max_age_hours: int = 24) -> bool:
        """Verifica si una sesión es reciente (no expirada)."""
        info = self.get_session_info(identifier)
        if not info:
            return False
            
        age = datetime.now() - info.last_used
        return age < timedelta(hours=max_age_hours) and info.is_valid
    
    async def load_session(self, context: BrowserContext, identifier: str = "default") -> bool:
        """Carga una sesión guardada en un contexto de navegador."""
        path = self.get_session_path(identifier)
        if not path.exists():
            print(f"[SessionManager] No existe sesión: {path}")
            return False
            
        try:
            with open(path, "r", encoding="utf-8") as f:
                storage_state = json.load(f)
            
            # Añadir cookies al contexto
            for cookie in storage_state.get("cookies", []):
                try:
                    await context.add_cookies([cookie])
                except Exception as e:
                    print(f"[SessionManager] Error añadiendo cookie {cookie.get('name')}: {e}")
            
            print(f"[SessionManager] Sesión cargada: {len(storage_state.get('cookies', []))} cookies")
            return True
            
        except Exception as e:
            print(f"[SessionManager] Error cargando sesión: {e}")
            return False
    
    async def save_session(self, context: BrowserContext, identifier: str = "default") -> bool:
        """Guarda el estado de una sesión."""
        path = self.get_session_path(identifier)
        
        try:
            storage_state = await context.storage_state()
            with open(path, "w", encoding="utf-8") as f:
                json.dump(storage_state, f, indent=2, ensure_ascii=False)
            
            print(f"[SessionManager] Sesión guardada: {path}")
            return True
            
        except Exception as e:
            print(f"[SessionManager] Error guardando sesión: {e}")
            return False
    
    def list_sessions(self) -> list[SessionInfo]:
        """Lista todas las sesiones disponibles."""
        sessions = []
        for session_file in self.sessions_dir.glob("qualitas_session_*.json"):
            identifier = session_file.stem.replace("qualitas_session_", "")
            info = self.get_session_info(identifier)
            if info:
                sessions.append(info)
        return sessions
    
    def cleanup_old_sessions(self, max_age_days: int = 7) -> int:
        """Elimina sesiones antiguas. Retorna cantidad eliminada."""
        removed = 0
        cutoff = datetime.now() - timedelta(days=max_age_days)
        
        for session_file in self.sessions_dir.glob("qualitas_session_*.json"):
            try:
                mtime = datetime.fromtimestamp(session_file.stat().st_mtime)
                if mtime < cutoff:
                    session_file.unlink()
                    removed += 1
                    print(f"[SessionManager] Eliminada sesión antigua: {session_file.name}")
            except Exception as e:
                print(f"[SessionManager] Error eliminando {session_file}: {e}")
        
        return removed


async def verify_session_active(page: Page, dashboard_indicator: str = "dashboard") -> bool:
    """
    Verifica si una sesión está activa navegando a una página protegida.
    
    Args:
        page: Página de Playwright
        dashboard_indicator: Texto o selector que indica sesión activa
        
    Returns:
        True si la sesión está activa
    """
    try:
        # Navegar a la página principal
        await page.goto("https://proordersistem.com.mx/", wait_until="domcontentloaded", timeout=10000)
        
        # Verificar si estamos logueados (no redirigió a login)
        current_url = page.url
        
        # Indicadores de sesión activa
        if "login" in current_url.lower() or "signin" in current_url.lower():
            print("[SessionCheck] Redirigido a login - sesión expirada")
            return False
        
        # Verificar elementos de dashboard
        try:
            # Buscar elementos típicos del dashboard
            dashboard_elements = await page.locator(
                f'text={dashboard_indicator}, nav, .dashboard, .menu-principal, #sidebar'
            ).count()
            
            if dashboard_elements > 0:
                print("[SessionCheck] Sesión activa detectada")
                return True
                
        except Exception:
            pass
        
        # Verificar cookies de sesión
        cookies = await page.context.cookies()
        session_cookies = [c for c in cookies if "session" in c.get("name", "").lower() or 
                                              "auth" in c.get("name", "").lower()]
        
        if session_cookies:
            print(f"[SessionCheck] Cookies de sesión encontradas: {len(session_cookies)}")
            return True
        
        print("[SessionCheck] No se detectó sesión activa")
        return False
        
    except Exception as e:
        print(f"[SessionCheck] Error verificando sesión: {e}")
        return False
