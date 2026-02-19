"""
RPA scripts package para Qualitas.

Este paquete proporciona herramientas para automatización del portal de Qualitas:
- qualitas_login_stealth: Login con evasión de detección (Stealth + CDP)
- qualitas_login_auto: Login 100% automático con resolución de CAPTCHA
- qualitas_session_manager: Gestión de sesiones persistentes
- captcha_solver: Integración con servicios de resolución de CAPTCHA

Uso básico:
    from app.rpa.qualitas_login_stealth import load_config, run_login
    
    config = load_config()
    asyncio.run(run_login(config, Path("sessions/mi_sesion.json")))

Uso automático (con 2captcha):
    from app.rpa.qualitas_login_auto import load_config, run_login_auto
    
    config = load_config()
    asyncio.run(run_login_auto(config, Path("sessions/mi_sesion.json")))
"""

from .qualitas_login_stealth import (
    QualitasRpaConfig,
    load_config,
    validate_config,
    run_login,
    setup_stealth_browser_context,
    apply_cdp_evasion,
    wait_for_recaptcha_validation,
    humanized_fill,
)

from .qualitas_session_manager import (
    QualitasSessionManager,
    SessionInfo,
    verify_session_active,
)

from .captcha_solver import (
    CaptchaSolution,
    CaptchaProvider,
    TwoCaptchaProvider,
    AntiCaptchaProvider,
    get_captcha_provider,
    solve_qualitas_captcha,
)

from .qualitas_extractor import (
    OrdenEstatus,
    DashboardData,
    QualitasExtractor,
)

from .qualitas_modal_handler import (
    QualitasModalHandler,
    handle_qualitas_modal,
)

__all__ = [
    # Stealth
    "QualitasRpaConfig",
    "load_config",
    "validate_config",
    "run_login",
    "setup_stealth_browser_context",
    "apply_cdp_evasion",
    "wait_for_recaptcha_validation",
    "humanized_fill",
    # Session Manager
    "QualitasSessionManager",
    "SessionInfo",
    "verify_session_active",
    # CAPTCHA Solver
    "CaptchaSolution",
    "CaptchaProvider",
    "TwoCaptchaProvider",
    "AntiCaptchaProvider",
    "get_captcha_provider",
    "solve_qualitas_captcha",
    # Extractor
    "OrdenEstatus",
    "DashboardData",
    "QualitasExtractor",
    # Modal Handler
    "QualitasModalHandler",
    "handle_qualitas_modal",
]
