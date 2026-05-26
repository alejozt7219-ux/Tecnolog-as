from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.core.deps import require_admin
from app.models.user import User, UserRole
from app.models.product import Store, ScrapingLog, SearchHistory, Product
from app.schemas.auth import UserOut, UserCreate, UserToggle
from app.schemas.product import StoreOut, StoreCreate, ScrapingLogOut
from app.core.security import hash_password
import uuid

router = APIRouter(prefix="/admin", tags=["admin"])


# ── Overview ──────────────────────────────────────────
@router.get("/overview")
async def admin_overview(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    total_users     = await db.scalar(select(func.count(User.id)))
    active_users    = await db.scalar(select(func.count(User.id)).where(User.is_active == True))
    admin_users     = await db.scalar(select(func.count(User.id)).where(User.role == UserRole.admin))
    total_stores    = await db.scalar(select(func.count(Store.id)))
    active_stores   = await db.scalar(select(func.count(Store.id)).where(Store.is_active == True))
    total_searches  = await db.scalar(select(func.count(SearchHistory.id)))
    done_searches   = await db.scalar(
        select(func.count(SearchHistory.id)).where(SearchHistory.status == "done")
    )
    total_products  = await db.scalar(select(func.count(Product.id)))

    last_log_result = await db.execute(
        select(ScrapingLog).order_by(ScrapingLog.created_at.desc()).limit(1)
    )
    last = last_log_result.scalar_one_or_none()

    return {
        "users": {
            "total":   total_users,
            "active":  active_users,
            "admins":  admin_users,
        },
        "stores": {
            "total":  total_stores,
            "active": active_stores,
        },
        "searches": {
            "total":     total_searches,
            "completed": done_searches,
        },
        "products":  total_products,
        "scraping": {
            "scheduler":  "active",
            "schedule":   "08:30 AM daily",
            "last_run":   last.created_at.isoformat() if last else None,
            "last_status": last.status if last else None,
        },
    }


# ── Usuarios ──────────────────────────────────────────
@router.get("/users", response_model=list[UserOut])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(select(User).order_by(User.created_at))
    return result.scalars().all()


@router.post("/users", response_model=UserOut, status_code=201)
async def create_user(
    body: UserCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Ya existe un usuario con ese correo")

    user = User(
        name=body.name,
        email=body.email,
        hashed_password=hash_password(body.password),
        role=body.role,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.put("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int,
    body: UserCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    # No permitir que el admin se quite su propio rol
    if user_id == admin.id and body.role != UserRole.admin:
        raise HTTPException(status_code=400, detail="No puedes cambiar tu propio rol de administrador")

    user.name  = body.name
    user.email = body.email
    user.role  = body.role
    if body.password:
        user.hashed_password = hash_password(body.password)

    await db.commit()
    await db.refresh(user)
    return user


@router.post("/users/{user_id}/toggle", response_model=UserOut)
async def toggle_user(
    user_id: int,
    body: UserToggle,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="No puedes desactivarte a ti mismo")

    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    user.is_active = body.is_active
    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="No puedes eliminarte a ti mismo")

    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    await db.delete(user)
    await db.commit()


# ── Tiendas ───────────────────────────────────────────
@router.get("/stores", response_model=list[StoreOut])
async def list_stores(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(select(Store).order_by(Store.name))
    return result.scalars().all()


@router.post("/stores", response_model=StoreOut, status_code=201)
async def create_store(
    body: StoreCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    existing = await db.execute(select(Store).where(Store.name == body.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Ya existe una tienda con ese nombre")

    store = Store(**body.model_dump())
    db.add(store)
    await db.commit()
    await db.refresh(store)
    return store


@router.delete("/stores/{store_id}", status_code=204)
async def delete_store(
    store_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    store = await db.get(Store, store_id)
    if not store:
        raise HTTPException(status_code=404, detail="Tienda no encontrada")

    await db.delete(store)
    await db.commit()


@router.patch("/stores/{store_id}/toggle", response_model=StoreOut)
async def toggle_store(
    store_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    store = await db.get(Store, store_id)
    if not store:
        raise HTTPException(status_code=404, detail="Tienda no encontrada")

    store.is_active = not store.is_active
    await db.commit()
    await db.refresh(store)
    return store


# ── Scraping ──────────────────────────────────────────
@router.get("/scraping/status")
async def scraping_status(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    total = await db.scalar(select(func.count(SearchHistory.id)))
    done = await db.scalar(
        select(func.count(SearchHistory.id)).where(SearchHistory.status == "done")
    )
    last_log = await db.execute(
        select(ScrapingLog).order_by(ScrapingLog.created_at.desc()).limit(1)
    )
    last = last_log.scalar_one_or_none()

    return {
        "total_searches":     total,
        "completed_searches": done,
        "scheduler":          "active",
        "schedule":           "08:30 AM daily",
        "last_run":           last.created_at.isoformat() if last else None,
        "last_status":        last.status if last else None,
    }


@router.post("/scraping/trigger")
async def trigger_scraping(_: User = Depends(require_admin)):
    from app.workers.tasks import run_daily_scraping
    run_daily_scraping.delay()
    return {"message": "Scraping iniciado", "task_id": str(uuid.uuid4())}


@router.get("/scraping/logs", response_model=list[ScrapingLogOut])
async def scraping_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    offset = (page - 1) * limit
    result = await db.execute(
        select(ScrapingLog)
        .order_by(ScrapingLog.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return result.scalars().all()