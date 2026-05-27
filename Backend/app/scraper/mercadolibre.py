"""
MercadoLibre Colombia — scraper Playwright con anti-detección (2025).
Clave: deshabilitar navigator.webdriver y usar init_script.
"""
from app.scraper.base import BaseScraper, ScrapedPrice
import logging

logger = logging.getLogger(__name__)


def _clean_meli_url(url: str) -> str:
    if not url:
        return url
    if "#" in url:
        url = url.split("#")[0]
    if "mclics" in url or "click1.mercadolibre" in url:
        url = url.split("?")[0]
    return url[:2000]


class MercadoLibreScraper(BaseScraper):
    store_name = "Mercado Libre"
    base_url   = "https://listado.mercadolibre.com.co"

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
        # Ocultar que es Playwright — clave para evitar el bloqueo de MeLi
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

        try:
            slug = query.lower().replace(" ", "-")
            search_url = f"{self.base_url}/{slug}#D[A:{query.replace(' ', '%20')}]"

            await page.goto(search_url, wait_until="domcontentloaded", timeout=self._timeout())

            try:
                await page.wait_for_selector("li.ui-search-layout__item", timeout=25000)
            except Exception:
                logger.warning(f"[MeLi CO] Sin resultados para '{query}'")
                return results

            items = await page.query_selector_all("li.ui-search-layout__item")
            logger.debug(f"[MeLi CO] {len(items)} items para '{query}'")

            for item in items[:8]:
                try:
                    title_el = (
                        await item.query_selector("a.poly-component__title") or
                        await item.query_selector(".poly-component__title") or
                        await item.query_selector("h2.ui-search-item__title")
                    )
                    price_el = (
                        await item.query_selector(
                            ".poly-price__current .andes-money-amount__fraction"
                        ) or
                        await item.query_selector(
                            ".ui-search-price__second-line .andes-money-amount__fraction"
                        ) or
                        await item.query_selector(".andes-money-amount__fraction") or
                        await item.query_selector(".price-tag-fraction")
                    )

                    if not title_el or not price_el:
                        continue

                    title = (await title_el.inner_text()).strip()
                    price_str = (
                        (await price_el.inner_text())
                        .replace(".", "")
                        .replace(",", "")
                        .strip()
                    )

                    if not price_str.isdigit():
                        continue

                    price = float(price_str)
                    if price < 5_000 or price > 80_000_000:
                        continue

                    raw_url = await title_el.get_attribute("href") or ""
                    if not raw_url:
                        link_el = await item.query_selector("a[href*='mercadolibre']")
                        raw_url = await link_el.get_attribute("href") if link_el else ""

                    url = _clean_meli_url(raw_url)

                    results.append(
                        ScrapedPrice(
                            store_name=self.store_name,
                            price=price,
                            currency="COP",
                            url=url,
                            title=title,
                            in_stock=True,
                        )
                    )
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