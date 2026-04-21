import secrets
import string
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from models import AdminUser
from schemas import LoginRequest, Token, InviteRequest
from security import verify_password, create_access_token, get_password_hash, get_current_admin

router = APIRouter()

@router.post("/login", response_model=Token)
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)):
    # Look for the user
    stmt = select(AdminUser).where(AdminUser.email == request.email)
    result = await db.execute(stmt)
    user = result.scalars().first()

    if not user or not verify_password(request.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")

    # Create token
    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/invite")
async def invite_admin(
    payload: InviteRequest, 
    current_admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Creates a new administrator account with a random password 
    and simulates sending a welcome email.
    """
    # Check if user already exists
    stmt = select(AdminUser).where(AdminUser.email == payload.email)
    result = await db.execute(stmt)
    existing_user = result.scalars().first()

    if existing_user:
        raise HTTPException(status_code=400, detail="User already exists")

    # Generate random temporary password
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    random_password = ''.join(secrets.choice(alphabet) for i in range(12))

    new_admin = AdminUser(
        email=payload.email,
        hashed_password=get_password_hash(random_password),
        is_active=True
    )

    db.add(new_admin)
    await db.commit()

    import smtplib
    from email.message import EmailMessage

    # NOTE: Set these environment variables in your system or .env file
    # For Gmail, you MUST use an "App Password", not your normal password.
    smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", 587))
    smtp_user = os.getenv("SMTP_USER", "tu_correo@gmail.com")
    smtp_password = os.getenv("SMTP_PASSWORD", "tu_app_password")

    msg = EmailMessage()
    msg['Subject'] = 'Invitación para ser Administrador - TurbidezApp'
    msg['From'] = f"TurbidezApp <{smtp_user}>"
    msg['To'] = payload.email
    
    html_content = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #333;">
        <h2>¡Bienvenido a TurbidezApp!</h2>
        <p>Has sido invitado a formar parte del panel administrativo de la plataforma de monitoreo de turbidez.</p>
        <p>Tu contraseña de acceso temporal es: <strong>{random_password}</strong></p>
        <br>
        <p><i>Te recomendamos ingresar y mantener esta contraseña segura.</i></p>
      </body>
    </html>
    """
    msg.set_content("Tu contraseña temporal es: " + random_password)
    msg.add_alternative(html_content, subtype='html')

    email_sent = False
    error_msg = ""
    if smtp_user != "tu_correo@gmail.com":
        try:
            with smtplib.SMTP(smtp_server, smtp_port) as server:
                server.starttls()
                server.login(smtp_user, smtp_password)
                server.send_message(msg)
            email_sent = True
        except Exception as e:
            error_msg = str(e)
            print("Error enviando correo SMTP:", error_msg)
    else:
        # Fallback to simulation if user hasn't configured credentials yet
        print("--- Credenciales SMTP no configuradas. Correo simulado: ---")
        print(f"To: {payload.email} | Pass: {random_password}")

    return {
        "message": "Invitation processed successfully", 
        "invited_email": payload.email, 
        "email_sent": email_sent,
        "detail": error_msg if not email_sent else "Email sent via SMTP"
    }
