"""
Ejemplo de uso del RPA de adjudicación de Qualitas.

Este script muestra cómo usar la funcionalidad de adjudicación:
1. Directamente importando el handler
2. Mediante el endpoint de la API
3. Mediante línea de comandos

Uso directo (Python):
    python3 -m app.rpa.qualitas_adjudicacion_example

Uso mediante API:
    curl -X POST http://localhost:8000/admin/rpa/qualitas/adjudicar \
      -H "Content-Type: application/json" \
      -d @ejemplo_adjudicacion.json
"""

import asyncio
import json
from datetime import datetime
from pathlib import Path

# Ejemplo 1: Uso directo importando el handler
async def ejemplo_uso_directo():
    """
    Ejemplo de cómo usar el handler directamente desde código Python.
    Útil para integraciones personalizadas o scripts de automatización.
    """
    from playwright.async_api import async_playwright
    from playwright_stealth import Stealth
    
    from app.rpa.qualitas_adjudicacion_handler import (
        QualitasAdjudicacionHandler,
        DatosAdjudicacion,
        obtener_codigo_marca_qualitas
    )
    from app.rpa.qualitas_full_workflow import do_login
    from app.rpa.qualitas_modal_handler import handle_qualitas_modal
    
    print("=" * 60)
    print("EJEMPLO 1: USO DIRECTO DEL HANDLER")
    print("=" * 60)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context(viewport={"width": 1920, "height": 1080})
        page = await context.new_page()
        
        # Stealth
        stealth = Stealth(navigator_languages_override=('es-MX', 'es'))
        await stealth.apply_stealth_async(page)
        
        try:
            # Login
            print("\n[1/3] Iniciando sesión...")
            success = await do_login(page, use_db=True)
            if not success:
                print("✗ Login fallido")
                return
            
            # Manejar modal
            print("\n[2/3] Manejando modal de aviso...")
            await handle_qualitas_modal(page)
            
            # Crear datos de adjudicación
            print("\n[3/3] Preparando datos de adjudicación...")
            
            # Ejemplo con los datos del HTML proporcionado
            datos = DatosAdjudicacion(
                # Identificación
                id_expediente="9070883",
                wsreportid="578576",
                
                # Datos del cliente
                nombre="OPERADORA TURISTICA",
                apellidos="TIVI SA DE CV",
                celular="6671234567",
                email_cliente="",
                
                # Datos del vehículo (del ejemplo: KIA RIO LX 4P L4 1.6L ABS R15 KA)
                marca_qualitas_codigo="KA",  # KIA
                modelo_id="",  # Se debe obtener de la base de datos del taller
                anio_vehiculo="2018",
                color_vehiculo="000000",  # Negro
                placa="FRU580A",
                nro_serie="3KPA24AC4JE031274",
                es_hibrido_electrico=False,
                
                # Datos de la orden
                tipo_danio_id="1",  # Colisión
                estatus_exp_id="1",  # Piso
                ingreso_grua="0",  # No
                ubicacion="Taller Principal",
                
                # Datos adicionales
                contratante="OPERADORA TURISTICA TIVI SA DE CV D",
                vehiculo_referencia="KIA RIO LX 4P L4 1.6L ABS R15 KA, 2018"
            )
            
            # Ejecutar adjudicación
            handler = QualitasAdjudicacionHandler(page)
            resultado = await handler.adjudicar_orden(datos)
            
            print(f"\n{'='*60}")
            print("RESULTADO:")
            print(f"  Éxito: {resultado.exito}")
            print(f"  Mensaje: {resultado.mensaje}")
            print(f"  Expediente: {resultado.id_expediente}")
            if resultado.errores:
                print(f"  Errores: {resultado.errores}")
            print("=" * 60)
            
        finally:
            await browser.close()


def generar_json_ejemplo():
    """Genera un archivo JSON de ejemplo para usar con el runner."""
    
    ejemplo_single = {
        "id_expediente": "9070883",
        "wsreportid": "578576",
        "nombre": "JUAN CARLOS",
        "apellidos": "PEREZ GARCIA",
        "lada": "521",
        "celular": "6671234567",
        "tel_fijo": "",
        "email_cliente": "juan.perez@email.com",
        "marca_qualitas_codigo": "KA",
        "modelo_id": "12345",
        "anio_vehiculo": "2018",
        "color_vehiculo": "000000",
        "placa": "FRU580A",
        "economico": "",
        "nro_serie": "3KPA24AC4JE031274",
        "es_hibrido_electrico": False,
        "tipo_danio_id": "1",
        "estatus_exp_id": "1",
        "ingreso_grua": "0",
        "ubicacion": "Taller Principal",
        "headless": True
    }
    
    ejemplo_batch = {
        "ordenes": [
            {
                "id_expediente": "9070883",
                "wsreportid": "578576",
                "nombre": "JUAN CARLOS",
                "apellidos": "PEREZ GARCIA",
                "celular": "6671234567",
                "marca_qualitas_codigo": "KA",
                "placa": "FRU580A",
                "estatus_exp_id": "1"
            },
            {
                "id_expediente": "9070884",
                "wsreportid": "578577",
                "nombre": "MARIA",
                "apellidos": "GOMEZ LOPEZ",
                "celular": "6679876543",
                "marca_qualitas_codigo": "CT",
                "placa": "ABC123D",
                "estatus_exp_id": "2"
            }
        ],
        "headless": True,
        "stop_on_error": False
    }
    
    # Guardar ejemplos
    backend_dir = Path(__file__).resolve().parents[2]
    ejemplo_dir = backend_dir / "rpa_ejemplos"
    ejemplo_dir.mkdir(exist_ok=True)
    
    # Single
    single_file = ejemplo_dir / "ejemplo_adjudicacion_single.json"
    with open(single_file, 'w', encoding='utf-8') as f:
        json.dump(ejemplo_single, f, ensure_ascii=False, indent=2)
    print(f"✓ Archivo generado: {single_file}")
    
    # Batch
    batch_file = ejemplo_dir / "ejemplo_adjudicacion_batch.json"
    with open(batch_file, 'w', encoding='utf-8') as f:
        json.dump(ejemplo_batch, f, ensure_ascii=False, indent=2)
    print(f"✓ Archivo generado: {batch_file}")
    
    return single_file, batch_file


def ejemplo_uso_api():
    """
    Muestra ejemplos de cómo usar el endpoint de la API.
    """
    print("\n" + "=" * 60)
    print("EJEMPLO 2: USO MEDIANTE API REST")
    print("=" * 60)
    
    ejemplo = {
        "id_expediente": "9070883",
        "wsreportid": "578576",
        "nombre": "JUAN CARLOS",
        "apellidos": "PEREZ GARCIA",
        "celular": "6671234567",
        "marca_qualitas_codigo": "KA",
        "placa": "FRU580A",
        "estatus_exp_id": "1",
        "headless": True
    }
    
    print("\n1. Adjudicar una sola orden:")
    print("-" * 60)
    print(f"""
curl -X POST http://localhost:8000/admin/rpa/qualitas/adjudicar \\
  -H "Content-Type: application/json" \\
  -d '{json.dumps(ejemplo, indent=2)}'
""")
    
    print("\n2. Ver estado del job:")
    print("-" * 60)
    print("""
curl http://localhost:8000/admin/rpa/status/{job_id}
""")
    
    print("\n3. Listar jobs recientes:")
    print("-" * 60)
    print("""
curl http://localhost:8000/admin/rpa/jobs
""")
    
    print("\n4. Obtener códigos de marcas:")
    print("-" * 60)
    print("""
curl http://localhost:8000/admin/rpa/marcas-qualitas
""")


def ejemplo_uso_cli():
    """
    Muestra ejemplos de uso mediante línea de comandos.
    """
    print("\n" + "=" * 60)
    print("EJEMPLO 3: USO MEDIANTE LÍNEA DE COMANDOS")
    print("=" * 60)
    
    print("\n1. Ejecutar adjudicación desde archivo:")
    print("-" * 60)
    print("""
# Primero generar el archivo JSON (ver función generar_json_ejemplo)
# Luego ejecutar:

cd backend
python3 -m app.rpa.qualitas_adjudicacion_runner \\
    rpa_ejemplos/ejemplo_adjudicacion_single.json \\
    --headless \\
    --use-db
""")
    
    print("\n2. Ejecutar adjudicación batch:")
    print("-" * 60)
    print("""
cd backend
python3 -m app.rpa.qualitas_adjudicacion_runner \\
    rpa_ejemplos/ejemplo_adjudicacion_batch.json \\
    --headless
""")


def mostrar_documentacion():
    """Muestra la documentación completa de la funcionalidad."""
    
    print("""
================================================================================
                    RPA DE ADJUDICACIÓN - QUALITAS
================================================================================

DESCRIPCIÓN:
------------
Este módulo permite automatizar el proceso de adjudicación de órdenes en el 
sistema de Qualitas. El flujo automático incluye:

1. Búsqueda del expediente en la tabla de asignados
2. Apertura del modal de adjudicación
3. Llenado del formulario con los datos proporcionados
4. Guardado de la adjudicación

CAMPOS DEL FORMULARIO:
----------------------
Datos del Cliente (obligatorios):
- nombre: Nombre(s) del cliente
- apellidos: Apellidos del cliente  
- celular: Número de celular (10 dígitos)

Datos del Vehículo (obligatorios):
- marca_qualitas_codigo: Código de 2 letras (KA=KIA, CT=Chevrolet, HA=Honda, etc.)
- placa: Número de placa del vehículo

Datos de la Orden:
- estatus_exp_id: 1=Piso, 2=Tránsito, 4=Express
- tipo_danio_id: 1=Colisión (por defecto)
- ingreso_grua: 0=No, 1=Sí
- ubicacion: Ubicación física del vehículo

CÓDIGOS DE MARCA QUALITAS COMUNES:
-----------------------------------
KIA          -> KA
Chevrolet    -> CT
Honda        -> HA
Toyota       -> TY
Nissan       -> NN
Ford         -> FD
Volkswagen   -> VW
Mazda        -> MA
Hyundai      -> HI
Jeep         -> JP
BMW          -> BW
Mercedes     -> MZ
Audi         -> AI

Ver todos los códigos:
GET /admin/rpa/marcas-qualitas

IDENTIFICACIÓN DEL EXPEDIENTE:
------------------------------
- id_expediente: Número visible del expediente (ej: "9070883")
- wsreportid: ID interno del sistema Qualitas (ej: "578576")

Ambos valores se obtienen de la tabla de asignados y son necesarios para
identificar correctamente la orden a adjudicar.

FLUJO TÍPICO DE USO:
--------------------
1. Extraer datos de la tabla de asignados usando el RPA de extracción
2. Preparar los datos de adjudicación (nombre, celular, estatus, etc.)
3. Llamar al endpoint de adjudicación
4. Monitorear el estado del job
5. Verificar el resultado

EJEMPLO COMPLETO:
-----------------
# 1. Extraer órdenes asignadas
curl -X POST http://localhost:8000/admin/rpa/qualitas

# 2. Preparar datos de adjudicación
# (Obtener wsreportid de los datos extraídos)

# 3. Adjudicar
curl -X POST http://localhost:8000/admin/rpa/qualitas/adjudicar \\
  -H "Content-Type: application/json" \\
  -d '{
    "id_expediente": "9070883",
    "wsreportid": "578576",
    "nombre": "JUAN CARLOS",
    "apellidos": "PEREZ GARCIA",
    "celular": "6671234567",
    "marca_qualitas_codigo": "KA",
    "placa": "FRU580A",
    "estatus_exp_id": "1",
    "headless": true
  }'

# 4. Ver estado (reemplazar {job_id} con el ID recibido)
curl http://localhost:8000/admin/rpa/status/{job_id}

================================================================================
""")


async def main():
    """Función principal que ejecuta todos los ejemplos."""
    
    import sys
    
    if len(sys.argv) > 1:
        comando = sys.argv[1]
        
        if comando == "directo":
            # Ejecutar ejemplo de uso directo
            await ejemplo_uso_directo()
        elif comando == "api":
            # Mostrar ejemplos de API
            ejemplo_uso_api()
        elif comando == "cli":
            # Mostrar ejemplos de CLI
            ejemplo_uso_cli()
        elif comando == "generar":
            # Generar archivos JSON de ejemplo
            print("Generando archivos de ejemplo...")
            generar_json_ejemplo()
        elif comando == "docs":
            # Mostrar documentación
            mostrar_documentacion()
        else:
            print(f"Comando desconocido: {comando}")
            print("Comandos disponibles: directo, api, cli, generar, docs")
    else:
        # Mostrar todo
        mostrar_documentacion()
        print("\n")
        ejemplo_uso_api()
        print("\n")
        ejemplo_uso_cli()
        print("\n")
        print("Generando archivos de ejemplo...")
        generar_json_ejemplo()
        print("\n")
        print("Para ejecutar el ejemplo de uso directo:")
        print("  python3 -m app.rpa.qualitas_adjudicacion_example directo")


if __name__ == "__main__":
    asyncio.run(main())
