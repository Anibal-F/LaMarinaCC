# RPA Qualitas - Stealth + CDP Avanzado

Este módulo proporciona un RPA robusto para interactuar con el portal de Qualitas, implementando técnicas avanzadas de evasión de detección para reCAPTCHA v2.

## 🚀 Características

- **Playwright Stealth**: Oculta señales de automatización
- **CDP Avanzado**: Chrome DevTools Protocol para modificar propiedades del navegador
- **User-Agent rotativo**: Diferentes User Agents realistas
- **Viewport aleatorio**: Simula diferentes resoluciones de pantalla
- **Manejo humanizado**: Delays aleatorios entre acciones
- **Gestión de sesiones**: Reutilización y persistencia de sesiones

## 📁 Estructura

```
app/rpa/
├── __init__.py                    # Exportaciones del módulo
├── qualitas_login_stealth.py      # Login principal con stealth
├── qualitas_session_manager.py    # Gestión de sesiones
├── qualitas_example_usage.py      # Ejemplos de uso
├── sessions/                      # Sesiones guardadas (gitignored)
└── README.md                      # Este archivo
```

## 🔧 Configuración

### Variables de Entorno (.envQualitas)

```env
# Obligatorias
QUALITAS_LOGIN_URL=https://proordersistem.com.mx/
QUALITAS_USER=tu_usuario@ejemplo.com
QUALITAS_PASSWORD=tu_password
QUALITAS_TALLER_ID=12345

# Opciones de Stealth
QUALITAS_USE_STEALTH=true          # Activar Playwright Stealth
QUALITAS_USE_CDP_EVASION=true      # Activar evasión CDP
QUALITAS_ROTATE_UA=true            # Rotar User-Agents
QUALITAS_RANDOM_VIEWPORT=true      # Viewport aleatorio

# Selectores (defaults funcionan para el sitio actual)
QUALITAS_EMAIL_SELECTOR=input[placeholder="Email"]
QUALITAS_PASSWORD_SELECTOR=input[placeholder="Password"]
QUALITAS_TALLER_ID_SELECTOR=input[placeholder="ID-Taller"]
QUALITAS_TERMS_SELECTOR=input[type="checkbox"][name="tyc"][value="1"]
QUALITAS_RECAPTCHA_IFRAME_SELECTOR=iframe[title*="reCAPTCHA"]
QUALITAS_RECAPTCHA_ANCHOR_SELECTOR=#recaptcha-anchor
QUALITAS_LOGIN_BUTTON_SELECTOR=input[type="submit"][value="Log In"]

# Timeouts
QUALITAS_RECAPTCHA_TIMEOUT_MS=180000
QUALITAS_HEADLESS=false
QUALITAS_SLOWMO_MS=60
```

## 🎯 Uso

### 1. Login Básico con Stealth

```bash
cd backend
python -m app.rpa.qualitas_login_stealth
```

### 2. Modo Headless

```bash
python -m app.rpa.qualitas_login_stealth --headless
```

### 3. Desactivar Stealth (para debugging)

```bash
python -m app.rpa.qualitas_login_stealth --no-stealth --no-cdp
```

### 4. Uso Programático

```python
import asyncio
from pathlib import Path
from app.rpa.qualitas_login_stealth import load_config, run_login

async def main():
    config = load_config()
    await run_login(config, Path("sessions/mi_sesion.json"))

asyncio.run(main())
```

### 5. Reutilización de Sesión

```python
from app.rpa.qualitas_session_manager import QualitasSessionManager

manager = QualitasSessionManager()

# Verificar si hay sesión fresca
if manager.is_session_fresh(max_age_hours=8):
    # Cargar sesión existente
    await manager.load_session(context)
else:
    # Hacer login nuevo
    ...
```

## 🛡️ Técnicas de Evasión Implementadas

### Playwright Stealth
- Oculta `navigator.webdriver`
- Modifica `navigator.plugins`
- Modifica `navigator.languages`
- Mock de Chrome runtime
- WebGL consistente

### CDP Avanzado
- `Runtime.evaluate` para scripts de evasión
- Modificación de iframes
- Ocultación de automation flags

### Comportamiento Humanizado
- Delays aleatorios entre teclas (50-150ms)
- Delays en clicks (100-300ms)
- Pausas naturales entre acciones
- Viewports comunes (1920x1080, 1366x768, etc.)

## 🧪 Testing

Para verificar que la evasión funciona:

```python
# Verificar navigator.webdriver
is_webdriver = await page.evaluate("() => navigator.webdriver")
print(f"webdriver detectado: {is_webdriver}")  # Debe ser None/undefined

# Verificar plugins
plugins = await page.evaluate("() => navigator.plugins.length")
print(f"Plugins: {plugins}")  # Debe ser > 0
```

## ⚠️ Notas sobre reCAPTCHA

- El sistema **requiere intervención humana** para reCAPTCHA v2
- Si aparece challenge de imágenes, resuélvelo manualmente
- El timeout por defecto es de 180 segundos (configurable)

## 🔒 Seguridad

- Las sesiones se guardan en `app/rpa/sessions/` (gitignored)
- Las credenciales nunca se guardan en el código
- Usar `.envQualitas` para configuración sensible

## 🐛 Troubleshooting

### "Timeout en login"
- Verifica que los selectores sean correctos
- Aumenta `QUALITAS_RECAPTCHA_TIMEOUT_MS`
- Revisa el screenshot en `sessions/login_error.png`

### "reCAPTCHA detecta automatización"
- Asegúrate de usar `--no-stealth=false`
- Verifica que `playwright-stealth` esté instalado
- Intenta con diferente User-Agent

### "Sesión no persiste"
- Verifica permisos de escritura en `app/rpa/sessions/`
- Asegúrate de que el contexto se cierre correctamente

## 📚 Dependencias

```
playwright>=1.40.0
playwright-stealth>=2.0.0
python-dotenv>=1.0.0
```

Instalar:
```bash
pip install playwright playwright-stealth python-dotenv
playwright install chromium
```
