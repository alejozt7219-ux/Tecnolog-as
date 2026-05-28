import asyncio
import logging
import random
import re
import unicodedata
from app.workers.celery_app import celery_app
from app.scraper.amazon import AmazonScraper
from app.scraper.mercadolibre import MercadoLibreScraper
from app.scraper.falabella import FalabellaScraper
from app.scraper.exito import ExitoScraper
from app.scraper.alkosto import AlkostoScraper

logger = logging.getLogger(__name__)

SCRAPER_MAP = {
    "Amazon":        AmazonScraper,
    "Mercado Libre": MercadoLibreScraper,
    "Falabella":     FalabellaScraper,
    "Éxito":         ExitoScraper,
    "Alkosto":       AlkostoScraper,
}

# Productos predeterminados — se cargan automáticamente al iniciar
DEMO_PRODUCTS = [
    "Nike Air Max 90",
    "Auriculares Sony WH-CH520",
    "Mochila portatil impermeable",
    "Samsung Galaxy Watch6",
    "Cafetera Nespresso",
]

# ── Palabras que indican que un resultado es un ACCESORIO, no el producto ──────
_ACCESSORY_KEYWORDS = [
    "funda", "case", "cover", "protector", "carcasa", "estuche",
    "vidrio templado", "screen protector", "mica", "film",
    "cable", "cargador", "charger", "adaptador", "hub",
    "correa", "band", "strap", "pulsera",
    "soporte", "holder", "stand", "base",
    "auricular replacement", "almohadilla", "ear pad", "ear tip",
    "stylus", "lápiz", "pen para",
    "teclado para", "keyboard for",
    "mouse pad", "mousepad",
    "mochila para laptop", "sleeve", "bolso para",
]

# Categorías y sus rangos de precio mínimo/máximo esperados en COP
# Sirven para filtrar resultados absurdamente baratos (accesorios) o caros
_PRICE_RANGES = {
    "smartphone":   (800_000,   20_000_000),
    "celular":      (800_000,   20_000_000),
    "laptop":       (1_000_000, 30_000_000),
    "portátil":     (1_000_000, 30_000_000),
    "auriculares":  (50_000,    3_000_000),
    "audífonos":    (50_000,    3_000_000),
    "smartwatch":   (200_000,   5_000_000),
    "tablet":       (400_000,   8_000_000),
    "televisor":    (500_000,   20_000_000),
    "zapatillas":   (100_000,   2_000_000),
    "tenis":        (100_000,   2_000_000),
    "consola":      (500_000,   5_000_000),
    "cámara":       (500_000,   15_000_000),
}


def _norm_text(s: str) -> str:
    n = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^\w\s]", "", n).strip()


def _is_accessory(title: str) -> bool:
    """Devuelve True si el título del resultado parece un accesorio."""
    title_lower = title.lower()
    return any(kw in title_lower for kw in _ACCESSORY_KEYWORDS)


def _price_in_range(price: float, category: str) -> bool:
    """Devuelve True si el precio está en el rango esperado para esa categoría."""
    cat_lower = (category or "").lower()
    for cat_key, (min_p, max_p) in _PRICE_RANGES.items():
        if cat_key in cat_lower:
            return min_p <= price <= max_p
    # Sin categoría definida → aceptar cualquier precio razonable
    return True


def _title_matches_query(title: str, query: str, threshold: float = 0.35) -> bool:
    """
    Verifica que el título del resultado tenga al menos `threshold` de palabras
    clave del query. Evita resultados completamente irrelevantes.
    """
    query_words = set(_norm_text(query).split())
    # Ignorar palabras genéricas que aportan poco
    stop_words = {"de", "para", "con", "the", "and", "or", "el", "la", "los", "las", "un", "una"}
    query_words -= stop_words

    if not query_words:
        return True

    title_norm = _norm_text(title)
    matches = sum(1 for w in query_words if w in title_norm)
    score = matches / len(query_words)

    return score >= threshold


def _filter_results(results, query: str, category: str) -> list:
    """
    Filtra los resultados scrapeados para quedarse solo con los relevantes:
    1. No accesorios
    2. Precio en rango para la categoría
    3. Título con al menos 35% de palabras del query
    """
    filtered = []
    for r in results:
        title = r.title or ""

        if _is_accessory(title):
            logger.debug(f"[Filter] Descartado accesorio: '{title[:60]}'")
            continue

        if not _price_in_range(r.price, category):
            logger.debug(f"[Filter] Precio fuera de rango ({r.price:,.0f} COP) para '{title[:60]}'")
            continue

        if not _title_matches_query(title, query):
            logger.debug(f"[Filter] Título no coincide con query: '{title[:60]}'")
            continue

        filtered.append(r)

    logger.info(f"[Filter] {len(filtered)}/{len(results)} resultados pasaron el filtro para '{query}'")
    return filtered


def run_async(coro):
    """Helper para correr corutinas dentro de tareas Celery (sync)."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()
        asyncio.set_event_loop(None)


def _get_active_scrapers(db):
    """Devuelve solo los scrapers cuya tienda esté activa en la BD."""
    from sqlalchemy import select
    from app.models.product import Store

    active_stores = db.execute(
        select(Store.name).where(Store.is_active == True)
    ).scalars().all()

    import unicodedata as _ud
    def _norm(s):
        return _ud.normalize("NFKD", s).encode("ascii", "ignore").decode().lower().strip()

    active_lower = {_norm(s) for s in active_stores}

    selected = []
    for store_name, ScraperClass in SCRAPER_MAP.items():
        if _norm(store_name) in active_lower:
            selected.append(ScraperClass)

    return selected if selected else list(SCRAPER_MAP.values())


@celery_app.task(bind=True, name="app.workers.tasks.scrape_product")
def scrape_product(self, task_id: str, query: str, search_history_id, category: str = None):
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session
    from app.models.product import SearchHistory, Product, PriceResult, Store, TaskStatus
    from app.core.config import settings
    sync_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql+psycopg2://")
    engine = create_engine(sync_url)

    with Session(engine) as db:
        active_scrapers = _get_active_scrapers(db)

        async def _scrape():
            async def scrape_one(ScraperClass):
                async with ScraperClass() as scraper:
                    return await scraper.safe_search(query)

            results_per_store = await asyncio.gather(
                *[scrape_one(S) for S in active_scrapers],
                return_exceptions=True,
            )

            all_results = []
            for store_results in results_per_store:
                if isinstance(store_results, list):
                    all_results.extend(store_results)
            return all_results

        history = db.get(SearchHistory, search_history_id) if search_history_id else None

        # Intentar obtener la categoría del producto desde el historial si no viene
        # (la vision la guarda en el campo query como parte del search_query)
        effective_category = category or ""

        if history:
            history.status = TaskStatus.processing
            db.commit()

        try:
            all_results = run_async(_scrape())
        except Exception as exc:
            logger.error(f"[Task {task_id}] Error durante scraping: {exc}")
            if history:
                history.status = TaskStatus.error
                history.error_message = str(exc)
                db.commit()
            return

        if not all_results:
            if history:
                history.status = TaskStatus.error
                history.error_message = "No se encontraron resultados"
                db.commit()
            return

        # ── FILTRADO DE RELEVANCIA ─────────────────────────────────────────────
        filtered_results = _filter_results(all_results, query, effective_category)

        # Si el filtro fue demasiado agresivo y eliminó todo, usar resultados sin filtrar
        # pero al menos excluir accesorios obvios
        if not filtered_results:
            logger.warning(f"[Task {task_id}] Filtro eliminó todos los resultados, aplicando filtro mínimo")
            filtered_results = [r for r in all_results if not _is_accessory(r.title or "")]

        # Si aún no hay nada, usar todos (mejor algo que nada)
        if not filtered_results:
            logger.warning(f"[Task {task_id}] Sin resultados relevantes, usando todos")
            filtered_results = all_results
        # ──────────────────────────────────────────────────────────────────────

        normalized = unicodedata.normalize("NFKD", query).lower()
        normalized = re.sub(r"[^\w\s]", "", normalized).strip()

        product = db.execute(
            select(Product).where(Product.normalized_name == normalized)
        ).scalar_one_or_none()

        if not product:
            product = Product(name=query, normalized_name=normalized)
            db.add(product)
            db.flush()
        else:
            from sqlalchemy import delete
            db.execute(delete(PriceResult).where(PriceResult.product_id == product.id))
            db.flush()

        def _norm_store(name):
            n = unicodedata.normalize('NFKD', name).lower()
            return re.sub(r'[^a-z0-9]', '', n)

        # Guardar el mejor resultado por tienda (el más barato ENTRE LOS FILTRADOS)
        best_by_store = {}
        for scraped in filtered_results:
            key = _norm_store(scraped.store_name)
            if key not in best_by_store or scraped.price < best_by_store[key].price:
                best_by_store[key] = scraped

        for scraped in best_by_store.values():
            store = db.execute(
                select(Store).where(Store.name == scraped.store_name)
            ).scalar_one_or_none()
            if not store:
                store = Store(name=scraped.store_name, base_url=scraped.url[:50])
                db.add(store)
                db.flush()

            price_result = PriceResult(
                product_id=product.id,
                store_id=store.id,
                price=scraped.price,
                currency=scraped.currency,
                url=scraped.url,
                title=scraped.title,
                in_stock=scraped.in_stock,
            )
            db.add(price_result)

        if history:
            history.status = TaskStatus.done
            history.product_id = product.id

        db.commit()
        logger.info(f"[Task {task_id}] Completado. {len(best_by_store)} tiendas con precios relevantes.")

        if history:
            from app.core.activity import log_event_sync
            event = "scraping_manual_end" if history.triggered_by_admin else "user_search"
            actor = db.get(__import__('app.models.user', fromlist=['User']).User, history.user_id)
            log_event_sync(
                db,
                event,
                actor_id=history.user_id,
                actor_name=actor.name if actor else None,
                actor_role=str(actor.role) if actor else None,
                query=query,
                task_id=task_id,
            )

    engine.dispose()


@celery_app.task(name="app.workers.tasks.run_daily_scraping")
def run_daily_scraping():
    """
    Scraping diario de todos los productos existentes.
    """
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session
    from app.models.product import Product, SearchHistory, TaskStatus
    from app.models.user import User, UserRole
    from app.core.config import settings
    import uuid

    sync_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql+psycopg2://")
    engine = create_engine(sync_url)

    with Session(engine) as db:
        admin = db.execute(
            select(User).where(User.role == UserRole.admin, User.is_active == True)
        ).scalars().first()

        if not admin:
            logger.warning("[Daily] No hay admin activo para asociar el historial. Abortando.")
            engine.dispose()
            return

        products = db.execute(select(Product)).scalars().all()

        launched = []
        from app.core.activity import log_event_sync
        log_event_sync(
            db,
            "scraping_scheduled_start",
            actor_name="Sistema",
            actor_role="admin",
            detail=f"{len(products)} producto(s) en cola",
        )

        for product in products:
            task_id = str(uuid.uuid4())
            history = SearchHistory(
                user_id=admin.id,
                task_id=task_id,
                query=product.name,
                status=TaskStatus.pending,
                triggered_by_admin=True,
            )
            db.add(history)
            db.flush()
            scrape_product.delay(
                task_id=task_id,
                query=product.name,
                search_history_id=history.id,
            )
            launched.append(product.name)

        db.commit()

    logger.info(f"[Daily] Scraping programado lanzado para {len(launched)} productos: {launched}")

    with Session(engine) as db2:
        from app.core.activity import log_event_sync
        log_event_sync(
            db2,
            "scraping_scheduled_end",
            actor_name="Sistema",
            actor_role="admin",
            detail=f"{len(launched)} producto(s) procesados",
        )

    engine.dispose()
    return {"launched": launched}


@celery_app.task(name="app.workers.tasks.run_startup_demo_scraping")
def run_startup_demo_scraping():
    """
    Se ejecuta una vez al iniciar la app.
    Hace scraping de los productos predeterminados.
    """
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session
    from app.models.product import SearchHistory, TaskStatus, Product
    from app.models.user import User, UserRole
    from app.core.config import settings
    import uuid
    sync_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql+psycopg2://")
    engine = create_engine(sync_url)

    with Session(engine) as db:
        admin = db.execute(
            select(User).where(User.role == UserRole.admin, User.is_active == True)
        ).scalars().first()

        if not admin:
            logger.warning("[Startup] No hay admin activo para asociar los demos.")
            engine.dispose()
            return

        launched = []
        for product_query in DEMO_PRODUCTS:
            task_id = str(uuid.uuid4())
            history = SearchHistory(
                user_id=admin.id,
                task_id=task_id,
                query=product_query,
                status=TaskStatus.pending,
                triggered_by_admin=True,
            )
            db.add(history)
            db.flush()
            scrape_product.delay(task_id=task_id, query=product_query, search_history_id=history.id)
            launched.append(product_query)

        db.commit()

    logger.info(f"[Startup] Demos lanzados: {launched}")
    engine.dispose()
    return {"launched": launched}


@celery_app.task(name="app.workers.tasks.run_manual_scraping")
def run_manual_scraping(query: str = None):
    """
    Scraping manual desde el panel admin.
    """
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session
    from app.models.product import SearchHistory, TaskStatus
    from app.models.user import User, UserRole
    from app.core.config import settings
    import uuid

    if not query or not query.strip():
        logger.warning("[Manual] No se especificó producto a scrapear.")
        return {"status": "error", "message": "Sin query"}

    sync_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql+psycopg2://")
    engine = create_engine(sync_url)

    task_id = str(uuid.uuid4())

    with Session(engine) as db:
        admin = db.execute(
            select(User).where(User.role == UserRole.admin, User.is_active == True)
        ).scalars().first()

        if not admin:
            logger.warning("[Manual] No hay admin activo.")
            engine.dispose()
            return {"task_id": task_id, "query": query, "status": "no_admin"}

        history = SearchHistory(
            user_id=admin.id,
            task_id=task_id,
            query=query,
            status=TaskStatus.pending,
            triggered_by_admin=True,
        )
        db.add(history)
        db.commit()
        db.refresh(history)
        history_id = history.id

    engine.dispose()

    scrape_product.delay(task_id=task_id, query=query, search_history_id=history_id)
    logger.info(f"[Manual] Scraping lanzado para '{query}' (task_id={task_id})")
    return {"task_id": task_id, "query": query}