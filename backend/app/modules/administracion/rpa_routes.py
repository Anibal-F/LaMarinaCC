"""
Endpoints para ejecutar RPA de aseguradoras desde el frontend.
"""

import subprocess
import os
from pathlib import Path
from datetime import datetime
from fastapi import APIRouter, HTTPException, status, BackgroundTasks
from pydantic import BaseModel, Field
from typing import Optional, Literal, List, Any

from app.core.db import get_connection
from app.modules.recepcion.routes import ensure_inventario_recepcion_table

router = APIRouter(prefix="/rpa", tags=["rpa"])

# Almacenar estado de las ejecuciones (en memoria - reinicia con el servidor)
rpa_jobs = {}


class RPARequest(BaseModel):
    action: Literal["login", "extract_data", "full_workflow"] = "login"
    headless: bool = True
    save_session: bool = True


class RPAResponse(BaseModel):
    job_id: str
    status: Literal["queued", "running", "completed", "failed"]
    message: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    output: Optional[str] = None
    error: Optional[str] = None


class AdjudicacionDatosRequest(BaseModel):
    """Datos necesarios para adjudicar una orden en Qualitas."""
    # Identificación
    id_expediente: str = Field(default="", description="Número de expediente (opcional si se pasa num_reporte)")
    wsreportid: str = Field(default="", description="ID interno de Qualitas (wereportid)")
    
    # Búsqueda alternativa por número de reporte
    num_reporte: str = Field(default="", description="Número de reporte/siniestro para buscar (alternativa a id_expediente)")
    
    # Datos del cliente
    nombre: str = Field(default="", description="Nombre(s) del cliente")
    apellidos: str = Field(default="", description="Apellidos del cliente")
    lada: str = Field(default="521", description="Lada telefónica (521=MX, 1=USA)")
    celular: str = Field(default="", description="Número de celular (10 dígitos)")
    tel_fijo: str = Field(default="", description="Teléfono fijo (opcional)")
    email_cliente: str = Field(default="", description="Correo electrónico (opcional)")
    
    # Datos del vehículo
    marca_qualitas_codigo: str = Field(default="", description="Código de marca Qualitas (ej: KA, CT, HA)")
    marca_taller_id: Optional[str] = Field(default=None, description="ID de marca del taller (solo si código=BS)")
    modelo_id: str = Field(default="", description="ID del modelo del vehículo")
    modelo_texto: str = Field(default="", description="Texto visible del modelo del vehículo")
    anio_vehiculo: str = Field(default="", description="Año del vehículo")
    color_vehiculo: str = Field(default="", description="Color del vehículo tal como viene en la orden")
    placa: str = Field(default="", description="Número de placa")
    kilometraje: str = Field(default="", description="Kilometraje del vehículo")
    economico: str = Field(default="", description="Número económico (opcional)")
    nro_serie: str = Field(default="", description="Número de serie VIN")
    es_hibrido_electrico: bool = Field(default=False, description="¿Es híbrido o eléctrico?")
    
    # Datos de la orden
    tipo_danio_id: str = Field(default="1", description="1=Colisión")
    estatus_exp_id: str = Field(default="", description="1=Piso, 2=Tránsito, 4=Express")
    ingreso_grua: str = Field(default="0", description="0=No, 1=Sí")
    ubicacion: str = Field(default="", description="Ubicación del vehículo")
    
    # Datos adicionales
    contratante: str = Field(default="", description="Nombre del contratante")
    vehiculo_referencia: str = Field(default="", description="Descripción del vehículo")
    inventario: Optional[dict[str, Any]] = Field(default=None, description="Inventario asociado a la recepción/valuación")
    
    # Flags del sistema
    headless: bool = Field(default=True, description="Ejecutar sin ventana visible")


class AdjudicacionResultado(BaseModel):
    """Resultado de una adjudicación."""
    exito: bool
    mensaje: str
    id_expediente: str
    timestamp: str
    errores: List[str] = []


class AdjudicacionBatchRequest(BaseModel):
    """Solicitud para adjudicar múltiples órdenes."""
    ordenes: List[AdjudicacionDatosRequest]
    headless: bool = True
    stop_on_error: bool = False


def _build_inventory_payload(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if not row:
        return None
    return {
        "documentos": {"cantidad": row.get("documentos_cantidad"), "estado": row.get("documentos_estado")},
        "radio": {"cantidad": row.get("radio_cantidad"), "estado": row.get("radio_estado")},
        "pantalla": {"cantidad": row.get("pantalla_cantidad"), "estado": row.get("pantalla_estado")},
        "encendedor": {"cantidad": row.get("encendedor_cantidad"), "estado": row.get("encendedor_estado")},
        "tapetes_tela": {"cantidad": row.get("tapetes_tela_cantidad"), "estado": row.get("tapetes_tela_estado")},
        "tapetes_plastico": {"cantidad": row.get("tapetes_plastico_cantidad"), "estado": row.get("tapetes_plastico_estado")},
        "bateria": {"cantidad": row.get("bateria_cantidad"), "estado": row.get("bateria_estado")},
        "computadora": {"cantidad": row.get("computadora_cantidad"), "estado": row.get("computadora_estado")},
        "tapones_depositos": {"cantidad": row.get("tapones_depositos_cantidad"), "estado": row.get("tapones_depositos_estado")},
        "antena": {"cantidad": row.get("antena_cantidad"), "estado": row.get("antena_estado")},
        "polveras": {"cantidad": row.get("polveras_cantidad"), "estado": row.get("polveras_estado")},
        "centro_rin": {"cantidad": row.get("centro_rin_cantidad"), "estado": row.get("centro_rin_estado")},
        "placas_item": {"cantidad": row.get("placas_item_cantidad"), "estado": row.get("placas_item_estado")},
        "herramienta": {"cantidad": row.get("herramienta_cantidad"), "estado": row.get("herramienta_estado")},
        "reflejantes": {"cantidad": row.get("reflejantes_cantidad"), "estado": row.get("reflejantes_estado")},
        "cables_pasa_corriente": {
            "cantidad": row.get("cables_pasa_corriente_cantidad"),
            "estado": row.get("cables_pasa_corriente_estado"),
        },
        "llanta_refaccion": {"cantidad": row.get("llanta_refaccion_cantidad"), "estado": row.get("llanta_refaccion_estado")},
        "llave_l_cruceta": {"cantidad": row.get("llave_l_cruceta_cantidad"), "estado": row.get("llave_l_cruceta_estado")},
        "extintor": {"cantidad": row.get("extintor_cantidad"), "estado": row.get("extintor_estado")},
        "gato": {"cantidad": row.get("gato_cantidad"), "estado": row.get("gato_estado")},
        "nivel_gas": row.get("nivel_gas"),
        "comentario": row.get("comentario"),
    }


def _load_inventory_for_qualitas(num_reporte: str, placa: str) -> dict[str, Any] | None:
    with get_connection() as conn:
        ensure_inventario_recepcion_table(conn)

        row = None
        reporte = str(num_reporte or "").strip()
        placas = str(placa or "").strip()

        if reporte:
            row = conn.execute(
                """
                SELECT
                    i.*,
                    r.kilometraje
                FROM inventario_recepcion i
                JOIN recepciones r ON r.id = i.recepcion_id
                WHERE COALESCE(i.folio_seguro, '') = %s
                ORDER BY i.updated_at DESC NULLS LAST, i.id DESC
                LIMIT 1
                """,
                (reporte,),
            ).fetchone()

        if not row and placas:
            row = conn.execute(
                """
                SELECT
                    i.*,
                    r.kilometraje
                FROM inventario_recepcion i
                JOIN recepciones r ON r.id = i.recepcion_id
                WHERE UPPER(COALESCE(i.placas, '')) = UPPER(%s)
                ORDER BY i.updated_at DESC NULLS LAST, i.id DESC
                LIMIT 1
                """,
                (placas,),
            ).fetchone()

    if not row:
        return None

    return {
        "inventario": _build_inventory_payload(row),
        "kilometraje": str(row.get("kilometraje") or "").strip(),
    }


def run_rpa_script(seguro: str, job_id: str, action: str, headless: bool, save_session: bool):
    """
    Ejecuta el script de RPA en un proceso separado.
    Esta función corre en background.
    """
    backend_dir = Path(__file__).resolve().parents[3]
    
    # Determinar qué script ejecutar
    if seguro.upper() == "QUALITAS":
        script_name = "qualitas_full_workflow.py"
        env_prefix = "QUALITAS"
    elif seguro.upper() in ["CHUBB", "AUDATEX"]:
        script_name = "chubb_full_workflow.py"
        env_prefix = "CHUBB"
    else:
        rpa_jobs[job_id]["status"] = "failed"
        rpa_jobs[job_id]["error"] = f"Seguro no soportado: {seguro}"
        rpa_jobs[job_id]["completed_at"] = datetime.now().isoformat()
        return
    
    script_path = backend_dir / "app" / "rpa" / script_name
    
    if not script_path.exists():
        rpa_jobs[job_id]["status"] = "failed"
        rpa_jobs[job_id]["error"] = f"Script no encontrado: {script_path}"
        rpa_jobs[job_id]["completed_at"] = datetime.now().isoformat()
        return
    
    # Construir comando (usar python3 para compatibilidad con Docker)
    cmd = [
        "python3", "-m", f"app.rpa.{script_name.replace('.py', '')}",
        "--use-db"  # Usar credenciales de la base de datos
    ]
    
    # Siempre usar headless en Docker (no hay display gráfico)
    is_docker = os.path.exists('/.dockerenv') or os.getenv('DOCKER_CONTAINER', False)
    if headless or is_docker:
        cmd.append("--headless")
    
    if save_session:
        cmd.append("--skip-login")
    
    # Ejecutar script
    try:
        rpa_jobs[job_id]["status"] = "running"
        rpa_jobs[job_id]["started_at"] = datetime.now().isoformat()
        
        # Ejecutar con timeout de 5 minutos
        result = subprocess.run(
            cmd,
            cwd=str(backend_dir),
            capture_output=True,
            text=True,
            timeout=300,  # 5 minutos
            encoding='utf-8',
            errors='replace'
        )
        
        rpa_jobs[job_id]["output"] = result.stdout
        
        if result.returncode == 0:
            rpa_jobs[job_id]["status"] = "completed"
            rpa_jobs[job_id]["message"] = f"RPA {seguro} completado exitosamente"
        else:
            rpa_jobs[job_id]["status"] = "failed"
            rpa_jobs[job_id]["error"] = result.stderr or "Error desconocido"
            
    except subprocess.TimeoutExpired:
        rpa_jobs[job_id]["status"] = "failed"
        rpa_jobs[job_id]["error"] = "Timeout: El RPA tardó más de 5 minutos"
    except Exception as e:
        rpa_jobs[job_id]["status"] = "failed"
        rpa_jobs[job_id]["error"] = str(e)
    
    rpa_jobs[job_id]["completed_at"] = datetime.now().isoformat()


def run_adjudicacion_script(job_id: str, datos_json: str, headless: bool):
    """
    Ejecuta el script de adjudicación de Qualitas en un proceso separado.
    Esta función corre en background.
    """
    backend_dir = Path(__file__).resolve().parents[3]
    script_name = "qualitas_adjudicacion_runner.py"
    script_path = backend_dir / "app" / "rpa" / script_name
    
    # Configurar archivo de log
    log_dir = backend_dir / "logs"
    log_dir.mkdir(exist_ok=True)
    log_file = log_dir / f"adjudicacion_{job_id}.log"
    
    def log_message(msg: str):
        """Escribe mensaje al log y lo almacena en el job."""
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        log_line = f"[{timestamp}] {msg}\n"
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(log_line)
        # También guardar en memoria para consulta rápida
        if "logs" not in rpa_jobs[job_id]:
            rpa_jobs[job_id]["logs"] = []
        rpa_jobs[job_id]["logs"].append(log_line)
    
    if not script_path.exists():
        rpa_jobs[job_id]["status"] = "failed"
        rpa_jobs[job_id]["error"] = f"Script no encontrado: {script_path}"
        rpa_jobs[job_id]["completed_at"] = datetime.now().isoformat()
        log_message(f"ERROR: Script no encontrado: {script_path}")
        return
    
    # Guardar datos en archivo temporal
    temp_dir = backend_dir / "temp"
    temp_dir.mkdir(exist_ok=True)
    temp_file = temp_dir / f"adjudicacion_{job_id}.json"
    
    try:
        with open(temp_file, "w", encoding="utf-8") as f:
            f.write(datos_json)
        log_message(f"Datos guardados en: {temp_file}")
        
        # Construir comando (usar python3 en lugar de python para compatibilidad con Docker)
        cmd = [
            "python3", "-u", "-m", f"app.rpa.{script_name.replace('.py', '')}",
            str(temp_file),
            "--use-db"
        ]
        
        # Siempre usar headless en Docker
        is_docker = os.path.exists('/.dockerenv') or os.getenv('DOCKER_CONTAINER', False)
        if headless or is_docker:
            cmd.append("--headless")
            log_message("Modo: HEADLESS (sin ventana visible)")
        else:
            log_message("Modo: VISUAL (con navegador visible)")
        
        # Ejecutar script con streaming de output
        rpa_jobs[job_id]["status"] = "running"
        rpa_jobs[job_id]["started_at"] = datetime.now().isoformat()
        rpa_jobs[job_id]["log_file"] = str(log_file)
        log_message(f"Job iniciado: {job_id}")
        log_message(f"Comando: {' '.join(cmd)}")
        
        # Ejecutar con Popen para capturar output en tiempo real
        import subprocess
        process = subprocess.Popen(
            cmd,
            cwd=str(backend_dir),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding='utf-8',
            errors='replace',
            bufsize=1  # Line buffered
        )
        
        # Capturar output en tiempo real
        full_output = []
        try:
            for line in process.stdout:
                line = line.rstrip()
                if line:
                    full_output.append(line)
                    log_message(f"RPA: {line}")
                    # Mantener solo últimas 100 líneas en memoria
                    if len(rpa_jobs[job_id]["logs"]) > 100:
                        rpa_jobs[job_id]["logs"] = rpa_jobs[job_id]["logs"][-100:]
        except Exception as e:
            log_message(f"Error leyendo output: {e}")
        
        # Esperar a que termine el proceso
        try:
            process.wait(timeout=120)  # 2 minutos timeout
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
            log_message("ERROR: Timeout después de 2 minutos")
            rpa_jobs[job_id]["status"] = "failed"
            rpa_jobs[job_id]["error"] = "Timeout: La adjudicación tardó más de 2 minutos"
            return
        
        rpa_jobs[job_id]["output"] = "\n".join(full_output)
        log_message(f"Proceso terminado con código: {process.returncode}")
        
        # Leer resultado del archivo de salida
        result_file = temp_file.with_suffix('.result.json')
        if result_file.exists():
            import json
            with open(result_file, "r", encoding="utf-8") as f:
                resultado = json.load(f)
            rpa_jobs[job_id]["resultado"] = resultado
            exitosos = resultado.get("exitosos", 0)
            fallidos = resultado.get("fallidos", 0)
            log_message(f"Resultado: {exitosos} exitosos, {fallidos} fallidos")
            result_file.unlink()
        
        if process.returncode == 0:
            rpa_jobs[job_id]["status"] = "completed"
            rpa_jobs[job_id]["message"] = "Adjudicación completada exitosamente"
            log_message("Job completado exitosamente")
        elif process.returncode == 1:
            rpa_jobs[job_id]["status"] = "completed_with_errors"
            rpa_jobs[job_id]["message"] = "Algunas adjudicaciones fallaron"
            log_message("Job completado con errores parciales")
        else:
            rpa_jobs[job_id]["status"] = "failed"
            rpa_jobs[job_id]["error"] = f"Error en ejecución (código {process.returncode})"
            log_message(f"Job fallido con código {process.returncode}")
            
    except Exception as e:
        error_msg = f"Error inesperado: {str(e)}"
        log_message(f"ERROR: {error_msg}")
        import traceback
        log_message(f"Traceback: {traceback.format_exc()}")
        rpa_jobs[job_id]["status"] = "failed"
        rpa_jobs[job_id]["error"] = error_msg
    finally:
        # Limpiar archivo temporal
        if temp_file.exists():
            temp_file.unlink()
        rpa_jobs[job_id]["completed_at"] = datetime.now().isoformat()
        log_message(f"Job finalizado a las {rpa_jobs[job_id]['completed_at']}")
        log_message(f"Log completo disponible en: {log_file}")


@router.post("/qualitas", response_model=RPAResponse)
async def run_qualitas_rpa(
    background_tasks: BackgroundTasks,
    request: RPARequest
):
    """
    Ejecuta el RPA de Qualitas (extracción de datos).
    """
    job_id = f"qualitas_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{id(request)}"
    
    rpa_jobs[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "message": "RPA de Qualitas en cola",
        "seguro": "QUALITAS",
        "tipo": "extraccion"
    }
    
    # Ejecutar en background
    background_tasks.add_task(
        run_rpa_script,
        "QUALITAS",
        job_id,
        request.action,
        request.headless,
        request.save_session
    )
    
    return RPAResponse(
        job_id=job_id,
        status="queued",
        message="RPA de Qualitas iniciado. Consulta el estado con GET /admin/rpa/status/{job_id}"
    )


@router.post("/qualitas/adjudicar", response_model=RPAResponse)
async def adjudicar_orden_qualitas(
    background_tasks: BackgroundTasks,
    request: AdjudicacionDatosRequest
):
    """
    Adjudica una orden en Qualitas usando RPA.
    
    Este endpoint automatiza el proceso de adjudicación:
    1. Busca el expediente en la tabla de asignados
    2. Abre el modal de adjudicación
    3. Llena el formulario con los datos proporcionados
    4. Guarda la adjudicación
    
    Campos obligatorios:
    - id_expediente, wsreportid
    - nombre, apellidos, celular
    - marca_qualitas_codigo, placa
    
    Ejemplo de uso:
    ```json
    {
        "id_expediente": "9070883",
        "wsreportid": "578576",
        "nombre": "JUAN CARLOS",
        "apellidos": "PEREZ GARCIA",
        "celular": "6671234567",
        "marca_qualitas_codigo": "KA",
        "modelo_id": "12345",
        "placa": "FRU580A",
        "estatus_exp_id": "1"
    }
    ```
    """
    job_id = f"qualitas_adj_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{id(request)}"
    
    # Convertir request a JSON
    import json
    datos_dict = request.model_dump()
    if not datos_dict.get("inventario") or not datos_dict.get("kilometraje"):
        inventory_data = _load_inventory_for_qualitas(
            datos_dict.get("num_reporte", ""),
            datos_dict.get("placa", ""),
        )
        if inventory_data:
            if not datos_dict.get("inventario"):
                datos_dict["inventario"] = inventory_data.get("inventario")
            if not datos_dict.get("kilometraje"):
                datos_dict["kilometraje"] = inventory_data.get("kilometraje", "")
    datos_json = json.dumps(datos_dict, ensure_ascii=False)
    
    rpa_jobs[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "message": "Adjudicación de Qualitas en cola",
        "seguro": "QUALITAS",
        "tipo": "adjudicacion",
        "id_expediente": request.id_expediente
    }
    
    # Ejecutar en background
    background_tasks.add_task(
        run_adjudicacion_script,
        job_id,
        datos_json,
        request.headless
    )
    
    return RPAResponse(
        job_id=job_id,
        status="queued",
        message=f"Adjudicación del expediente {request.id_expediente} iniciada. Consulta el estado con GET /admin/rpa/status/{job_id}"
    )


@router.post("/qualitas/adjudicar/batch", response_model=RPAResponse)
async def adjudicar_ordenes_batch_qualitas(
    background_tasks: BackgroundTasks,
    request: AdjudicacionBatchRequest
):
    """
    Adjudica múltiples órdenes en Qualitas usando RPA.
    
    Este endpoint permite adjudicar varias órdenes en una sola llamada.
    Cada orden se procesa secuencialmente.
    
    El parámetro `stop_on_error` determina si se detiene al primer error
    o se continúa con las siguientes órdenes.
    """
    job_id = f"qualitas_adj_batch_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{id(request)}"
    
    # Convertir requests a JSON
    import json
    datos_dict = {
        "ordenes": [o.model_dump() for o in request.ordenes],
        "headless": request.headless,
        "stop_on_error": request.stop_on_error
    }
    datos_json = json.dumps(datos_dict, ensure_ascii=False)
    
    rpa_jobs[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "message": f"Adjudicación batch de {len(request.ordenes)} órdenes en cola",
        "seguro": "QUALITAS",
        "tipo": "adjudicacion_batch",
        "total_ordenes": len(request.ordenes)
    }
    
    # Ejecutar en background
    background_tasks.add_task(
        run_adjudicacion_script,
        job_id,
        datos_json,
        request.headless
    )
    
    return RPAResponse(
        job_id=job_id,
        status="queued",
        message=f"Adjudicación batch de {len(request.ordenes)} órdenes iniciada. Consulta el estado con GET /admin/rpa/status/{job_id}"
    )


@router.post("/chubb", response_model=RPAResponse)
async def run_chubb_rpa(
    background_tasks: BackgroundTasks,
    request: RPARequest
):
    """
    Ejecuta el RPA de CHUBB/Audatex.
    """
    job_id = f"chubb_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{id(request)}"
    
    rpa_jobs[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "message": "RPA de CHUBB en cola",
        "seguro": "CHUBB",
        "tipo": "extraccion"
    }
    
    # Ejecutar en background
    background_tasks.add_task(
        run_rpa_script,
        "CHUBB",
        job_id,
        request.action,
        request.headless,
        request.save_session
    )
    
    return RPAResponse(
        job_id=job_id,
        status="queued",
        message="RPA de CHUBB iniciado. Consulta el estado con GET /admin/rpa/status/{job_id}"
    )


@router.get("/status/{job_id}", response_model=RPAResponse)
async def get_rpa_status(job_id: str):
    """
    Obtiene el estado de una ejecución de RPA.
    """
    if job_id not in rpa_jobs:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job no encontrado"
        )
    
    job = rpa_jobs[job_id]
    
    return RPAResponse(
        job_id=job_id,
        status=job.get("status", "unknown"),
        message=job.get("message", ""),
        started_at=job.get("started_at"),
        completed_at=job.get("completed_at"),
        output=job.get("output"),
        error=job.get("error")
    )


@router.get("/jobs")
async def list_rpa_jobs(limit: int = 20):
    """
    Lista las ejecuciones recientes de RPA.
    """
    # Ordenar por fecha de inicio (más recientes primero)
    sorted_jobs = sorted(
        rpa_jobs.items(),
        key=lambda x: x[1].get("started_at", "") or x[1].get("queued_at", ""),
        reverse=True
    )[:limit]
    
    return [
        {
            "job_id": job_id,
            "seguro": job.get("seguro"),
            "tipo": job.get("tipo", "extraccion"),
            "status": job.get("status"),
            "started_at": job.get("started_at"),
            "completed_at": job.get("completed_at"),
            "has_error": bool(job.get("error")),
            "id_expediente": job.get("id_expediente"),
            "total_ordenes": job.get("total_ordenes")
        }
        for job_id, job in sorted_jobs
    ]


@router.delete("/jobs/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rpa_job(job_id: str):
    """
    Elimina un job de la memoria.
    """
    if job_id in rpa_jobs:
        del rpa_jobs[job_id]
    return None


@router.get("/marcas-qualitas")
async def get_marcas_qualitas():
    """
    Obtiene el listado de marcas y sus códigos Qualitas.
    Útil para saber qué código usar al adjudicar.
    """
    from app.rpa.qualitas_adjudicacion_handler import MAPA_MARCAS_QUALITAS
    
    return {
        "marcas": [
            {"nombre": nombre, "codigo": codigo}
            for nombre, codigo in sorted(MAPA_MARCAS_QUALITAS.items())
        ]
    }


@router.get("/status/{job_id}/logs")
async def get_rpa_logs(job_id: str, lines: int = 50):
    """
    Obtiene los logs de un job de RPA.
    
    Args:
        job_id: ID del job
        lines: Número de líneas a retornar (últimas N líneas)
    """
    if job_id not in rpa_jobs:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job no encontrado"
        )
    
    job = rpa_jobs[job_id]
    
    # Intentar leer desde memoria primero
    logs = job.get("logs", [])
    
    # Si no hay logs en memoria, intentar leer del archivo
    if not logs and "log_file" in job:
        log_file = Path(job["log_file"])
        if log_file.exists():
            try:
                with open(log_file, "r", encoding="utf-8") as f:
                    logs = f.readlines()
            except Exception:
                logs = []
    
    # Retornar últimas N líneas
    return {
        "job_id": job_id,
        "status": job.get("status"),
        "total_lines": len(logs),
        "logs": logs[-lines:] if logs else []
    }


@router.get("/status/{job_id}/stream")
async def stream_rpa_logs(job_id: str):
    """
    Endpoint SSE para streaming de logs en tiempo real.
    """
    from fastapi.responses import StreamingResponse
    import asyncio
    
    if job_id not in rpa_jobs:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job no encontrado"
        )
    
    async def log_generator():
        last_line = 0
        while True:
            if job_id not in rpa_jobs:
                yield f"data: {{\"type\": \"error\", \"message\": \"Job no encontrado\"}}\n\n"
                break
            
            job = rpa_jobs[job_id]
            logs = job.get("logs", [])
            
            # Enviar nuevas líneas
            if len(logs) > last_line:
                for line in logs[last_line:]:
                    yield f"data: {json.dumps({'type': 'log', 'message': line.strip()})}\n\n"
                last_line = len(logs)
            
            # Verificar si el job terminó
            if job.get("status") in ["completed", "failed", "completed_with_errors"]:
                yield f"data: {json.dumps({'type': 'status', 'status': job.get('status')})}\n\n"
                break
            
            await asyncio.sleep(1)
    
    return StreamingResponse(
        log_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


# =====================================================
# ENDPOINTS PARA EXTRACCIÓN DE PIEZAS (BITÁCORA)
# =====================================================

class PiezasExtractionRequest(BaseModel):
    """Solicitud para extraer piezas de órdenes en tránsito."""
    max_ordenes: Optional[int] = Field(default=None, description="Máximo de órdenes a procesar (None = todas)")
    headless: bool = Field(default=True, description="Ejecutar sin ventana visible")
    reset_checkpoint: bool = Field(default=False, description="Reiniciar checkpoint y procesar desde el inicio")


@router.post("/qualitas/piezas", response_model=RPAResponse)
def extract_piezas_qualitas(
    request: PiezasExtractionRequest,
    background_tasks: BackgroundTasks
):
    """
    Ejecuta el RPA para extraer piezas de órdenes en tránsito de Qualitas.
    
    Este endpoint:
    1. Navega al tab "Tránsito" de órdenes asignadas
    2. Por cada orden, accede al seguimiento de refacciones
    3. Extrae las tablas de piezas (Proceso de Surtido y Reasignadas/Canceladas)
    4. Guarda las piezas en la bitácora de inventario
    
    El proceso se ejecuta en background. Usa el endpoint /status/{job_id} para consultar progreso.
    """
    import uuid
    
    job_id = str(uuid.uuid4())
    
    # Crear entrada inicial
    rpa_jobs[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "message": "Extracción de piezas de Qualitas encolada",
        "started_at": None,
        "completed_at": None,
        "output": None,
        "error": None,
        "logs": []
    }
    
    # Ejecutar en background
    background_tasks.add_task(
        run_piezas_extraction,
        job_id=job_id,
        max_ordenes=request.max_ordenes,
        headless=request.headless,
        reset_checkpoint=request.reset_checkpoint
    )
    
    return RPAResponse(
        job_id=job_id,
        status="queued",
        message="Extracción de piezas encolada. Usa /status/{job_id} para consultar progreso.",
        started_at=None,
        completed_at=None,
        output=None,
        error=None
    )


def run_piezas_extraction(job_id: str, max_ordenes: Optional[int], headless: bool, reset_checkpoint: bool = False):
    """
    Ejecuta el script de extracción de piezas en un proceso separado.
    Esta función corre en background.
    """
    backend_dir = Path(__file__).resolve().parents[3]
    script_name = "qualitas_piezas_workflow.py"
    script_path = backend_dir / "app" / "rpa" / script_name
    
    # Configurar archivo de log
    log_dir = backend_dir / "logs"
    log_dir.mkdir(exist_ok=True)
    log_file = log_dir / f"piezas_{job_id}.log"
    
    def log_message(msg: str):
        """Escribe mensaje al log y lo almacena en el job."""
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        log_line = f"[{timestamp}] {msg}\n"
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(log_line)
        # También guardar en memoria
        if "logs" not in rpa_jobs[job_id]:
            rpa_jobs[job_id]["logs"] = []
        rpa_jobs[job_id]["logs"].append(log_line)
    
    if not script_path.exists():
        rpa_jobs[job_id]["status"] = "failed"
        rpa_jobs[job_id]["error"] = f"Script no encontrado: {script_path}"
        rpa_jobs[job_id]["completed_at"] = datetime.now().isoformat()
        log_message(f"ERROR: Script no encontrado: {script_path}")
        return
    
    try:
        # Construir comando
        cmd = [
            "python3", "-u", "-m", f"app.rpa.{script_name.replace('.py', '')}",
            "--use-db"  # Usar credenciales de BD
        ]
        
        if max_ordenes:
            cmd.extend(["--max-ordenes", str(max_ordenes)])
        
        if reset_checkpoint:
            cmd.append("--reset-checkpoint")
            log_message("Checkpoint: REINICIADO (procesar desde el inicio)")
        
        # Siempre headless en Docker
        is_docker = os.path.exists('/.dockerenv') or os.getenv('DOCKER_CONTAINER', False)
        if headless or is_docker:
            cmd.append("--headless")
            log_message("Modo: HEADLESS")
        else:
            log_message("Modo: VISUAL")
        
        # Ejecutar
        rpa_jobs[job_id]["status"] = "running"
        rpa_jobs[job_id]["started_at"] = datetime.now().isoformat()
        rpa_jobs[job_id]["log_file"] = str(log_file)
        log_message(f"Job iniciado: {job_id}")
        log_message(f"Comando: {' '.join(cmd)}")
        
        # Ejecutar con Popen para capturar output en tiempo real
        process = subprocess.Popen(
            cmd,
            cwd=str(backend_dir),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding='utf-8',
            errors='replace',
            bufsize=1
        )
        
        # Capturar output
        full_output = []
        try:
            for line in process.stdout:
                line = line.rstrip()
                if line:
                    full_output.append(line)
                    log_message(f"RPA: {line}")
                    # Mantener solo últimas 100 líneas en memoria
                    if len(rpa_jobs[job_id]["logs"]) > 100:
                        rpa_jobs[job_id]["logs"] = rpa_jobs[job_id]["logs"][-100:]
        except Exception as e:
            log_message(f"Error leyendo output: {e}")
        
        # Esperar proceso
        try:
            process.wait(timeout=3600)  # 60 minutos timeout (1 hora) - muchas órdenes
        except subprocess.TimeoutExpired:
            process.kill()
            rpa_jobs[job_id]["status"] = "failed"
            rpa_jobs[job_id]["error"] = "Timeout: El proceso tardó más de 30 minutos"
            log_message("ERROR: Timeout de 30 minutos")
            rpa_jobs[job_id]["completed_at"] = datetime.now().isoformat()
            return
        
        # Verificar resultado
        if process.returncode == 0:
            rpa_jobs[job_id]["status"] = "completed"
            rpa_jobs[job_id]["message"] = "Extracción de piezas completada"
            log_message("✓ Proceso completado exitosamente")
        else:
            rpa_jobs[job_id]["status"] = "failed"
            rpa_jobs[job_id]["error"] = f"Error en ejecución (código {process.returncode})"
            log_message(f"✗ Error en ejecución (código {process.returncode})")
        
        rpa_jobs[job_id]["output"] = "\n".join(full_output)
        
    except Exception as e:
        rpa_jobs[job_id]["status"] = "failed"
        rpa_jobs[job_id]["error"] = str(e)
        log_message(f"ERROR: {e}")
    
    rpa_jobs[job_id]["completed_at"] = datetime.now().isoformat()


# =====================================================
# ENDPOINT PARA VER ESTADO DEL CHECKPOINT
# =====================================================

@router.get("/qualitas/piezas/checkpoint")
def get_piezas_checkpoint_status():
    """
    Obtiene el estado actual del checkpoint de extracción de piezas.
    Útil para saber si hay una extracción en progreso o si se puede reanudar.
    """
    try:
        # Importar el checkpoint manager
        import sys
        from pathlib import Path
        
        backend_dir = Path(__file__).resolve().parents[3]
        if str(backend_dir) not in sys.path:
            sys.path.insert(0, str(backend_dir))
        
        from app.rpa.qualitas_checkpoint import checkpoint
        
        stats = checkpoint.get_stats()
        
        return {
            "status": "ok",
            "checkpoint": stats
        }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }


@router.post("/qualitas/piezas/checkpoint/reset")
def reset_piezas_checkpoint():
    """
    Reinicia el checkpoint de extracción de piezas.
    Esto hace que la próxima extracción comience desde el inicio.
    """
    try:
        import sys
        from pathlib import Path
        
        backend_dir = Path(__file__).resolve().parents[3]
        if str(backend_dir) not in sys.path:
            sys.path.insert(0, str(backend_dir))
        
        from app.rpa.qualitas_checkpoint import checkpoint
        
        checkpoint.reset()
        
        return {
            "status": "ok",
            "message": "Checkpoint reiniciado correctamente"
        }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }


# =====================================================
# ENDPOINTS PARA EXTRACCIÓN DE PIEZAS CHUBB
# =====================================================

class ChubbPiezasExtractionRequest(BaseModel):
    """Solicitud para extraer piezas de expedientes CHUBB autorizados."""
    headless: bool = Field(default=True, description="Ejecutar sin ventana visible")
    max_expedientes: Optional[int] = Field(default=None, description="Máximo de expedientes a procesar (None = todos)")
    fecha_desde: Optional[str] = Field(default="2026-01-01", description="Fecha desde la cual buscar expedientes (YYYY-MM-DD)")


def run_chubb_piezas_extraction(job_id: str, headless: bool, max_expedientes: Optional[int] = None, fecha_desde: Optional[str] = "2026-01-01"):
    """
    Ejecuta el script de extracción de piezas de CHUBB en un proceso separado.
    Esta función corre en background.
    """
    backend_dir = Path(__file__).resolve().parents[3]
    script_name = "chubb_piezas_extractor.py"
    script_path = backend_dir / "app" / "rpa" / script_name
    
    # Configurar archivo de log
    log_dir = backend_dir / "logs"
    log_dir.mkdir(exist_ok=True)
    log_file = log_dir / f"chubb_piezas_{job_id}.log"
    
    def log_message(msg: str):
        """Escribe mensaje al log y lo almacena en el job."""
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        log_line = f"[{timestamp}] {msg}\n"
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(log_line)
        # También guardar en memoria
        if "logs" not in rpa_jobs[job_id]:
            rpa_jobs[job_id]["logs"] = []
        rpa_jobs[job_id]["logs"].append(log_line)
    
    if not script_path.exists():
        rpa_jobs[job_id]["status"] = "failed"
        rpa_jobs[job_id]["error"] = f"Script no encontrado: {script_path}"
        rpa_jobs[job_id]["completed_at"] = datetime.now().isoformat()
        log_message(f"ERROR: Script no encontrado: {script_path}")
        return
    
    try:
        # Construir comando
        cmd = [
            "python3", "-u", "-m", f"app.rpa.{script_name.replace('.py', '')}",
            "--use-db",  # Usar credenciales de BD
            "--fecha-desde", fecha_desde  # Fecha desde para filtrar
        ]
        
        if max_expedientes:
            cmd.extend(["--max-expedientes", str(max_expedientes)])
        
        # Siempre headless en Docker
        is_docker = os.path.exists('/.dockerenv') or os.getenv('DOCKER_CONTAINER', False)
        if headless or is_docker:
            cmd.append("--headless")
            log_message("Modo: HEADLESS")
        else:
            log_message("Modo: VISUAL")
        
        log_message(f"Fecha desde: {fecha_desde}")
        
        # Ejecutar
        rpa_jobs[job_id]["status"] = "running"
        rpa_jobs[job_id]["started_at"] = datetime.now().isoformat()
        rpa_jobs[job_id]["log_file"] = str(log_file)
        rpa_jobs[job_id]["seguro"] = "CHUBB"
        rpa_jobs[job_id]["tipo"] = "piezas"
        log_message(f"Job iniciado: {job_id}")
        log_message(f"Comando: {' '.join(cmd)}")
        
        # Ejecutar con Popen para capturar output en tiempo real
        process = subprocess.Popen(
            cmd,
            cwd=str(backend_dir),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding='utf-8',
            errors='replace',
            bufsize=1
        )
        
        # Capturar output
        full_output = []
        try:
            for line in process.stdout:
                line = line.rstrip()
                if line:
                    full_output.append(line)
                    log_message(f"RPA: {line}")
                    # Mantener solo últimas 100 líneas en memoria
                    if len(rpa_jobs[job_id]["logs"]) > 100:
                        rpa_jobs[job_id]["logs"] = rpa_jobs[job_id]["logs"][-100:]
        except Exception as e:
            log_message(f"Error leyendo output: {e}")
        
        # Esperar proceso
        try:
            process.wait(timeout=3600)  # 1 hora timeout (muchos expedientes)
        except subprocess.TimeoutExpired:
            process.kill()
            rpa_jobs[job_id]["status"] = "failed"
            rpa_jobs[job_id]["error"] = "Timeout: El proceso tardó más de 1 hora"
            log_message("ERROR: Timeout de 1 hora")
            rpa_jobs[job_id]["completed_at"] = datetime.now().isoformat()
            return
        
        # Verificar resultado
        if process.returncode == 0:
            rpa_jobs[job_id]["status"] = "completed"
            rpa_jobs[job_id]["message"] = "Extracción de piezas CHUBB completada"
            log_message("✓ Proceso completado exitosamente")
        else:
            rpa_jobs[job_id]["status"] = "failed"
            rpa_jobs[job_id]["error"] = f"Error en ejecución (código {process.returncode})"
            log_message(f"✗ Error en ejecución (código {process.returncode})")
        
        rpa_jobs[job_id]["output"] = "\n".join(full_output)
        
    except Exception as e:
        rpa_jobs[job_id]["status"] = "failed"
        rpa_jobs[job_id]["error"] = str(e)
        log_message(f"ERROR: {e}")
    
    rpa_jobs[job_id]["completed_at"] = datetime.now().isoformat()


@router.post("/chubb/piezas", response_model=RPAResponse)
def extract_piezas_chubb(
    request: ChubbPiezasExtractionRequest,
    background_tasks: BackgroundTasks
):
    """
    Ejecuta el RPA para extraer piezas de expedientes CHUBB autorizados.
    
    Este endpoint:
    1. Obtiene los expedientes CHUBB con estado "Autorizado" y estatus_audatrace vacío
    2. Por cada expediente, navega a Inpart -> Estatus de Piezas
    3. Extrae la tabla de piezas con todos sus datos
    4. Guarda las piezas en la tabla chubb_piezas
    
    El proceso se ejecuta en background. Usa el endpoint /status/{job_id} para consultar progreso.
    """
    import uuid
    
    job_id = str(uuid.uuid4())
    
    # Crear entrada inicial
    rpa_jobs[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "message": "Extracción de piezas de CHUBB encolada",
        "started_at": None,
        "completed_at": None,
        "output": None,
        "error": None,
        "logs": [],
        "seguro": "CHUBB",
        "tipo": "piezas"
    }
    
    # Ejecutar en background
    background_tasks.add_task(
        run_chubb_piezas_extraction,
        job_id=job_id,
        headless=request.headless,
        max_expedientes=request.max_expedientes,
        fecha_desde=request.fecha_desde
    )
    
    return RPAResponse(
        job_id=job_id,
        status="queued",
        message="Extracción de piezas de CHUBB encolada. Usa /status/{job_id} para consultar progreso.",
        started_at=None,
        completed_at=None,
        output=None,
        error=None
    )
