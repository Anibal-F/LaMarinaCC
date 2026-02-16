from fastapi import APIRouter

router = APIRouter(prefix="/inventario", tags=["inventario"])


@router.get("/health")
def health_check():
    return {"module": "inventario", "status": "ok"}
