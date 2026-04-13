from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext
from datetime import datetime, timedelta
import secrets
import os

from app.core.db import get_connection

router = APIRouter(prefix="/auth", tags=["auth"])

pwd_context = CryptContext(schemes=["pbkdf2_sha256", "bcrypt"], deprecated="auto")

# Configuración de AWS SES (usará IAM role si está en EC2)
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
SES_FROM_EMAIL = os.getenv("SES_FROM_EMAIL", "noreply@marinasuite.com.mx")


class LoginRequest(BaseModel):
    user_name: str
    password: str


class LoginResponse(BaseModel):
    name: str
    user_name: str
    email: str | None = None
    profile: str


class RegisterRequest(BaseModel):
    name: str
    user_name: str
    password: str
    email: str | None = None
    profile: str = "Administrador"
    profile_id: int | None = None
    status: bool = True


class RegisterResponse(BaseModel):
    name: str
    user_name: str
    email: str | None = None
    profile: str
    status: bool


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    message: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class ResetPasswordResponse(BaseModel):
    message: str


def _verify_password(plain_password: str, stored_password: str) -> bool:
    # If password looks like a supported hash, verify with passlib.
    # Keep plain-text fallback for legacy records.
    if pwd_context.identify(stored_password):
        return pwd_context.verify(plain_password, stored_password)
    return plain_password == stored_password


def _ensure_password_reset_table(conn):
    """Asegura que existe la tabla para tokens de recuperación de contraseña"""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token VARCHAR(255) NOT NULL UNIQUE,
            expires_at TIMESTAMP NOT NULL,
            used BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_password_reset_token 
        ON password_reset_tokens(token)
    """)


def _send_reset_email(to_email: str, reset_link: str) -> bool:
    """Envía correo de recuperación usando AWS SES"""
    try:
        import boto3
        
        # Crear cliente SES (usará IAM role automáticamente en EC2)
        ses_client = boto3.client('ses', region_name=AWS_REGION)
        
        subject = "Recuperación de contraseña - Marina Suite"
        
        body_text = f"""
        Hola,

        Has solicitado restablecer tu contraseña de Marina Suite.

        Haz clic en el siguiente enlace para crear una nueva contraseña:
        {reset_link}

        Este enlace expirará en 1 hora.

        Si no solicitaste este cambio, ignora este correo.

        Saludos,
        Equipo de Marina Suite
        """
        
        body_html = f"""
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .button {{ 
                    display: inline-block; 
                    padding: 12px 24px; 
                    background-color: #00527a; 
                    color: white; 
                    text-decoration: none; 
                    border-radius: 5px;
                    margin: 20px 0;
                }}
                .footer {{ margin-top: 30px; font-size: 12px; color: #666; }}
            </style>
        </head>
        <body>
            <div class="container">
                <h2>Recuperación de contraseña</h2>
                <p>Hola,</p>
                <p>Has solicitado restablecer tu contraseña de <strong>Marina Suite</strong>.</p>
                <p>Haz clic en el siguiente botón para crear una nueva contraseña:</p>
                <a href="{reset_link}" class="button">Restablecer contraseña</a>
                <p>O copia y pega este enlace en tu navegador:</p>
                <p>{reset_link}</p>
                <p><strong>Este enlace expirará en 1 hora.</strong></p>
                <p>Si no solicitaste este cambio, ignora este correo.</p>
                <div class="footer">
                    <p>Saludos,<br>Equipo de Marina Suite</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        response = ses_client.send_email(
            Source=SES_FROM_EMAIL,
            Destination={'ToAddresses': [to_email]},
            Message={
                'Subject': {'Data': subject},
                'Body': {
                    'Text': {'Data': body_text},
                    'Html': {'Data': body_html}
                }
            }
        )
        
        return True
    except Exception as e:
        # En desarrollo, solo loguear el error pero no fallar
        print(f"[EMAIL ERROR] No se pudo enviar correo: {e}")
        # Si no está configurado SES, al menos mostrar el link en logs
        print(f"[EMAIL DEBUG] Link de recuperación: {reset_link}")
        return False


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest):
    credential = (payload.user_name or "").strip()
    normalized_email = credential.lower()

    if not credential or not (payload.password or "").strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Usuario/correo y contraseña requeridos")

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
            WHERE TRIM(u.user_name) = %s OR LOWER(TRIM(COALESCE(u.email, ''))) = %s
            LIMIT 1
            """,
            (credential, normalized_email),
        ).fetchone()

    if not row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales inválidas")

    name, user_name, password, email, profile, status_flag = row

    if status_flag is False:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuario inactivo")

    if not _verify_password(payload.password.strip(), password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales inválidas")

    return LoginResponse(name=name, user_name=user_name, email=email, profile=profile)


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest):
    hashed_password = pwd_context.hash(payload.password)
    normalized_email = (payload.email or "").strip() or None

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
            WHERE user_name = %s OR (%s IS NOT NULL AND email = %s)
            LIMIT 1
            """,
            (payload.user_name, normalized_email, normalized_email),
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
                normalized_email,
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


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(payload: ForgotPasswordRequest):
    """Solicita recuperación de contraseña - envía correo con link"""
    email = payload.email.lower().strip()
    
    with get_connection() as conn:
        _ensure_password_reset_table(conn)
        
        # Buscar usuario por email
        user = conn.execute(
            "SELECT id, name, email FROM users WHERE LOWER(TRIM(email)) = %s AND status = TRUE LIMIT 1",
            (email,)
        ).fetchone()
        
        if not user:
            # Por seguridad, no revelar si el email existe o no
            return ForgotPasswordResponse(
                message="Si el correo existe en nuestro sistema, recibirás instrucciones para restablecer tu contraseña."
            )
        
        user_id, user_name, user_email = user
        
        # Generar token seguro
        token = secrets.token_urlsafe(32)
        expires_at = datetime.utcnow() + timedelta(hours=1)
        
        # Guardar token en BD
        conn.execute(
            """
            INSERT INTO password_reset_tokens (user_id, token, expires_at)
            VALUES (%s, %s, %s)
            """,
            (user_id, token, expires_at)
        )
        
        # Construir link de recuperación
        frontend_url = os.getenv("FRONTEND_URL", "https://marinasuite.com.mx")
        reset_link = f"{frontend_url}/reset-password?token={token}"
        
        # Enviar correo
        email_sent = _send_reset_email(user_email, reset_link)
        
        if not email_sent:
            # Si no se pudo enviar el correo, devolver el link en desarrollo
            # En producción esto no debería pasar
            print(f"[DEBUG] Token generado para {email}: {token}")
            print(f"[DEBUG] Link: {reset_link}")
    
    return ForgotPasswordResponse(
        message="Si el correo existe en nuestro sistema, recibirás instrucciones para restablecer tu contraseña."
    )


@router.post("/reset-password", response_model=ResetPasswordResponse)
def reset_password(payload: ResetPasswordRequest):
    """Restablece la contraseña usando un token válido"""
    if len(payload.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="La contraseña debe tener al menos 6 caracteres"
        )
    
    with get_connection() as conn:
        _ensure_password_reset_table(conn)
        
        # Buscar token válido
        token_data = conn.execute(
            """
            SELECT t.user_id, t.expires_at, t.used, u.email
            FROM password_reset_tokens t
            JOIN users u ON u.id = t.user_id
            WHERE t.token = %s
            LIMIT 1
            """,
            (payload.token,)
        ).fetchone()
        
        if not token_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Token inválido o expirado"
            )
        
        user_id, expires_at, used, user_email = token_data
        
        # Verificar si ya fue usado o expiró
        if used:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Este link ya fue usado. Solicita uno nuevo."
            )
        
        if expires_at < datetime.utcnow():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El link expiró. Solicita uno nuevo."
            )
        
        # Hashear nueva contraseña
        hashed_password = pwd_context.hash(payload.new_password)
        
        # Actualizar contraseña del usuario
        conn.execute(
            "UPDATE users SET password = %s WHERE id = %s",
            (hashed_password, user_id)
        )
        
        # Marcar token como usado
        conn.execute(
            "UPDATE password_reset_tokens SET used = TRUE WHERE token = %s",
            (payload.token,)
        )
    
    return ResetPasswordResponse(
        message="Contraseña actualizada exitosamente. Ya puedes iniciar sesión."
    )
