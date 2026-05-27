"""
MercadoLibre Colombia — scraper Playwright robusto (2025).
Fix principal: extraer URL del producto específico, no la URL de búsqueda.
"""
from app.scraper.base import BaseScraper, ScrapedPrice
import logging, re

logger = logging.getLogger(__name__)


def _clean_meli_url(url: str) -> str:
    if not url:
        return url
    if "#" in url:
        url = url.split("#")[0]
    if "mclics" in url or "click1.mercadolibre" in url:
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

    ITEM_SELECTORS = [
        "li.ui-search-layout__item",
        "li[class*='ui-search-layout__item']",
        "[class*='ui-search-layout__item']",
        "div[class*='poly-card']",
        "li[class*='results-item']",
    ]
    TITLE_SELECTORS = [
        "a.poly-component__title",
        ".poly-component__title",
        "h2.ui-search-item__title",
        "[class*='ui-search-item__title']",
        "h2[class*='title']",
        "h3",
    ]
    PRICE_SELECTORS = [
        ".poly-price__current .andes-money-amount__fraction",
        ".ui-search-price__second-line .andes-money-amount__fraction",
        ".andes-money-amount__fraction",
        ".price-tag-fraction",
        "[class*='amount__fraction']",
    ]
    # Selectores de link del PRODUCTO (no de búsqueda)
    # MeLi siempre tiene un <a> con href que contiene el ID del producto (MCO-XXXXX)
    LINK_SELECTORS = [
        "a.poly-component__title",          # el título mismo es el link
        "a[href*='mercadolibre.com.co/']",  # cualquier link a MeLi CO
        "a[href*='-MCO-']",                  # link con ID de producto
        "a[href*='/p/MCO']",                 # link de producto agregado
        "a.ui-search-item__group__element",
        "a[class*='result-image__link']",
        "a",                                 # último recurso: primer <a>
    ]

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

        # Construir URLs de búsqueda
        search_url_main = f"https://www.mercadolibre.com.co/jm/search?as_word={query.replace(' ', '+')}"
        search_url_list = f"{self.base_url}/{query.lower().replace(' ', '-')}"

        try:
            await page.goto(search_url_main, wait_until="domcontentloaded", timeout=self._timeout())
            await page.wait_for_timeout(3000)

            # Encontrar selector de items
            item_sel = None
            for sel in self.ITEM_SELECTORS:
                try:
                    count = await page.locator(sel).count()
                    if count > 0:
                        item_sel = sel
                        break
                except Exception:
                    continue

            if not item_sel:
                # Fallback a URL de listado
                await page.goto(search_url_list, wait_until="domcontentloaded", timeout=self._timeout())
                await page.wait_for_timeout(3000)
                for sel in self.ITEM_SELECTORS:
                    try:
                        count = await page.locator(sel).count()
                        if count > 0:
                            item_sel = sel
                            break
                    except Exception:
                        continue

            if not item_sel:
                logger.warning(f"[MeLi CO] No se encontraron items para '{query}'")
                return results

            items = await page.query_selector_all(item_sel)
            logger.info(f"[MeLi CO] {len(items)} items para '{query}' (selector: {item_sel})")

            for item in items[:10]:
                try:
                    # --- TÍTULO ---
                    title = None
                    title_el = None
                    for sel in self.TITLE_SELECTORS:
                        title_el = await item.query_selector(sel)
                        if title_el:
                            title = (await title_el.inner_text()).strip()
                            if title:
                                break

                    # --- PRECIO ---
                    price = None
                    for sel in self.PRICE_SELECTORS:
                        el = await item.query_selector(sel)
                        if el:
                            raw = (await el.inner_text()).strip()
                            price = _parse_price(raw)
                            if price:
                                break

                    if not title or not price:
                        continue

                    # --- URL DEL PRODUCTO ESPECÍFICO ---
                    # Prioridad: título que sea link → links con MCO en URL → primer link
                    url = ""
                    for sel in self.LINK_SELECTORS:
                        link_el = await item.query_selector(sel)
                        if link_el:
                            href = await link_el.get_attribute("href") or ""
                            href = _clean_meli_url(href)
                            # Aceptar SOLO URLs con ID de producto MeLi Colombia
                            if href and ("-MCO-" in href or "/p/MCO" in href):
                                url = href
                                break

                    if not url:
                        logger.debug(f"[MeLi CO] Sin URL de producto para '{title}', saltando")
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