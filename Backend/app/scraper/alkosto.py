"""
Alkosto Colombia — scraper Playwright con selectores Algolia reales (2025).
Selectores verificados en HTML real (mayo 2025):
  - Contenedor: li.ais-InfiniteHits-item
  - Título:     h3.product__item__top__title
  - Precio:     span.price.price--redesign
  - Link:       a.product__item__top__link
"""
from app.scraper.base import BaseScraper, ScrapedPrice
import logging
import re
import unicodedata

logger = logging.getLogger(__name__)


def _normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^\w\s]", "", text).lower()


def _is_relevant(title: str, query: str, min_words: int = 2) -> bool:
    q_words = [w for w in _normalize(query).split() if len(w) > 2]
    t_norm  = _normalize(title)
    matches = sum(1 for w in q_words if re.search(r"\b" + w + r"\b", t_norm))
    return matches >= min(min_words, len(q_words))


class AlkostoScraper(BaseScraper):
    store_name = "Alkosto"
    base_url   = "https://www.alkosto.com"

    async def search(self, query: str) -> list[ScrapedPrice]:
        page = await self.new_page()
        results = []

        try:
            search_url = f"{self.base_url}/search?text={query.replace(' ', '+')}"

            await page.set_extra_http_headers({
                "Accept-Language": "es-CO,es;q=0.9",
                "Referer": self.base_url,
            })

            await page.goto(search_url, wait_until="networkidle", timeout=self._timeout())

            try:
                await page.wait_for_selector("li.ais-InfiniteHits-item", timeout=30000)
            except Exception:
                count = await page.locator("li.ais-InfiniteHits-item").count()
                if count == 0:
                    logger.warning(f"[Alkosto] Sin resultados para '{query}'")
                    return results

            items = await page.query_selector_all("li.ais-InfiniteHits-item")
            logger.debug(f"[Alkosto] {len(items)} items encontrados para '{query}'")

            for item in items[:12]:
                try:
                    title_el = await item.query_selector("h3.product__item__top__title")
                    price_el = await item.query_selector("span.price.price--redesign")
                    link_el  = (
                        await item.query_selector("a.product__item__top__link") or
                        await item.query_selector("a[href*='/p/']")
                    )

                    if not title_el or not price_el:
                        continue

                    title     = (await title_el.inner_text()).strip()
                    price_raw = (await price_el.inner_text()).strip()

                    # Filtrar por relevancia — igual que Falabella
                    if not _is_relevant(title, query):
                        logger.debug(f"[Alkosto] Descartado: '{title}' para '{query}'")
                        continue

                    price_str = (
                        price_raw
                        .replace("$", "")
                        .replace(".", "")
                        .replace(",", "")
                        .strip()
                        .split()[0]
                    )

                    if not price_str.isdigit():
                        continue

                    price = float(price_str)
                    if price < 5_000 or price > 80_000_000:
                        continue

                    href = await link_el.get_attribute("href") if link_el else ""
                    if href and "?" in href:
                        href = href.split("?")[0]
                    url = f"{self.base_url}{href}" if href and href.startswith("/") else href

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