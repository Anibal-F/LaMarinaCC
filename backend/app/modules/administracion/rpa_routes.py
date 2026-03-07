"""
Endpoints para ejecutar RPA de aseguradoras desde el frontend.
"""

import subprocess
import os
from pathlib import Path
from datetime import datetime
from fastapi import APIRouter, HTTPException, status, BackgroundTasks
from pydantic import BaseModel, Field
from typing import Optional, Literal, List

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
    anio_vehiculo: str = Field(default="", description="Año del vehículo")
    color_vehiculo: str = Field(default="", description="Código hex del color (ej: 000000 para negro)")
    placa: str = Field(default="", description="Número de placa")
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
    
    # Construir comando
    cmd = [
        "python", "-m", f"app.rpa.{script_name.replace('.py', '')}",
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
    
    if not script_path.exists():
        rpa_jobs[job_id]["status"] = "failed"
        rpa_jobs[job_id]["error"] = f"Script no encontrado: {script_path}"
        rpa_jobs[job_id]["completed_at"] = datetime.now().isoformat()
        return
    
    # Guardar datos en archivo temporal
    temp_dir = backend_dir / "temp"
    temp_dir.mkdir(exist_ok=True)
    temp_file = temp_dir / f"adjudicacion_{job_id}.json"
    
    try:
        with open(temp_file, "w", encoding="utf-8") as f:
            f.write(datos_json)
        
        # Construir comando
        cmd = [
            "python", "-m", f"app.rpa.{script_name.replace('.py', '')}",
            str(temp_file),
            "--use-db"
        ]
        
        # Siempre usar headless en Docker
        is_docker = os.path.exists('/.dockerenv') or os.getenv('DOCKER_CONTAINER', False)
        if headless or is_docker:
            cmd.append("--headless")
        
        # Ejecutar script
        rpa_jobs[job_id]["status"] = "running"
        rpa_jobs[job_id]["started_at"] = datetime.now().isoformat()
        
        result = subprocess.run(
            cmd,
            cwd=str(backend_dir),
            capture_output=True,
            text=True,
            timeout=120,  # 2 minutos por adjudicación
            encoding='utf-8',
            errors='replace'
        )
        
        rpa_jobs[job_id]["output"] = result.stdout
        
        # Leer resultado del archivo de salida
        result_file = temp_file.with_suffix('.result.json')
        if result_file.exists():
            import json
            with open(result_file, "r", encoding="utf-8") as f:
                resultado = json.load(f)
            rpa_jobs[job_id]["resultado"] = resultado
            result_file.unlink()
        
        if result.returncode == 0:
            rpa_jobs[job_id]["status"] = "completed"
            rpa_jobs[job_id]["message"] = "Adjudicación completada exitosamente"
        else:
            rpa_jobs[job_id]["status"] = "failed"
            rpa_jobs[job_id]["error"] = result.stderr or "Error desconocido"
            
    except subprocess.TimeoutExpired:
        rpa_jobs[job_id]["status"] = "failed"
        rpa_jobs[job_id]["error"] = "Timeout: La adjudicación tardó más de 2 minutos"
    except Exception as e:
        rpa_jobs[job_id]["status"] = "failed"
        rpa_jobs[job_id]["error"] = str(e)
    finally:
        # Limpiar archivo temporal
        if temp_file.exists():
            temp_file.unlink()
        rpa_jobs[job_id]["completed_at"] = datetime.now().isoformat()


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
