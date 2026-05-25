import asyncio
import logging
from celery import group
from app.workers.celery_app import celery_app
from app.scraper.amazon import AmazonScraper
from app.scraper.mercadolibre import MercadoLibreScraper
from app.scraper.linio import LinioScraper

logger = logging.getLogger(__name__)


def run_async(coro):
    """Helper para correr corutinas dentro de tareas Celery (sync)."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(bind=True, name="app.workers.tasks.scrape_product")
def scrape_product(self, task_id: str, query: str, search_history_id: int):
    """
    Tarea principal: corre todos los scrapers en paralelo y guarda resultados en DB.
    """
    from app.core.database import AsyncSessionLocal
    from app.models.product import SearchHistory, Product, PriceResult, Store, TaskStatus
    from sqlalchemy import select
    import unicodedata
    import re

    async def _run():
        scrapers = [AmazonScraper, MercadoLibreScraper, LinioScraper]
        all_results = []

        # Corre scrapers concurrentemente
        async def scrape_one(ScraperClass):
            async with ScraperClass() as scraper:
                return await scraper.safe_search(query)

        import asyncio
        results_per_store = await asyncio.gather(
            *[scrape_one(S) for S in scrapers],
            return_exceptions=True,
        )

        for store_results in results_per_store:
            if isinstance(store_results, list):
                all_results.extend(store_results)

        async with AsyncSessionLocal() as db:
            # Actualiza el estado de la búsqueda
            history = await db.get(SearchHistory, search_history_id)
            if not history:
                return

            if not all_results:
                history.status = TaskStatus.error
                history.error_message = "No se encontraron resultados"
                await db.commit()
                return

            # Crea o actualiza el producto
            normalized = unicodedata.normalize("NFKD", query).lower()
            normalized = re.sub(r"[^\w\s]", "", normalized).strip()

            result_stmt = await db.execute(
                select(Product).where(Product.normalized_name == normalized)
            )
            product = result_stmt.scalar_one_or_none()

            if not product:
                product = Product(name=query, normalized_name=normalized)
                db.add(product)
                await db.flush()

            # Guarda los precios
            for scraped in all_results:
                store_stmt = await db.execute(
                    select(Store).where(Store.name == scraped.store_name)
                )
                store = store_stmt.scalar_one_or_none()
                if not store:
                    store = Store(name=scraped.store_name, base_url=scraped.url[:50])
                    db.add(store)
                    await db.flush()

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

            history.status = TaskStatus.done
            history.product_id = product.id
            await db.commit()
            logger.info(f"[Task {task_id}] Completado. {len(all_results)} precios guardados.")

    run_async(_run())


@celery_app.task(name="app.workers.tasks.run_daily_scraping")
def run_daily_scraping():
    """Tarea programada: dispara scraping de todos los productos conocidos."""
    from app.core.database import AsyncSessionLocal
    from app.models.product import Product
    from sqlalchemy import select

    async def _run():
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Product))
            products = result.scalars().all()

        for product in products:
            scrape_product.delay(
                task_id=f"daily-{product.id}",
                query=product.normalized_name,
                search_history_id=0,
            )
        logger.info(f"[Daily] Scraping lanzado para {len(products)} productos.")

    run_async(_run())
