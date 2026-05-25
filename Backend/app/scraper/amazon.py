from app.scraper.base import BaseScraper, ScrapedPrice
import logging

logger = logging.getLogger(__name__)


class AmazonScraper(BaseScraper):
    store_name = "Amazon"
    base_url = "https://www.amazon.com"

    async def search(self, query: str) -> list[ScrapedPrice]:
        page = await self.new_page()
        results = []

        try:
            search_url = f"{self.base_url}/s?k={query.replace(' ', '+')}"
            await page.goto(search_url, timeout=self._timeout())
            await page.wait_for_load_state("domcontentloaded")

            items = await page.query_selector_all(
                "[data-component-type='s-search-result']"
            )

            for item in items[:5]:
                try:
                    title_el      = await item.query_selector("h2 a span")
                    price_whole   = await item.query_selector(".a-price-whole")
                    price_fraction = await item.query_selector(".a-price-fraction")
                    link_el       = await item.query_selector("h2 a")

                    if not title_el or not price_whole:
                        continue

                    title    = await title_el.inner_text()
                    whole    = (await price_whole.inner_text()).replace(",", "").replace(".", "")
                    fraction = await price_fraction.inner_text() if price_fraction else "00"
                    price    = float(f"{whole}.{fraction}")

                    href = await link_el.get_attribute("href") if link_el else ""
                    url  = f"{self.base_url}{href}" if href.startswith("/") else href

                    results.append(
                        ScrapedPrice(
                            store_name=self.store_name,
                            price=price,
                            currency="USD",
                            url=url,
                            title=title.strip(),
                            in_stock=True,
                        )
                    )
                except Exception as e:
                    logger.debug(f"[Amazon] Error parseando item: {e}")
                    continue

        except Exception as e:
            logger.error(f"[Amazon] Error en búsqueda '{query}': {e}")
        finally:
            await page.close()

        return results

    def _timeout(self):
        from app.core.config import settings
        return settings.SCRAPER_TIMEOUT * 1000
