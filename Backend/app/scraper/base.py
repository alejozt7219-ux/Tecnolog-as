from abc import ABC, abstractmethod
from dataclasses import dataclass
from playwright.async_api import async_playwright, Browser, Page
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)


@dataclass
class ScrapedPrice:
    store_name: str
    price: float
    currency: str
    url: str
    title: str
    in_stock: bool


class BaseScraper(ABC):
    store_name: str
    base_url: str

    def __init__(self):
        self.browser: Browser | None = None

    async def __aenter__(self):
        self._playwright = await async_playwright().start()
        self.browser = await self._playwright.chromium.launch(
            headless=settings.HEADLESS,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        return self

    async def __aexit__(self, *args):
        if self.browser:
            await self.browser.close()
        await self._playwright.stop()

    async def new_page(self) -> Page:
        context = await self.browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 800},
            locale="es-MX",
        )
        page = await context.new_page()
        # Bloquea recursos innecesarios para ir más rápido
        await page.route(
            "**/*.{png,jpg,jpeg,gif,svg,woff,woff2}",
            lambda route: route.abort(),
        )
        return page

    @abstractmethod
    async def search(self, query: str) -> list[ScrapedPrice]:
        """Busca el producto y regresa lista de resultados."""
        pass

    async def safe_search(self, query: str) -> list[ScrapedPrice]:
        """Wrapper con reintentos y manejo de errores."""
        for attempt in range(settings.SCRAPER_MAX_RETRIES):
            try:
                return await self.search(query)
            except Exception as e:
                logger.warning(f"[{self.store_name}] Intento {attempt+1} fallido: {e}")
                if attempt == settings.SCRAPER_MAX_RETRIES - 1:
                    logger.error(f"[{self.store_name}] Todos los intentos fallaron para: {query}")
                    return []
        return []
