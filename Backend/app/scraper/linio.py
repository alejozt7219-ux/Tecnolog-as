from app.scraper.base import BaseScraper, ScrapedPrice
import logging

logger = logging.getLogger(__name__)


class LinioScraper(BaseScraper):
    store_name = "Linio"
    base_url = "https://www.linio.com.mx"

    async def search(self, query: str) -> list[ScrapedPrice]:
        page = await self.new_page()
        results = []

        try:
            search_url = f"{self.base_url}/search?q={query.replace(' ', '+')}"
            await page.goto(search_url, timeout=self._timeout())
            await page.wait_for_load_state("networkidle", timeout=15000)

            items = await page.query_selector_all(".catalogue-product")

            for item in items[:5]:
                try:
                    title_el = await item.query_selector(".product-title")
                    price_el = await item.query_selector(".price-main")
                    link_el = await item.query_selector("a.catalogue-product-link")

                    if not title_el or not price_el:
                        continue

                    title = await title_el.inner_text()
                    price_str = (
                        (await price_el.inner_text())
                        .replace("$", "")
                        .replace(",", "")
                        .strip()
                    )
                    price = float(price_str)
                    url = await link_el.get_attribute("href") if link_el else ""

                    results.append(
                        ScrapedPrice(
                            store_name=self.store_name,
                            price=price,
                            currency="MXN",
                            url=url,
                            title=title.strip(),
                            in_stock=True,
                        )
                    )
                except Exception as e:
                    logger.debug(f"[Linio] Error parseando item: {e}")
                    continue

        except Exception as e:
            logger.error(f"[Linio] Error en búsqueda '{query}': {e}")
        finally:
            await page.close()

        return results

    def _timeout(self):
        from app.core.config import settings
        return settings.SCRAPER_TIMEOUT * 1000
