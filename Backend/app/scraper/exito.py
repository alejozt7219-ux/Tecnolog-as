"""
Éxito Colombia — scraper Playwright (2025).
Selectores basados en HTML real inspeccionado.
"""
from app.scraper.base import BaseScraper, ScrapedPrice
import logging, re, unicodedata

logger = logging.getLogger(__name__)


def _normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^\w\s]", "", text).lower()


_STOP_WORDS = {"de", "para", "con", "el", "la", "los", "las", "un", "una", "y", "en"}

_CATEGORY_MARKERS = {
    "zapatillas": ["zapato", "zapatilla", "tenis", "sneaker", "calzado", "shoe"],
    "smartphone": ["celular", "smartphone", "telefono", "movil", "iphone", "galaxy", "pixel"],
    "laptop":     ["laptop", "portatil", "computador", "notebook", "macbook"],
    "freidora":   ["freidora", "air fryer", "freidor"],
    "televisor":  ["televisor", "tv", "smart tv", "pantalla"],
    "tablet":     ["tablet", "ipad"],
    "auriculares":["auricular", "audifonos", "headphone", "earphone", "buds"],
    "cafetera":   ["cafetera", "espresso", "nespresso"],
    "nevera":     ["nevera", "refrigerador", "heladera"],
    "lavadora":   ["lavadora", "secadora"],
}


def _get_category_from_query(query_norm: str) -> str | None:
    for cat, markers in _CATEGORY_MARKERS.items():
        if any(m in query_norm for m in markers):
            return cat
    return None


def _title_in_same_category(title_norm: str, query_cat: str) -> bool:
    if not query_cat:
        return True
    for cat, markers in _CATEGORY_MARKERS.items():
        if cat == query_cat:
            continue
        if any(m in title_norm for m in markers):
            return False
    return True


def _is_relevant(title: str, query: str, min_ratio: float = 0.4) -> bool:
    q_norm = _normalize(query)
    t_norm = _normalize(title)

    query_cat = _get_category_from_query(q_norm)
    if query_cat and not _title_in_same_category(t_norm, query_cat):
        return False

    q_words = [w for w in q_norm.split() if len(w) > 2 and w not in _STOP_WORDS]
    if not q_words:
        return True

    matches = sum(1 for w in q_words if w in t_norm)
    ratio = matches / len(q_words)
    return ratio >= min_ratio


def _parse_price(raw: str) -> float | None:
    only_digits = re.sub(r"[^\d]", "", raw)
    if not only_digits:
        return None
    price = float(only_digits[:9])
    return price if 5_000 <= price <= 80_000_000 else None


class ExitoScraper(BaseScraper):
    store_name = "Éxito"
    base_url = "https://www.exito.com"

    ITEM_SELECTOR  = "article[class*='productCard_productCard']"
    LINK_SELECTOR  = "a[data-testid='product-link']"
    TITLE_SELECTOR = "h3[class*='styles_name']"
    PRICE_SELECTOR = "p[data-fs-container-price-otros='true']"

    async def search(self, query: str) -> list[ScrapedPrice]:
        page = await self.new_page()
        results = []
        search_url = f"{self.base_url}/s?q={query.replace(' ', '+')}&sort=score_desc&page=0"

        try:
            await page.goto(search_url, wait_until="domcontentloaded", timeout=self._timeout())

            try:
                await page.wait_for_selector(self.ITEM_SELECTOR, timeout=12000)
            except Exception:
                logger.warning(f"[Éxito] No cargaron items para '{query}'")
                return results

            await page.wait_for_timeout(2000)

            items = await page.query_selector_all(self.ITEM_SELECTOR)
            logger.info(f"[Éxito] {len(items)} items para '{query}'")

            for item in items[:12]:
                try:
                    link_el = await item.query_selector(self.LINK_SELECTOR)
                    if not link_el:
                        continue
                    href = await link_el.get_attribute("href") or ""
                    if not href:
                        continue
                    url = f"{self.base_url}{href}" if href.startswith("/") else href

                    title_el = await item.query_selector(self.TITLE_SELECTOR)
                    if not title_el:
                        continue
                    title = (await title_el.inner_text()).strip()
                    if not title:
                        continue

                    if not _is_relevant(title, query):
                        logger.debug(f"[Éxito] Descartado: '{title}'")
                        continue

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
                    logger.debug(f"[Éxito] Error parseando item: {e}")
                    continue

        except Exception as e:
            logger.error(f"[Éxito] Error en búsqueda '{query}': {e}")
        finally:
            await page.close()

        logger.info(f"[Éxito] {len(results)} resultados para '{query}'")
        return results

    def _timeout(self):
        from app.core.config import settings
        return settings.SCRAPER_TIMEOUT * 1000