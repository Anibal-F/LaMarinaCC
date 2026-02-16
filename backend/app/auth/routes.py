from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from passlib.context import CryptContext

from app.core.db import get_connection

router = APIRouter(prefix="/auth", tags=["auth"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class LoginRequest(BaseModel):
    user_name: str
    password: str


class LoginResponse(BaseModel):
    name: str
    user_name: str
    email: str
    profile: str


class RegisterRequest(BaseModel):
    name: str
    user_name: str
    password: str
    email: str
    profile: str = "Administrador"
    profile_id: int | None = None
    status: bool = True


class RegisterResponse(BaseModel):
    name: str
    user_name: str
    email: str
    profile: str
    status: bool


def _verify_password(plain_password: str, stored_password: str) -> bool:
    if stored_password.startswith("$2a$") or stored_password.startswith("$2b$") or stored_password.startswith("$2y$"):
        return pwd_context.verify(plain_password, stored_password)
    return plain_password == stored_password


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest):
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT
                u.name,
                u.user_name,
                u.password,
                u.email,
                COALESCE(p.profile_name, u.profile) AS profile_name,
                u.status
            FROM users u
            LEFT JOIN profiles p ON p.id = u.profile_id
            WHERE u.user_name = %s OR u.email = %s
            LIMIT 1
            """,
            (payload.user_name, payload.user_name),
        ).fetchone()

    if not row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales inválidas")

    name, user_name, password, email, profile, status_flag = row

    if status_flag is False:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuario inactivo")

    if not _verify_password(payload.password, password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales inválidas")

    return LoginResponse(name=name, user_name=user_name, email=email, profile=profile)


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest):
    hashed_password = pwd_context.hash(payload.password)

    with get_connection() as conn:
        profile_name = payload.profile
        if payload.profile_id is not None:
            profile_row = conn.execute(
                "SELECT profile_name FROM profiles WHERE id = %s LIMIT 1",
                (payload.profile_id,),
            ).fetchone()
            if not profile_row:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Perfil no encontrado")
            profile_name = profile_row[0]

        exists = conn.execute(
            """
            SELECT 1
            FROM users
            WHERE user_name = %s OR email = %s
            LIMIT 1
            """,
            (payload.user_name, payload.email),
        ).fetchone()

        if exists:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Usuario ya existe")

        row = conn.execute(
            """
            INSERT INTO users (name, user_name, password, email, profile, profile_id, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING name, user_name, email, profile, status
            """,
            (
                payload.name,
                payload.user_name,
                hashed_password,
                payload.email,
                profile_name,
                payload.profile_id,
                payload.status,
            ),
        ).fetchone()

    return RegisterResponse(
        name=row[0],
        user_name=row[1],
        email=row[2],
        profile=row[3],
        status=row[4],
    )
