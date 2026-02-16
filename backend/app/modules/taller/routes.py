from fastapi import APIRouter

router = APIRouter(prefix="/taller", tags=["taller"])


@router.get("/health")
def health_check():
    return {"module": "taller", "status": "ok"}
