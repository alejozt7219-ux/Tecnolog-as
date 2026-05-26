from app.scraper.base import BaseScraper, ScrapedPrice
import logging

logger = logging.getLogger(__name__)


class FalabellaScraper(BaseScraper):
    store_name = "Falabella"
    base_url = "https://www.falabella.com.co"

    async def search(self, query: str) -> list[ScrapedPrice]:
        page = await self.new_page()
        results = []

        try:
            search_url = f"{self.base_url}/falabella-co/search?Ntt={query.replace(' ', '+')}"
            await page.goto(search_url, timeout=self._timeout())
            await page.wait_for_selector("a.pod-link", timeout=12000)

            items = await page.query_selector_all("a.pod-link")

            for item in items[:5]:
                try:
                    title_el = await item.query_selector("b.pod-subTitle")
                    price_el = await item.query_selector("li.prices-0 span")

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
                    url   = await item.get_attribute("href") or ""
                    if url.startswith("/"):
                        url = f"{self.base_url}{url}"

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
                    logger.debug(f"[Falabella] Error parseando item: {e}")
                    continue

        except Exception as e:
            logger.error(f"[Falabella] Error en búsqueda '{query}': {e}")
        finally:
            await page.close()

        return results

    def _timeout(self):
        from app.core.config import settings
        return settings.SCRAPER_TIMEOUT * 1000