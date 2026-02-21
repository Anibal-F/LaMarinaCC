"""
Endpoints para ejecutar RPA de aseguradoras desde el frontend.
"""

import subprocess
import os
from pathlib import Path
from datetime import datetime
from fastapi import APIRouter, HTTPException, status, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, Literal

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
    
    if headless:
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


@router.post("/qualitas", response_model=RPAResponse)
async def run_qualitas_rpa(
    background_tasks: BackgroundTasks,
    request: RPARequest
):
    """
    Ejecuta el RPA de Qualitas.
    """
    job_id = f"qualitas_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{id(request)}"
    
    rpa_jobs[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "message": "RPA de Qualitas en cola",
        "seguro": "QUALITAS"
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
        "seguro": "CHUBB"
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
            "status": job.get("status"),
            "started_at": job.get("started_at"),
            "completed_at": job.get("completed_at"),
            "has_error": bool(job.get("error"))
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
