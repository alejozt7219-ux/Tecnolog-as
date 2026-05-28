from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import verify_password, create_access_token, create_refresh_token, decode_token, hash_password
from app.core.deps import get_current_user
from app.models.user import User, UserRole
from app.schemas.auth import LoginRequest, TokenResponse, RefreshRequest, UserOut, UserCreate

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=201)
async def register(body: UserCreate, db: AsyncSession = Depends(get_db)):
    # Verificar que el email no esté en uso
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe una cuenta con ese correo electrónico",
        )

    is_first_admin = False
    if body.role == UserRole.admin:
        existing = await db.execute(
            select(User).where(User.role == UserRole.admin, User.is_active == True)
        )
        if not existing.scalar_one_or_none():
            is_first_admin = True

    user = User(
        name=body.name,
        email=body.email,
        hashed_password=hash_password(body.password),
        role=body.role if body.role else UserRole.analyst,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    # FIX: Si es el primer admin, disparar el scraping demo UNA SOLA VEZ.
    # Se usa un lock Redis (SET NX) para evitar el doble disparo si el beat
    # schedule o cualquier otra fuente ya lo ejecutó en las últimas 24 h.
    if is_first_admin:
        try:
            import redis as _redis
            from app.core.config import settings as _settings
            _r = _redis.from_url(_settings.REDIS_URL, decode_responses=True)
            # SET NX: retorna True solo si la clave no existía → ganamos el lock
            if _r.set("pricevision:startup_demo_fired", "1", nx=True, ex=86400):
                from app.workers.tasks import run_startup_demo_scraping
                run_startup_demo_scraping.delay()
        except Exception:
            # Si Redis no está disponible, disparar igual (mejor que no disparar)
            from app.workers.tasks import run_startup_demo_scraping
            run_startup_demo_scraping.delay()

    return user


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo o contraseña incorrectos",
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuario inactivo")

    return TokenResponse(
        access_token=create_access_token({"sub": str(user.id), "role": str(user.role)}),
        refresh_token=create_refresh_token({"sub": str(user.id)}),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    payload = decode_token(body.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token inválido")

    result = await db.execute(select(User).where(User.id == int(payload["sub"])))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no encontrado")

    return TokenResponse(
        access_token=create_access_token({"sub": str(user.id), "role": str(user.role)}),
        refresh_token=create_refresh_token({"sub": str(user.id)}),
    )


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return current_user