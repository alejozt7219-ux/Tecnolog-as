"""
MercadoLibre Colombia — scraper Playwright (2025).
Selectores basados en HTML real inspeccionado.
"""
from app.scraper.base import BaseScraper, ScrapedPrice
import logging, re

logger = logging.getLogger(__name__)


def _clean_meli_url(url: str) -> str:
    """Limpia tracking de la URL. MeLi usa # para tracking, no ?"""
    if not url:
        return url
    # Primero limpiar fragment (#polycard_client=... etc)
    if "#" in url:
        url = url.split("#")[0]
    # Luego query params si los hubiera
    if "?" in url:
        url = url.split("?")[0]
    return url[:2000]


def _parse_price(raw: str) -> float | None:
    only_digits = re.sub(r"[^\d]", "", raw)
    if not only_digits:
        return None
    price = float(only_digits[:9])
    return price if 5_000 <= price <= 80_000_000 else None


class MercadoLibreScraper(BaseScraper):
    store_name = "Mercado Libre"
    base_url   = "https://listado.mercadolibre.com.co"

    # Selector real del item (inspeccionado)
    ITEM_SELECTOR = "li.ui-search-layout__item"

    # Selector real del título/link (inspeccionado): a.poly-component__title dentro de h3
    # href = "https://www.mercadolibre.com.co/...p/MCO15262368#..."
    TITLE_SELECTOR  = "h3.poly-component__title-wrapper a.poly-component__title"
    PRICE_SELECTOR  = ".poly-price__current .andes-money-amount__fraction"

    async def new_page(self):
        context = await self.browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 800},
            locale="es-CO",
            timezone_id="America/Bogota",
            extra_http_headers={
                "Accept-Language": "es-CO,es;q=0.9",
                "Referer": "https://www.mercadolibre.com.co/",
            }
        )
        await context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', { get: () => undefined });"
        )
        page = await context.new_page()
        return page

    async def __aenter__(self):
        from playwright.async_api import async_playwright
        self._playwright = await async_playwright().start()
        self.browser = await self._playwright.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-blink-features=AutomationControlled",
                "--disable-dev-shm-usage",
            ],
        )
        return self

    async def search(self, query: str) -> list[ScrapedPrice]:
        page = await self.new_page()
        results = []

        search_url = f"https://www.mercadolibre.com.co/jm/search?as_word={query.replace(' ', '+')}"

        try:
            await page.goto(search_url, wait_until="domcontentloaded", timeout=self._timeout())
            await page.wait_for_timeout(3000)

            # Esperar que carguen los items
            try:
                await page.wait_for_selector(self.ITEM_SELECTOR, timeout=10000)
            except Exception:
                logger.warning(f"[MeLi CO] No cargaron items para '{query}'")
                return results

            items = await page.query_selector_all(self.ITEM_SELECTOR)
            logger.info(f"[MeLi CO] {len(items)} items para '{query}'")

            for item in items[:10]:
                try:
                    # Título y URL vienen del mismo <a>
                    title_el = await item.query_selector(self.TITLE_SELECTOR)
                    if not title_el:
                        continue

                    title = (await title_el.inner_text()).strip()
                    href  = await title_el.get_attribute("href") or ""
                    url   = _clean_meli_url(href)

                    if not title or not url:
                        continue

                    # Precio
                    price_el = await item.query_selector(self.PRICE_SELECTOR)
                    if not price_el:
                        continue
                    price = _parse_price((await price_el.inner_text()).strip())
                    if not price:
                        continue

                    results.append(ScrapedPrice(
                        store_name=self.store_name,
                        price=price,
                        currency="COP",
                        url=url,
                        title=title,
                        in_stock=True,
                    ))

                    if len(results) >= 3:
                        break

                except Exception as e:
                    logger.debug(f"[MeLi CO] Error parseando item: {e}")
                    continue

        except Exception as e:
            logger.error(f"[MeLi CO] Error en búsqueda '{query}': {e}")
        finally:
            await page.close()

        logger.info(f"[MeLi CO] {len(results)} resultados para '{query}'")
        return results

    def _timeout(self):
        from app.core.config import settings
        return settings.SCRAPER_TIMEOUT * 1000