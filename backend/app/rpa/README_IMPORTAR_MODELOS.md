# Importación de Modelos de Autos desde Qualitas

Guía para extraer los modelos de las 34 páginas del portal de Qualitas e importarlos a RDS desde el servidor EC2.

---

## 🚀 Opción Rápida: Script Todo-en-Uno

Este script extrae e importa en un solo paso, diseñado para ejecutarse en EC2:

### 1. Conectar a EC2 y ejecutar:

```bash
# Conectar al servidor
ssh -i tu-key.pem ubuntu@tu-ip-ec2

# Ir al directorio
cd ~/LaMarinaCC/backend

# Ejecutar extracción e importación completa
python3 -m app.rpa.extract_and_import_modelos
```

### 2. Opciones disponibles:

```bash
# Solo extraer (genera JSON, no importa)
python3 -m app.rpa.extract_and_import_modelos --extract-only

# Solo importar desde archivo existente
python3 -m app.rpa.extract_and_import_modelos --import-only --file modelos.json

# Simulación (ver qué haría sin insertar)
python3 -m app.rpa.extract_and_import_modelos --dry-run

# Ver navegador (útil para debug)
python3 -m app.rpa.extract_and_import_modelos --no-headless
```

---

## 📋 Paso a Paso Detallado

### Paso 1: Verificar credenciales

Asegúrate de que las credenciales de Qualitas estén en la base de datos:

```bash
# En EC2, verificar que existen
psql $DATABASE_URL -c "SELECT seguro, usuario FROM aseguradora_credenciales WHERE activo = TRUE;"
```

O en el archivo `.envQualitas`:
```bash
cat ~/LaMarinaCC/backend/.envQualitas
# Debe tener: QUALITAS_USER, QUALITAS_PASSWORD, QUALITAS_TALLER_ID
```

### Paso 2: Ejecutar extracción

```bash
cd ~/LaMarinaCC/backend
python3 -m app.rpa.extract_and_import_modelos --extract-only
```

Esto generará: `app/rpa/data/qualitas_modelos_export.json`

### Paso 3: Revisar datos extraídos (opcional)

```bash
# Ver cuántos modelos hay
cat app/rpa/data/qualitas_modelos_export.json | python3 -m json.tool | grep "total"

# Ver primeros modelos
cat app/rpa/data/qualitas_modelos_export.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(json.dumps(d['modelos'][:5], indent=2))"
```

### Paso 4: Importar a RDS

```bash
# Importación real
python3 -m app.rpa.extract_and_import_modelos --import-only

# O en un solo paso (extract + import)
python3 -m app.rpa.extract_and_import_modelos
```

---

## 🔧 Solución de Problemas

### Error: "No se encontraron filas en esta página"

El HTML de la tabla puede variar. Si ves este error:

1. Ve al portal de Qualitas en tu navegador
2. Abre DevTools (F12)
3. Inspecciona una fila de la tabla
4. Copia el selector CSS y actualiza el archivo `extract_and_import_modelos.py`:

```python
# Línea ~95, cambiar estos selectores:
selectors = [
    'table tbody tr',           # Selector actual
    '.data-table tbody tr',     # Alternativo 1
    '#tabla-modelos tbody tr',  # Alternativo 2
    '[class*="table"] tbody tr' # Alternativo 3
]
```

### Error: "No se pudieron cargar credenciales"

```bash
# Verificar variables de entorno
env | grep QUALITAS

# O configurar temporalmente:
export QUALITAS_USER="tu_usuario"
export QUALITAS_PASSWORD="tu_password"
export QUALITAS_TALLER_ID="96627"
```

### La tabla tiene paginación diferente

Si la paginación no funciona (solo extrae página 1):

1. Ve al portal y haz clic en "Siguiente"
2. Observa cómo cambia la URL o qué elemento se activa
3. Actualiza el selector en `get_next_page_button()` (línea ~140)

---

## 📊 Estructura del JSON Generado

```json
{
  "fecha_extraccion": "2024-02-27T10:30:00",
  "total": 680,
  "modelos": [
    {"modelo": "A3", "marca": "AUDI"},
    {"modelo": "A4 SEDAN", "marca": "AUDI"},
    {"modelo": "ILX", "marca": "ACURA"}
  ]
}
```

---

## 🔄 Proceso Automático

Para automatizar (ejecutar cada semana):

```bash
# Agregar a crontab
crontab -e

# Agregar línea (ejecutar domingos a las 2 AM)
0 2 * * 0 cd ~/LaMarinaCC/backend && python3 -m app.rpa.extract_and_import_modelos >> /var/log/qualitas_modelos.log 2>&1
```

---

## 📝 Logs

Los logs se guardan automáticamente. Para ver el último:

```bash
tail -100 /var/log/qualitas_modelos.log
```

---

## ✅ Verificación Final

Después de importar, verifica en la base de datos:

```bash
# Contar modelos
psql $DATABASE_URL -c "SELECT COUNT(*) FROM modelos_autos;"

# Ver algunos ejemplos
psql $DATABASE_URL -c "SELECT ma.nb_marca, mo.nb_modelo FROM modelos_autos mo JOIN marcas_autos ma ON ma.id = mo.marca_id LIMIT 10;"
```

O desde el frontend en: **Catálogos > Modelos Autos**
