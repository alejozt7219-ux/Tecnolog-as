from app.scraper.base import BaseScraper, ScrapedPrice
import logging

logger = logging.getLogger(__name__)


class ExitoScraper(BaseScraper):
    store_name = "Éxito"
    base_url = "https://www.exito.com"

    async def search(self, query: str) -> list[ScrapedPrice]:
        page = await self.new_page()
        results = []

        try:
            search_url = f"{self.base_url}/{query.replace(' ', '-')}/s"
            await page.goto(search_url, timeout=self._timeout())
            await page.wait_for_load_state("domcontentloaded")
            await page.wait_for_selector("[data-testid='store-product-card']", timeout=12000)

            items = await page.query_selector_all("[data-testid='store-product-card']")

            for item in items[:5]:
                try:
                    title_el = await item.query_selector("[data-testid='product-title']")
                    # Éxito muestra el precio en un span con clase de cantidad
                    price_el = await item.query_selector(".ProductPrice_container__price__XmMWM")
                    if not price_el:
                        price_el = await item.query_selector("[class*='ProductPrice']")
                    link_el  = await item.query_selector("a")

                    if not title_el or not price_el:
                        continue

                    title     = await title_el.inner_text()
                    price_str = (
                        (await price_el.inner_text())
                        .replace("$", "")
                        .replace(".", "")
                        .replace(",", "")
                        .strip()
                        .split("\n")[0]  # tomar solo la primera línea por si hay precio tachado
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
                    logger.debug(f"[Éxito] Error parseando item: {e}")
                    continue

        except Exception as e:
            logger.error(f"[Éxito] Error en búsqueda '{query}': {e}")
        finally:
            await page.close()

        return results

    def _timeout(self):
        from app.core.config import settings
        return settings.SCRAPER_TIMEOUT * 1000
