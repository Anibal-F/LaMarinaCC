# Sistema de Credenciales para RPA

Este sistema permite gestionar las credenciales de las aseguradoras (QUALITAS, CHUBB, etc.) desde la base de datos, facilitando su administración desde el panel de Admin.

## Configuración

### 1. Crear la tabla en PostgreSQL

Ejecuta este SQL en PgAdmin4:

```sql
CREATE TABLE aseguradora_credenciales (
    id SERIAL PRIMARY KEY,
    seguro VARCHAR(100) NOT NULL,
    plataforma_url VARCHAR(500) NOT NULL,
    usuario VARCHAR(200) NOT NULL,
    password VARCHAR(500) NOT NULL,
    taller_id VARCHAR(100),
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índice para búsquedas rápidas
CREATE INDEX idx_aseguradora_seguro ON aseguradora_credenciales(seguro);
```

### 2. Insertar credenciales iniciales (opcional)

```sql
INSERT INTO aseguradora_credenciales (seguro, plataforma_url, usuario, password, taller_id, activo)
VALUES 
    ('QUALITAS', 'https://proordersistem.com.mx/', 'tu_usuario', 'tu_password', '96627', true),
    ('CHUBB', 'https://acg-prod-mx.audatex.com.mx/Audanet/', 'tu_usuario', 'tu_password', NULL, true);
```

## Uso de los Scripts RPA

### CHUBB / Audatex

```bash
# Usar credenciales desde la base de datos (default)
python -m app.rpa.chubb_full_workflow

# Usar credenciales desde archivo .envChubb
python -m app.rpa.chubb_full_workflow --use-env

# Otros parámetros
python -m app.rpa.chubb_full_workflow --headless --skip-login
```

### QUALITAS

```bash
# Usar credenciales desde la base de datos (default)
python -m app.rpa.qualitas_full_workflow

# Usar credenciales desde archivo .envQualitas
python -m app.rpa.qualitas_full_workflow --use-env

# Otros parámetros
python -m app.rpa.qualitas_full_workflow --headless --status "Asignados"
```

## Panel de Administración

Accede a **Admin → Credenciales** en el frontend para:

- Ver todas las credenciales configuradas
- Agregar nuevas credenciales
- Editar credenciales existentes
- Activar/Desactivar credenciales
- Eliminar credenciales

## Prioridad de Credenciales

1. **Base de Datos** (por defecto): Las credenciales se leen desde la tabla `aseguradora_credenciales`
2. **Archivo .env** (fallback): Si no hay credenciales en la DB o se usa `--use-env`

## Seguridad

- Las contraseñas se almacenan en texto plano en la DB (considerar encriptación futura)
- Solo usuarios administradores pueden ver/modificar credenciales
- Las credenciales inactivas no se utilizan en los scripts RPA

## Funciones Helper

El módulo `credentials_helper.py` proporciona:

```python
from app.rpa.credentials_helper import (
    get_qualitas_credentials,    # Obtiene credenciales de Qualitas
    get_chubb_credentials,       # Obtiene credenciales de CHUBB
    setup_qualitas_env,          # Configura QUALITAS_* en os.environ
    setup_chubb_env,             # Configura CHUBB_* en os.environ
    get_all_active_credentials   # Obtiene todas las credenciales activas
)
```
