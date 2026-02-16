from fastapi import APIRouter

router = APIRouter(prefix="/pintura", tags=["pintura"])


@router.get("/health")
def health_check():
    return {"module": "pintura", "status": "ok"}
