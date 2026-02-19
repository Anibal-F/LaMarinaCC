"""
Solucionador de CAPTCHA para el RPA de Qualitas.

Soporta múltiples proveedores:
- 2captcha (recomendado, más estable)
- Anti-Captcha
- Capsolver

Para reCAPTCHA v2, el flujo es:
1. Enviar sitekey y URL al servicio
2. Esperar resolución (10-60 segundos típicamente)
3. Recibir token g-recaptcha-response
4. Inyectar token en el formulario
"""

import asyncio
import os
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional

import aiohttp


@dataclass
class CaptchaSolution:
    """Resultado de la resolución de un CAPTCHA."""
    token: str
    cost: float  # Costo en USD
    solve_time_seconds: float
    provider: str


class CaptchaProvider(ABC):
    """Interfaz base para proveedores de resolución de CAPTCHA."""
    
    def __init__(self, api_key: str):
        self.api_key = api_key
    
    @abstractmethod
    async def solve_recaptcha_v2(
        self, 
        site_key: str, 
        page_url: str,
        invisible: bool = False
    ) -> CaptchaSolution:
        """Resuelve un reCAPTCHA v2 y retorna el token."""
        pass


class TwoCaptchaProvider(CaptchaProvider):
    """
    Proveedor 2captcha.com para resolución de CAPTCHA.
    
    Documentación: https://2captcha.com/2captcha-api
    Precios aproximados (2024):
    - reCAPTCHA v2: $2.99 por 1000 resoluciones
    """
    
    API_BASE = "https://2captcha.com"
    POLL_INTERVAL = 5  # Segundos entre polls
    MAX_WAIT_TIME = 180  # Máximo tiempo de espera
    
    async def solve_recaptcha_v2(
        self,
        site_key: str,
        page_url: str,
        invisible: bool = False
    ) -> CaptchaSolution:
        """
        Resuelve reCAPTCHA v2 usando 2captcha.
        
        Args:
            site_key: El data-sitekey del widget reCAPTCHA
            page_url: URL de la página donde está el reCAPTCHA
            invisible: True si es reCAPTCHA invisible
            
        Returns:
            CaptchaSolution con el token g-recaptcha-response
        """
        import time
        start_time = time.monotonic()
        
        # Headers para evitar compresión Brotli
        headers = {
            "Accept-Encoding": "gzip, deflate",
            "Accept": "application/json",
        }
        
        async with aiohttp.ClientSession(headers=headers) as session:
            # Paso 1: Enviar el CAPTCHA para resolver
            submit_url = f"{self.API_BASE}/in.php"
            payload = {
                "key": self.api_key,
                "method": "userrecaptcha",
                "googlekey": site_key,
                "pageurl": page_url,
                "json": 1,
                "invisible": 1 if invisible else 0,
            }
            
            async with session.post(submit_url, data=payload) as resp:
                result = await resp.json()
                
            if result.get("status") != 1:
                error_code = result.get("request", "unknown")
                raise RuntimeError(f"2captcha error: {error_code}")
            
            captcha_id = result["request"]
            print(f"[2captcha] CAPTCHA enviado, ID: {captcha_id}")
            
            # Paso 2: Poll por el resultado
            result_url = f"{self.API_BASE}/res.php"
            elapsed = 0
            
            while elapsed < self.MAX_WAIT_TIME:
                await asyncio.sleep(self.POLL_INTERVAL)
                elapsed += self.POLL_INTERVAL
                
                params = {
                    "key": self.api_key,
                    "action": "get",
                    "id": captcha_id,
                    "json": 1,
                }
                
                async with session.get(result_url, params=params) as resp:
                    result = await resp.json()
                
                status = result.get("status")
                
                if status == 1:
                    # Resuelto!
                    token = result["request"]
                    solve_time = time.monotonic() - start_time
                    print(f"[2captcha] Resuelto en {solve_time:.1f}s")
                    
                    return CaptchaSolution(
                        token=token,
                        cost=0.003,  # ~$2.99/1000
                        solve_time_seconds=solve_time,
                        provider="2captcha"
                    )
                
                elif result.get("request") == "CAPCHA_NOT_READY":
                    print(f"[2captcha] Esperando... ({elapsed}s)")
                    continue
                else:
                    error = result.get("request", "unknown")
                    raise RuntimeError(f"2captcha error: {error}")
            
            raise TimeoutError(f"2captcha timeout después de {self.MAX_WAIT_TIME}s")


class AntiCaptchaProvider(CaptchaProvider):
    """
    Proveedor Anti-Captcha.com
    
    Precios similares a 2captcha, API más moderna.
    """
    
    API_BASE = "https://api.anti-captcha.com"
    POLL_INTERVAL = 5
    MAX_WAIT_TIME = 180
    
    async def solve_recaptcha_v2(
        self,
        site_key: str,
        page_url: str,
        invisible: bool = False
    ) -> CaptchaSolution:
        import time
        start_time = time.monotonic()
        
        # Headers para evitar compresión Brotli
        headers = {
            "Accept-Encoding": "gzip, deflate",
            "Accept": "application/json",
        }
        
        async with aiohttp.ClientSession(headers=headers) as session:
            # Crear tarea
            create_url = f"{self.API_BASE}/createTask"
            payload = {
                "clientKey": self.api_key,
                "task": {
                    "type": "RecaptchaV2TaskProxyless",
                    "websiteURL": page_url,
                    "websiteKey": site_key,
                    "isInvisible": invisible,
                }
            }
            
            async with session.post(create_url, json=payload) as resp:
                result = await resp.json()
            
            if result.get("errorId") != 0:
                raise RuntimeError(f"Anti-captcha error: {result.get('errorDescription')}")
            
            task_id = result["taskId"]
            print(f"[anti-captcha] Tarea creada, ID: {task_id}")
            
            # Poll por resultado
            result_url = f"{self.API_BASE}/getTaskResult"
            elapsed = 0
            
            while elapsed < self.MAX_WAIT_TIME:
                await asyncio.sleep(self.POLL_INTERVAL)
                elapsed += self.POLL_INTERVAL
                
                payload = {
                    "clientKey": self.api_key,
                    "taskId": task_id,
                }
                
                async with session.post(result_url, json=payload) as resp:
                    result = await resp.json()
                
                if result.get("errorId") != 0:
                    raise RuntimeError(f"Anti-captcha error: {result.get('errorDescription')}")
                
                status = result.get("status")
                
                if status == "ready":
                    token = result["solution"]["gRecaptchaResponse"]
                    solve_time = time.monotonic() - start_time
                    cost = result.get("cost", 0.003)
                    print(f"[anti-captcha] Resuelto en {solve_time:.1f}s")
                    
                    return CaptchaSolution(
                        token=token,
                        cost=cost,
                        solve_time_seconds=solve_time,
                        provider="anti-captcha"
                    )
                
                print(f"[anti-captcha] Esperando... ({elapsed}s)")
            
            raise TimeoutError(f"Anti-captcha timeout después de {self.MAX_WAIT_TIME}s")


def get_captcha_provider(provider_name: Optional[str] = None) -> CaptchaProvider:
    """
    Factory para obtener el proveedor de CAPTCHA configurado.
    
    Lee de variables de entorno:
    - CAPTCHA_PROVIDER (2captcha, anti-captcha)
    - CAPTCHA_API_KEY
    """
    if provider_name is None:
        provider_name = os.getenv("CAPTCHA_PROVIDER", "2captcha").lower()
    
    api_key = os.getenv("CAPTCHA_API_KEY")
    if not api_key:
        raise ValueError("CAPTCHA_API_KEY no configurada en variables de entorno")
    
    if provider_name == "2captcha":
        return TwoCaptchaProvider(api_key)
    elif provider_name in ("anti-captcha", "anticaptcha"):
        return AntiCaptchaProvider(api_key)
    else:
        raise ValueError(f"Proveedor desconocido: {provider_name}")


async def solve_qualitas_captcha(
    page_url: str = "https://proordersistem.com.mx/",
    site_key: Optional[str] = None
) -> CaptchaSolution:
    """
    Resuelve el reCAPTCHA de Qualitas automáticamente.
    
    Si no se proporciona site_key, intenta detectarlo automáticamente
    o usa el conocido para el sitio.
    """
    # Site key para proordersistem.com.mx (puede cambiar, idealmente extraerlo dinámicamente)
    # Este es un ejemplo, deberías verificar el sitekey real inspeccionando el HTML
    if site_key is None:
        site_key = os.getenv("QUALITAS_RECAPTCHA_SITE_KEY", "")
        if not site_key:
            raise ValueError(
                "QUALITAS_RECAPTCHA_SITE_KEY no configurada. "
                "Inspecciona el HTML del reCAPTCHA para obtener el data-sitekey."
            )
    
    provider = get_captcha_provider()
    return await provider.solve_recaptcha_v2(site_key, page_url)
