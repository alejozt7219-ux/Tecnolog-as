"""
Alkosto Colombia — scraper Playwright con selectores Algolia reales (2025).
Alkosto migró de VTEX a Algolia como motor de búsqueda.
Selectores extraídos del HTML real inspeccionado.
"""
from app.scraper.base import BaseScraper, ScrapedPrice
import logging

logger = logging.getLogger(__name__)


class AlkostoScraper(BaseScraper):
    store_name = "Alkosto"
    base_url   = "https://www.alkosto.com"

    async def search(self, query: str) -> list[ScrapedPrice]:
        page = await self.new_page()
        results = []

        try:
            search_url = f"{self.base_url}/search?text={query.replace(' ', '+')}"
            await page.goto(search_url, timeout=self._timeout())

            # Algolia renderiza con: li.ais-InfiniteHits-item
            try:
                await page.wait_for_selector(
                    "li.ais-InfiniteHits-item",
                    timeout=15000,
                )
            except Exception:
                logger.warning(f"[Alkosto] Timeout esperando productos para '{query}'")
                return results

            items = await page.query_selector_all("li.ais-InfiniteHits-item")

            for item in items[:8]:
                try:
                    # Título
                    title_el = await item.query_selector(
                        "h3.product__item__top__title"
                    )
                    # Precio — span.price.price--redesign (contiene "$1.799.900")
                    price_el = await item.query_selector(
                        "span.price.price--redesign"
                    )
                    # Link
                    link_el = await item.query_selector(
                        "a.product__item__top__link"
                    )

                    if not title_el or not price_el:
                        continue

                    title     = (await title_el.inner_text()).strip()
                    price_raw = (await price_el.inner_text())
                    # Limpiar: "$1.799.900" → 1799900
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
                    url  = f"{self.base_url}{href}" if href and href.startswith("/") else href

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
                    logger.debug(f"[Alkosto] Error parseando item: {e}")
                    continue

        except Exception as e:
            logger.error(f"[Alkosto] Error en búsqueda '{query}': {e}")
        finally:
            await page.close()

        return results

    def _timeout(self):
        from app.core.config import settings
        return settings.SCRAPER_TIMEOUT * 1000