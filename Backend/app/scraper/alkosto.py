"""
Alkosto Colombia — scraper Playwright robusto (2025).
Fix principal: extraer URL del producto específico, no la URL de búsqueda.
"""
from app.scraper.base import BaseScraper, ScrapedPrice
import logging, re, unicodedata

logger = logging.getLogger(__name__)


def _normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^\w\s]", "", text).lower()


def _is_relevant(title: str, query: str, min_words: int = 1) -> bool:
    q_words = [w for w in _normalize(query).split() if len(w) > 2]
    if not q_words:
        return True
    t_norm = _normalize(title)
    matches = sum(1 for w in q_words if w in t_norm)
    return matches >= min(min_words, len(q_words))


def _parse_price(raw: str) -> float | None:
    only_digits = re.sub(r"[^\d]", "", raw)
    if not only_digits:
        return None
    price = float(only_digits[:9])
    return price if 5_000 <= price <= 80_000_000 else None


class AlkostoScraper(BaseScraper):
    store_name = "Alkosto"
    base_url   = "https://www.alkosto.com"

    TITLE_SELECTORS = [
        "h3.product__item__top__title",
        ".product__item__top__title",
        "[class*='product__item'] h3",
        "[class*='product-name']",
        "h3",
    ]
    PRICE_SELECTORS = [
        "span.price.price--redesign",
        "span.price",
        "[class*='price--redesign']",
        "[class*='price']",
    ]
    ITEM_SELECTORS = [
        "li.ais-InfiniteHits-item",
        "li[class*='ais-InfiniteHits']",
        "[class*='product__item']",
        "article[class*='product']",
        "div[class*='product-card']",
    ]
    # Links de producto en Alkosto: solo selectores específicos, sin "a" genérico
    LINK_SELECTORS = [
        "a.product__item__top__link",
        "a[href*='/p/']",          # URL de producto Alkosto: /p/XXXXXX
    ]

    async def search(self, query: str) -> list[ScrapedPrice]:
        page = await self.new_page()
        results = []
        search_url = f"{self.base_url}/search?text={query.replace(' ', '+')}"

        try:
            await page.set_extra_http_headers({
                "Accept-Language": "es-CO,es;q=0.9",
                "Referer": self.base_url,
            })
            await page.goto(search_url, wait_until="domcontentloaded", timeout=self._timeout())
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
                logger.warning(f"[Alkosto] No se encontraron items para '{query}'")
                return results

            items = await page.query_selector_all(item_sel)
            logger.info(f"[Alkosto] {len(items)} items para '{query}' (selector: {item_sel})")

            for item in items[:15]:
                try:
                    # --- TÍTULO ---
                    title = None
                    for sel in self.TITLE_SELECTORS:
                        el = await item.query_selector(sel)
                        if el:
                            title = (await el.inner_text()).strip()
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

                    if not _is_relevant(title, query):
                        logger.debug(f"[Alkosto] Descartado: '{title}'")
                        continue

                    # --- URL DEL PRODUCTO ESPECÍFICO ---
                    url = ""
                    for sel in self.LINK_SELECTORS:
                        link_el = await item.query_selector(sel)
                        if link_el:
                            href = await link_el.get_attribute("href") or ""
                            if href:
                                # Limpiar parámetros de tracking
                                if "?" in href:
                                    href = href.split("?")[0]
                                # Construir URL completa
                                if href.startswith("/"):
                                    url = f"{self.base_url}{href}"
                                elif href.startswith("http"):
                                    url = href
                                # Aceptar solo URLs reales de producto (/p/)
                                if "/p/" in url:
                                    break

                    if not url:
                        logger.debug(f"[Alkosto] Sin URL de producto para '{title}', saltando")
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
                    logger.debug(f"[Alkosto] Error parseando item: {e}")
                    continue

        except Exception as e:
            logger.error(f"[Alkosto] Error en búsqueda '{query}': {e}")
        finally:
            await page.close()

        logger.info(f"[Alkosto] {len(results)} resultados finales para '{query}'")
        return results

    def _timeout(self):
        from app.core.config import settings
        return settings.SCRAPER_TIMEOUT * 1000