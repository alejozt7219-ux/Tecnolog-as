import uuid
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from datetime import datetime, timedelta, timezone
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.product import SearchHistory, TaskStatus, Product, PriceResult
from app.schemas.product import ScanResponse, TaskStatusResponse, SearchHistoryOut
from app.services.vision import identify_product_from_image
from app.workers.tasks import scrape_product

router = APIRouter(tags=["scan"])

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}

# Rate limit: máximo de escaneos por usuario en una ventana de tiempo
SCAN_RATE_LIMIT = 10       # máx solicitudes
SCAN_RATE_WINDOW = 60 * 60  # ventana de 1 hora en segundos


async def check_scan_rate_limit(user_id: int, db: AsyncSession) -> None:
    """Bloquea si el usuario hizo demasiados escaneos en la última hora."""
    window_start = datetime.now(timezone.utc) - timedelta(seconds=SCAN_RATE_WINDOW)
    result = await db.execute(
        select(func.count(SearchHistory.id)).where(
            SearchHistory.user_id == user_id,
            SearchHistory.created_at >= window_start,
        )
    )
    count = result.scalar_one()
    if count >= SCAN_RATE_LIMIT:
        raise HTTPException(
            status_code=429,
            detail=f"Límite alcanzado: máximo {SCAN_RATE_LIMIT} búsquedas por hora. Intenta más tarde.",
            headers={"Retry-After": str(SCAN_RATE_WINDOW)},
        )


@router.post("/scan", response_model=ScanResponse)
async def scan(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Rate limit por usuario
    await check_scan_rate_limit(current_user.id, db)

    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Solo se aceptan imágenes JPG, PNG o WebP")

    image_bytes = await file.read()
    if len(image_bytes) > 10 * 1024 * 1024:  # 10 MB límite
        raise HTTPException(status_code=400, detail="Imagen demasiado grande (máx. 10 MB)")

    # 1. Identificar producto con Gemini Vision
    try:
        product_info = await identify_product_from_image(image_bytes, file.content_type)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"No se pudo identificar el producto: {e}")

    query = product_info.get("search_query") or product_info.get("name", "producto desconocido")
    task_id = str(uuid.uuid4())

    # 2. Guardar búsqueda en historial
    history = SearchHistory(
        user_id=current_user.id,
        task_id=task_id,
        query=query,
        status=TaskStatus.pending,
    )
    db.add(history)
    await db.flush()

    # 3. Encolar tarea Celery
    scrape_product.delay(
        task_id=task_id,
        query=query,
        search_history_id=history.id,
    )

    await db.commit()
    return ScanResponse(
        task_id=task_id,
        status=TaskStatus.pending,
        message=f"Buscando: {query}",
        vision=product_info,  # devolver atributos IA al frontend de inmediato
    )


@router.get("/results/{task_id}", response_model=TaskStatusResponse)
async def get_results(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SearchHistory)
        .where(
            SearchHistory.task_id == task_id,
        )
        # Admin tasks can be polled by any authenticated user
        .options(
            selectinload(SearchHistory.product).selectinload(Product.prices).selectinload(PriceResult.store)
        )
    )
    history = result.scalar_one_or_none()

    if not history:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")

    return TaskStatusResponse(
        task_id=task_id,
        status=history.status,
        product=history.product,
        error=history.error_message,
    )


@router.get("/search", response_model=TaskStatusResponse)
async def search_by_text(
    q: str = Query(..., min_length=2),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Búsqueda por texto (fallback cuando no hay foto)."""
    await check_scan_rate_limit(current_user.id, db)

    task_id = str(uuid.uuid4())

    history = SearchHistory(
        user_id=current_user.id,
        task_id=task_id,
        query=q,
        status=TaskStatus.pending,
    )
    db.add(history)
    await db.flush()

    scrape_product.delay(task_id=task_id, query=q, search_history_id=history.id)
    await db.commit()

    return TaskStatusResponse(task_id=task_id, status=TaskStatus.pending)


@router.get("/history", response_model=list[SearchHistoryOut])
async def get_history(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    offset = (page - 1) * limit
    result = await db.execute(
        select(SearchHistory)
        .where(SearchHistory.user_id == current_user.id)
        .options(
            selectinload(SearchHistory.product)
            .selectinload(Product.prices)
            .selectinload(PriceResult.store)
        )
        .order_by(SearchHistory.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return result.scalars().all()

@router.get("/history/global", response_model=list[SearchHistoryOut])
async def get_global_history(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Historial combinado para el dashboard:
    - Búsquedas propias del usuario
    - Scrapings manuales del admin (triggered_by_admin=True), visibles para todos
    Ordenado por fecha descendente sin duplicados.
    """
    from sqlalchemy import or_
    offset = (page - 1) * limit
    result = await db.execute(
        select(SearchHistory)
        .where(
            or_(
                SearchHistory.user_id == current_user.id,
                SearchHistory.triggered_by_admin == True,
            )
        )
        .options(
            selectinload(SearchHistory.product)
            .selectinload(Product.prices)
            .selectinload(PriceResult.store)
        )
        .order_by(SearchHistory.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return result.scalars().all()