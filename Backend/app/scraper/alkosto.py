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

            # Alkosto tiene varios layouts posibles — esperar cualquiera
            try:
                await page.wait_for_selector(
                    "article.product__item, li.product-item, [class*='product-card'], "
                    "div[data-testid='product'], .product__list__item",
                    timeout=15000,
                )
            except Exception:
                logger.warning(f"[Alkosto] Timeout esperando productos para '{query}'")
                return results

            # Probar múltiples selectores de contenedor
            items = (
                await page.query_selector_all("article.product__item") or
                await page.query_selector_all("li.product-item") or
                await page.query_selector_all("[class*='ProductCard']") or
                await page.query_selector_all(".product__list__item")
            )

            for item in items[:8]:
                try:
                    # Título — múltiples selectores
                    title_el = (
                        await item.query_selector("h3.product__item__top__title") or
                        await item.query_selector("h2.product__item__top__title") or
                        await item.query_selector("[class*='product__title']") or
                        await item.query_selector("[class*='ProductTitle']") or
                        await item.query_selector("h3") or
                        await item.query_selector("h2")
                    )

                    # Precio — múltiples selectores
                    price_el = (
                        await item.query_selector("strong.product__item__top__price--special") or
                        await item.query_selector("span.js-price-selector") or
                        await item.query_selector("[class*='price--special']") or
                        await item.query_selector("[class*='ProductPrice']") or
                        await item.query_selector("[data-testid='price']") or
                        await item.query_selector("strong[class*='price']") or
                        await item.query_selector("span[class*='price']")
                    )

                    # Link
                    link_el = (
                        await item.query_selector("a.product__item__top__title--link") or
                        await item.query_selector("a[href*='/p/']") or
                        await item.query_selector("a")
                    )

                    if not title_el or not price_el:
                        continue

                    title = (await title_el.inner_text()).strip()
                    price_raw = await price_el.inner_text()
                    price_str = (
                        price_raw
                        .replace("$", "")
                        .replace(".", "")
                        .replace(",", "")
                        .strip()
                        .split()[0]  # tomar solo el primer número
                    )

                    if not price_str.isdigit():
                        continue

                    price = float(price_str)
                    if price <= 0:
                        continue

                    href = await link_el.get_attribute("href") if link_el else ""
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
