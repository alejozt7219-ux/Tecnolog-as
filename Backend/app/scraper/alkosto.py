from app.scraper.base import BaseScraper, ScrapedPrice
import logging

logger = logging.getLogger(__name__)


class AlkostoScraper(BaseScraper):
    store_name = "Alkosto"
    base_url = "https://www.alkosto.com"

    async def search(self, query: str) -> list[ScrapedPrice]:
        page = await self.new_page()
        results = []

        try:
            search_url = f"{self.base_url}/search?text={query.replace(' ', '+')}"
            await page.goto(search_url, timeout=self._timeout())
            await page.wait_for_load_state("domcontentloaded")
            # Alkosto carga los productos con JS, esperamos el grid
            await page.wait_for_selector(".product__item", timeout=12000)

            items = await page.query_selector_all(".product__item")

            for item in items[:5]:
                try:
                    title_el = await item.query_selector(".product__information--name")
                    price_el = await item.query_selector(".price")
                    link_el  = await item.query_selector("a.product__item--anchor")

                    if not title_el or not price_el:
                        continue

                    title     = await title_el.inner_text()
                    price_str = (
                        (await price_el.inner_text())
                        .replace("$", "")
                        .replace(".", "")
                        .replace(",", "")
                        .strip()
                    )
                    price = float(price_str)
                    href  = await link_el.get_attribute("href") if link_el else ""
                    url   = f"{self.base_url}{href}" if href.startswith("/") else href

                    results.append(
                        ScrapedPrice(
                            store_name=self.store_name,
                            price=price,
                            currency="COP",
                            url=url,
                            title=title.strip(),
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
