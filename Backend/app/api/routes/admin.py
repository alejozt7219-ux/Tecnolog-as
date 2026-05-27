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
from pydantic import BaseModel
from typing import Optional

class TriggerScrapingRequest(BaseModel):
    query: Optional[str] = None

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

    # Borrar registros relacionados antes de eliminar el usuario
    from app.models.product import SearchHistory
    history = await db.execute(select(SearchHistory).where(SearchHistory.user_id == user_id))
    for h in history.scalars().all():
        await db.delete(h)

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
async def trigger_scraping(
    payload: TriggerScrapingRequest = TriggerScrapingRequest(),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    import uuid as _uuid
    from app.workers.tasks import scrape_product
    from app.models.product import SearchHistory, TaskStatus

    query = (payload.query or "").strip()
    if not query:
        raise HTTPException(status_code=422, detail="Debes especificar un producto a scrapear.")

    task_id = str(_uuid.uuid4())

    # Crear el historial asociado al admin, marcado como global para todos los usuarios
    history = SearchHistory(
        user_id=admin.id,
        task_id=task_id,
        query=query,
        status=TaskStatus.pending,
        triggered_by_admin=True,  # visible para TODOS los usuarios en su dashboard
    )
    db.add(history)
    await db.commit()
    await db.refresh(history)

    # Encolar en Celery
    scrape_product.delay(task_id=task_id, query=query, search_history_id=history.id)

    return {"message": "Scraping manual iniciado", "task_id": task_id, "query": query}


@router.post("/stores/fix-defaults", status_code=200)
async def fix_default_stores(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Limpia tiendas duplicadas/incorrectas y deja las 5 correctas."""
    from app.models.product import Store

    CORRECT = {
        "Amazon":       "https://www.amazon.com",
        "Alkosto":      "https://www.alkosto.com",
        "MercadoLibre": "https://www.mercadolibre.com.co",
        "Falabella":    "https://www.falabella.com.co",
        "Éxito":        "https://www.exito.com",
    }

    # Eliminar tiendas incorrectas: Linio, duplicados MercadoLibre, Éxito con URL larga
    result = await db.execute(select(Store))
    all_stores = result.scalars().all()

    seen = set()
    for store in all_stores:
        name_key = store.name.lower().replace(" ", "").replace("é", "e").replace("é", "e")
        # Borrar Linio
        if "linio" in name_key:
            await db.delete(store)
            continue
        # Borrar duplicados MercadoLibre (queda solo el primero)
        if "mercadolibre" in name_key or "mercado libre" in name_key.replace("mercadolibre",""):
            if "mercadolibre" in seen:
                await db.delete(store)
                continue
            seen.add("mercadolibre")
        # Arreglar URL de Éxito
        if "exito" in name_key or "éxito" in store.name.lower():
            store.base_url = "https://www.exito.com"
        # Arreglar URL de MercadoLibre si tiene path
        if ("mercadolibre" in name_key) and len(store.base_url) > 35:
            store.base_url = "https://www.mercadolibre.com.co"
        # Reemplazar Linio por Alkosto si existe con ese nombre
        if store.name == "Alkosto":
            store.base_url = "https://www.alkosto.com"

    # Crear tiendas faltantes
    for store_name, store_url in CORRECT.items():
        existing = await db.execute(select(Store).where(Store.name == store_name))
        if not existing.scalar_one_or_none():
            db.add(Store(name=store_name, base_url=store_url, is_active=True))

    await db.commit()
    return {"message": "Tiendas actualizadas correctamente"}


# ── Scraping Schedule ─────────────────────────────────

SCHEDULE_REDIS_KEY = "pricevision:scraping_schedule"
SCHEDULE_DEFAULT   = {"frequency": "daily", "hour": 8, "minute": 30, "enabled": True}

def _get_redis():
    import redis as redis_lib
    from app.core.config import settings
    return redis_lib.from_url(settings.REDIS_URL, decode_responses=True)

def _apply_beat_schedule(hour: int, minute: int, enabled: bool):
    """Reprograma el beat en caliente sin reiniciar el worker."""
    from app.workers.celery_app import celery_app
    from celery.schedules import crontab
    if enabled:
        celery_app.conf.beat_schedule["daily-scraping"] = {
            "task": "app.workers.tasks.run_startup_demo_scraping",
            "schedule": crontab(hour=hour, minute=minute),
        }
    else:
        celery_app.conf.beat_schedule.pop("daily-scraping", None)

class ScheduleUpdate(BaseModel):
    frequency: str   # "daily" | "disabled"
    hour: int
    minute: int
    enabled: bool

@router.get("/scraping/schedule")
async def get_scraping_schedule(
    _: User = Depends(require_admin),
):
    try:
        r = _get_redis()
        raw = r.get(SCHEDULE_REDIS_KEY)
        if raw:
            import json
            return json.loads(raw)
    except Exception:
        pass
    return SCHEDULE_DEFAULT

@router.post("/scraping/schedule")
async def update_scraping_schedule(
    payload: ScheduleUpdate,
    _: User = Depends(require_admin),
):
    import json
    data = {
        "frequency": payload.frequency,
        "hour":      payload.hour,
        "minute":    payload.minute,
        "enabled":   payload.enabled,
    }
    try:
        r = _get_redis()
        r.set(SCHEDULE_REDIS_KEY, json.dumps(data))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"No se pudo guardar el schedule en Redis: {e}")

    _apply_beat_schedule(payload.hour, payload.minute, payload.enabled)
    return {"ok": True, **data}


@router.post("/scraping/reset-demo", status_code=200)
async def reset_demo_products(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Solo borra el historial de scrapings manuales del admin. NO lanza scraping."""
    from app.models.product import SearchHistory
    from sqlalchemy import delete as sa_delete

    await db.execute(
        sa_delete(SearchHistory).where(
            SearchHistory.user_id == admin.id,
            SearchHistory.triggered_by_admin == True,
        )
    )
    await db.commit()
    return {"message": "Historial de scraping manual eliminado correctamente"}


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


@router.get("/scraping/history")
async def scraping_history(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Historial real de scrapings basado en SearchHistory — incluye manuales y de usuario."""
    from sqlalchemy.orm import selectinload
    from app.models.product import PriceResult
    offset = (page - 1) * limit
    result = await db.execute(
        select(SearchHistory)
        .options(
            selectinload(SearchHistory.user),
            selectinload(SearchHistory.product)
            .selectinload(Product.prices)
            .selectinload(PriceResult.store),
        )
        .order_by(SearchHistory.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    histories = result.scalars().all()
    return [
        {
            "id": h.id,
            "task_id": h.task_id,
            "query": h.query,
            "status": h.status,
            "triggered_by_admin": h.triggered_by_admin,
            "created_at": h.created_at.isoformat(),
            "user_name": h.user.name if h.user else None,
            "product": {
                "id": h.product.id,
                "name": h.product.name,
                "prices": [
                    {
                        "store": {"name": pr.store.name} if pr.store else None,
                        "price": pr.price,
                        "currency": pr.currency,
                        "url": pr.url,
                    }
                    for pr in (h.product.prices or [])
                ],
            } if h.product else None,
        }
        for h in histories
    ]