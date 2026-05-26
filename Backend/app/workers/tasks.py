import asyncio
import logging
from app.workers.celery_app import celery_app
from app.scraper.amazon import AmazonScraper
from app.scraper.mercadolibre import MercadoLibreScraper
from app.scraper.falabella import FalabellaScraper
from app.scraper.exito import ExitoScraper

logger = logging.getLogger(__name__)


def run_async(coro):
    """Helper para correr corutinas dentro de tareas Celery (sync)."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()
        asyncio.set_event_loop(None)


@celery_app.task(bind=True, name="app.workers.tasks.scrape_product")
def scrape_product(self, task_id: str, query: str, search_history_id):
    from sqlalchemy import create_engine, select, text
    from sqlalchemy.orm import Session
    from app.models.product import SearchHistory, Product, PriceResult, Store, TaskStatus
    from app.core.config import settings
    import unicodedata
    import re

    # Usar URL síncrona (psycopg2) en vez de asyncpg
    sync_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql+psycopg2://")
    engine = create_engine(sync_url)

    async def _scrape():
        scrapers = [AmazonScraper, MercadoLibreScraper, FalabellaScraper, ExitoScraper]
        all_results = []

        async def scrape_one(ScraperClass):
            async with ScraperClass() as scraper:
                return await scraper.safe_search(query)

        results_per_store = await asyncio.gather(
            *[scrape_one(S) for S in scrapers],
            return_exceptions=True,
        )

        for store_results in results_per_store:
            if isinstance(store_results, list):
                all_results.extend(store_results)

        return all_results

    # Correr el scraping async
    all_results = run_async(_scrape())

    # Guardar en DB de forma síncrona
    with Session(engine) as db:
        history = None
        if search_history_id:
            history = db.get(SearchHistory, search_history_id)

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

        for scraped in all_results:
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