from app.scraper.base import BaseScraper, ScrapedPrice
import logging

logger = logging.getLogger(__name__)


class MercadoLibreScraper(BaseScraper):
    store_name = "Mercado Libre"
    base_url = "https://listado.mercadolibre.com.mx"

    async def search(self, query: str) -> list[ScrapedPrice]:
        page = await self.new_page()
        results = []

        try:
            search_url = f"{self.base_url}/{query.replace(' ', '-')}"
            await page.goto(search_url, timeout=self._timeout())
            await page.wait_for_selector(".ui-search-results", timeout=10000)

            items = await page.query_selector_all(".ui-search-result__wrapper")

            for item in items[:5]:
                try:
                    title_el = await item.query_selector(".ui-search-item__title")
                    price_el = await item.query_selector(".andes-money-amount__fraction")
                    link_el = await item.query_selector("a.ui-search-result__content")

                    if not title_el or not price_el:
                        continue

                    title = await title_el.inner_text()
                    price_str = (await price_el.inner_text()).replace(".", "").replace(",", ".")
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
                    logger.debug(f"[MeLi] Error parseando item: {e}")
                    continue

        except Exception as e:
            logger.error(f"[MeLi] Error en búsqueda '{query}': {e}")
        finally:
            await page.close()

        return results

    def _timeout(self):
        from app.core.config import settings
        return settings.SCRAPER_TIMEOUT * 1000
