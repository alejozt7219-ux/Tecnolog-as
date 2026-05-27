import asyncio
import logging
import random
from app.workers.celery_app import celery_app
from app.scraper.amazon import AmazonScraper
from app.scraper.mercadolibre import MercadoLibreScraper
from app.scraper.falabella import FalabellaScraper
from app.scraper.exito import ExitoScraper
from app.scraper.alkosto import AlkostoScraper

logger = logging.getLogger(__name__)

# Scrapers disponibles con su nombre de tienda para matchear con la BD
SCRAPER_MAP = {
    "Amazon":        AmazonScraper,
    "Mercado Libre": MercadoLibreScraper,
    "Falabella":     FalabellaScraper,
    "Éxito":         ExitoScraper,
    "Alkosto":       AlkostoScraper,
}

# Productos de demo para scraping manual desde el panel admin
DEMO_PRODUCTS = [
    "Nike Air Max",
    "Auriculares Sony WH-CH520",
    "Mochila portatil impermeable",
    "Smartwatch Samsung Galaxy Watch",
    "Cafetera Nespresso",
]


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

    # Normalizar nombres para comparar (ignorar mayúsculas/tildes)
    import unicodedata as _ud
    def _norm(s):
        return _ud.normalize("NFKD", s).encode("ascii", "ignore").decode().lower().strip()

    active_lower = {_norm(s) for s in active_stores}

    selected = []
    for store_name, ScraperClass in SCRAPER_MAP.items():
        if _norm(store_name) in active_lower:
            selected.append(ScraperClass)

    # Si no hay ninguna tienda en la BD todavía, usar todas (modo inicial)
    return selected if selected else list(SCRAPER_MAP.values())


@celery_app.task(bind=True, name="app.workers.tasks.scrape_product")
def scrape_product(self, task_id: str, query: str, search_history_id):
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session
    from app.models.product import SearchHistory, Product, PriceResult, Store, TaskStatus
    from app.core.config import settings
    import unicodedata
    import re

    sync_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql+psycopg2://")
    engine = create_engine(sync_url)

    with Session(engine) as db:
        # Obtener solo scrapers de tiendas activas
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

        all_results = run_async(_scrape())

        history = db.get(SearchHistory, search_history_id) if search_history_id else None

        if not all_results:
            if history:
                history.status = TaskStatus.error
                history.error_message = "No se encontraron resultados"
                db.commit()
            engine.dispose()
            return

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
            # Limpiar precios anteriores para evitar acumulación
            from sqlalchemy import delete
            db.execute(delete(PriceResult).where(PriceResult.product_id == product.id))
            db.flush()

        # Deduplicar: quedarse con el precio más bajo por tienda
        # Normalizar nombre de tienda para agrupar variantes (e.g. 'Mercado Libre' == 'MercadoLibre')
        import re as _re
        def _norm_store(name):
            n = unicodedata.normalize('NFKD', name).lower()
            return _re.sub(r'[^a-z0-9]', '', n)

        best_by_store = {}
        for scraped in all_results:
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
        logger.info(f"[Task {task_id}] Completado. {len(all_results)} precios guardados.")

    engine.dispose()


@celery_app.task(name="app.workers.tasks.run_daily_scraping")
def run_daily_scraping():
    """Scraping diario de todos los productos existentes, respetando tiendas activas."""
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session
    from app.models.product import Product
    from app.core.config import settings

    sync_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql+psycopg2://")
    engine = create_engine(sync_url)

    with Session(engine) as db:
        products = db.execute(select(Product)).scalars().all()

    for product in products:
        scrape_product.delay(
            task_id=f"daily-{product.id}",
            query=product.normalized_name,
            search_history_id=None,
        )
    logger.info(f"[Daily] Scraping lanzado para {len(products)} productos.")
    engine.dispose()


@celery_app.task(name="app.workers.tasks.run_manual_scraping")
def run_manual_scraping():
    """
    Scraping manual desde el panel admin.
    Elige un producto aleatorio de DEMO_PRODUCTS, lo scrapea en tiendas activas
    y lo guarda en el historial de un usuario admin para que aparezca en el dashboard.
    """
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session
    from app.models.product import SearchHistory, TaskStatus
    from app.models.user import User, UserRole
    from app.core.config import settings
    import uuid

    sync_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql+psycopg2://")
    engine = create_engine(sync_url)

    query = random.choice(DEMO_PRODUCTS)
    task_id = str(uuid.uuid4())

    with Session(engine) as db:
        # Asociar al primer admin disponible para que aparezca en su historial
        admin = db.execute(
            select(User).where(User.role == UserRole.admin, User.is_active == True)
        ).scalar_one_or_none()

        if not admin:
            logger.warning("[Manual] No hay admin activo para asociar el scraping.")
            engine.dispose()
            return {"task_id": task_id, "query": query, "status": "no_admin"}

        history = SearchHistory(
            user_id=admin.id,
            task_id=task_id,
            query=query,
            status=TaskStatus.pending,
        )
        db.add(history)
        db.commit()
        db.refresh(history)
        history_id = history.id

    engine.dispose()

    # Lanzar el scraping real
    scrape_product.delay(task_id=task_id, query=query, search_history_id=history_id)
    logger.info(f"[Manual] Scraping lanzado para '{query}' (task_id={task_id})")
    return {"task_id": task_id, "query": query}