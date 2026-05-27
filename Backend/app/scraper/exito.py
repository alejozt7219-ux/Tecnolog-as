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
            search_url = f"{self.base_url}/s?q={query.replace(' ', '+')}&sort=score_desc&page=0"
            await page.goto(search_url, timeout=self._timeout())

            # Esperar alguno de los contenedores de producto conocidos
            try:
                await page.wait_for_selector(
                    "[data-testid='product-card'], article[class*='productCard'], div[class*='ProductCard']",
                    timeout=12000
                )
            except Exception:
                return results

            # Selectores de contenedor más amplios
            items = (
                await page.query_selector_all("[data-testid='product-card']") or
                await page.query_selector_all("article[class*='productCard']") or
                await page.query_selector_all("div[class*='product-card']")
            )

            for item in items[:5]:
                try:
                    # Título
                    title_el = (
                        await item.query_selector("h3[class*='styles_name']") or
                        await item.query_selector("p[class*='styles_name']") or
                        await item.query_selector("[data-testid='product-name']") or
                        await item.query_selector("h3")
                    )
                    # Precio
                    price_el = (
                        await item.query_selector("p[class*='ProductPrice_container__price']") or
                        await item.query_selector("[data-testid='product-price']") or
                        await item.query_selector("p[class*='price']") or
                        await item.query_selector("span[class*='price']")
                    )
                    # Link
                    link_el = (
                        await item.query_selector("a[data-testid='product-link']") or
                        await item.query_selector("a[href*='/p/']") or
                        await item.query_selector("a")
                    )

                    if not title_el or not price_el:
                        continue

                    title     = await title_el.inner_text()
                    price_raw = await price_el.inner_text()
                    price_str = (
                        price_raw
                        .replace("$", "")
                        .replace(".", "")
                        .replace(",", "")
                        .strip()
                        .split()[0]   # tomar solo el primer número si hay varios
                    )
                    if not price_str.isdigit():
                        continue
                    price = float(price_str)
                    href  = await link_el.get_attribute("href") if link_el else ""
                    url   = f"{self.base_url}{href}" if href and href.startswith("/") else href

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