from app.scraper.base import BaseScraper, ScrapedPrice
import logging

logger = logging.getLogger(__name__)


class MercadoLibreScraper(BaseScraper):
    store_name = "Mercado Libre"
    base_url = "https://listado.mercadolibre.com.co"

    async def search(self, query: str) -> list[ScrapedPrice]:
        page = await self.new_page()
        results = []

        try:
            search_url = f"{self.base_url}/{query.replace(' ', '-')}"
            await page.goto(search_url, timeout=self._timeout())

            # Esperar cualquiera de los dos layouts posibles
            try:
                await page.wait_for_selector(
                    "li.ui-search-layout__item, .ui-search-results",
                    timeout=12000
                )
            except Exception:
                return results

            items = await page.query_selector_all("li.ui-search-layout__item")

            for item in items[:5]:
                try:
                    # Título — varios selectores posibles
                    title_el = (
                        await item.query_selector("a.poly-component__title") or
                        await item.query_selector(".ui-search-item__title") or
                        await item.query_selector("h2.ui-search-item__title")
                    )
                    # Precio fracción (miles) — selector principal y fallbacks
                    price_el = (
                        await item.query_selector(".poly-price__current .andes-money-amount__fraction") or
                        await item.query_selector(".andes-money-amount__fraction") or
                        await item.query_selector(".price-tag-fraction")
                    )
                    link_el = (
                        await item.query_selector("a.poly-component__title") or
                        await item.query_selector("a.ui-search-link") or
                        await item.query_selector("a.ui-search-item__group__element")
                    )

                    if not title_el or not price_el:
                        continue

                    title     = await title_el.inner_text()
                    price_str = (
                        (await price_el.inner_text())
                        .replace(".", "")
                        .replace(",", "")
                        .strip()
                    )
                    if not price_str.isdigit():
                        continue
                    price = float(price_str)
                    url   = await link_el.get_attribute("href") if link_el else ""
                    # Limpiar parámetros de tracking de MeLi
                    if url and "#" in url:
                        url = url.split("#")[0]

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
                    logger.debug(f"[MeLi CO] Error parseando item: {e}")
                    continue

        except Exception as e:
            logger.error(f"[MeLi CO] Error en búsqueda '{query}': {e}")
        finally:
            await page.close()

        return results

    def _timeout(self):
        from app.core.config import settings
        return settings.SCRAPER_TIMEOUT * 1000