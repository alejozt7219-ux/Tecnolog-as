"""
Alkosto Colombia — scraper Playwright (2025).
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


class AlkostoScraper(BaseScraper):
    store_name = "Alkosto"
    base_url   = "https://www.alkosto.com"

    # Selector real del item (inspeccionado)
    ITEM_SELECTOR  = "li.ais-InfiniteHits-item"

    # Selectores reales (inspeccionados):
    # Título: h3.product__item__top__title
    # Link:   a.product__item__top__link  href="/nombre-producto/p/ID?algEvent=..."
    # Precio: span.price.price--redesign  texto="$284.900"
    TITLE_SELECTOR = "h3.product__item__top__title"
    LINK_SELECTOR  = "a.product__item__top__link"
    PRICE_SELECTOR = "span.price.price--redesign"

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

            # Alkosto carga resultados con Algolia JS — esperar más
            try:
                await page.wait_for_selector(self.ITEM_SELECTOR, timeout=12000)
            except Exception:
                logger.warning(f"[Alkosto] No cargaron items para '{query}'")
                return results

            await page.wait_for_timeout(2000)  # extra por si acaso

            items = await page.query_selector_all(self.ITEM_SELECTOR)
            logger.info(f"[Alkosto] {len(items)} items para '{query}'")

            for item in items[:15]:
                try:
                    # Título
                    title_el = await item.query_selector(self.TITLE_SELECTOR)
                    if not title_el:
                        continue
                    title = (await title_el.inner_text()).strip()
                    if not title:
                        continue

                    # Relevancia
                    if not _is_relevant(title, query):
                        logger.debug(f"[Alkosto] Descartado: '{title}'")
                        continue

                    # Precio
                    price_el = await item.query_selector(self.PRICE_SELECTOR)
                    if not price_el:
                        continue
                    price = _parse_price((await price_el.inner_text()).strip())
                    if not price:
                        continue

                    # URL: a.product__item__top__link href="/nombre/p/ID?algEvent=..."
                    link_el = await item.query_selector(self.LINK_SELECTOR)
                    if not link_el:
                        continue
                    href = await link_el.get_attribute("href") or ""
                    # Limpiar tracking params
                    href = href.split("?")[0]
                    if not href:
                        continue
                    url = f"{self.base_url}{href}" if href.startswith("/") else href

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

        logger.info(f"[Alkosto] {len(results)} resultados para '{query}'")
        return results

    def _timeout(self):
        from app.core.config import settings
        return settings.SCRAPER_TIMEOUT * 1000