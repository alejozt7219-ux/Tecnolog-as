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


class ExitoScraper(BaseScraper):
    store_name = "Éxito"
    base_url = "https://www.exito.com"

    # Selector real del item (inspeccionado):
    # <article class="productCard_productCard__M0677 ...">
    # La clase tiene hash que cambia — usar selector estable
    ITEM_SELECTOR = "article[class*='productCard_productCard']"

    # Selectores reales (inspeccionados):
    # Link:   a[data-testid='product-link']  href="/essenza-mini.../p"
    # Título: h3[class*='styles_name']
    # Precio: p[data-fs-container-price-otros='true']  texto="$ 401.900"
    LINK_SELECTOR  = "a[data-testid='product-link']"
    TITLE_SELECTOR = "h3[class*='styles_name']"
    PRICE_SELECTOR = "p[data-fs-container-price-otros='true']"

    async def search(self, query: str) -> list[ScrapedPrice]:
        page = await self.new_page()
        results = []
        search_url = f"{self.base_url}/s?q={query.replace(' ', '+')}&sort=score_desc&page=0"

        try:
            await page.goto(search_url, wait_until="domcontentloaded", timeout=self._timeout())

            # Éxito es Next.js — esperar items
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
                    # URL: a[data-testid='product-link'] href="/nombre/p"
                    link_el = await item.query_selector(self.LINK_SELECTOR)
                    if not link_el:
                        continue
                    href = await link_el.get_attribute("href") or ""
                    if not href:
                        continue
                    url = f"{self.base_url}{href}" if href.startswith("/") else href

                    # Título
                    title_el = await item.query_selector(self.TITLE_SELECTOR)
                    if not title_el:
                        continue
                    title = (await title_el.inner_text()).strip()
                    if not title:
                        continue

                    if not _is_relevant(title, query):
                        logger.debug(f"[Éxito] Descartado: '{title}'")
                        continue

                    # Precio: p[data-fs-container-price-otros='true'] → "$ 401.900"
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