"""
Amazon Colombia — scraper Playwright con selectores reales (2025).
El precio en amazon.com.co aparece como "COP 1,548,363" dentro de
span.a-price-whole (sin símbolo $, con comas como separador de miles).
Selectores extraídos del HTML real inspeccionado.
"""
from app.scraper.base import BaseScraper, ScrapedPrice
import logging

logger = logging.getLogger(__name__)


class AmazonScraper(BaseScraper):
    store_name = "Amazon"
    base_url   = "https://www.amazon.com.co"

    async def search(self, query: str) -> list[ScrapedPrice]:
        page = await self.new_page()
        results = []

        try:
            search_url = f"{self.base_url}/s?k={query.replace(' ', '+')}&language=es_CO"
            await page.goto(search_url, timeout=self._timeout())

            try:
                await page.wait_for_selector(
                    "[data-component-type='s-search-result']",
                    timeout=15000,
                )
            except Exception:
                logger.warning(f"[Amazon CO] Sin resultados para '{query}'")
                return results

            items = await page.query_selector_all(
                "[data-component-type='s-search-result']"
            )

            for item in items[:10]:
                try:
                    asin = await item.get_attribute("data-asin")
                    if not asin:
                        continue

                    # Título — h2 > a > span o h2 con clase a-size-medium
                    title_el = (
                        await item.query_selector("h2 .a-size-medium.a-color-base.a-text-normal") or
                        await item.query_selector("h2 a span") or
                        await item.query_selector("h2 span")
                    )

                    # Precio: amazon.com.co usa "COP 1,548,363" en a-price-whole
                    # El span.a-offscreen tiene el precio limpio: "COP 1,548,363"
                    price_offscreen = await item.query_selector(
                        ".a-price .a-offscreen"
                    )
                    # Fallback: a-price-whole directamente
                    price_whole_el = await item.query_selector(".a-price-whole")

                    if not title_el:
                        continue

                    title = (await title_el.inner_text()).strip()

                    price = None

                    # Intentar primero el offscreen que tiene el valor completo
                    if price_offscreen:
                        raw = (await price_offscreen.inner_text()).strip()
                        # "COP 1,548,363" o "COP\xa01,548,363"
                        # Quitar "COP", espacios, comas
                        clean = raw.replace("COP", "").replace(",", "").replace(".", "").strip()
                        # puede quedar "1548363"
                        digits = "".join(c for c in clean if c.isdigit())
                        if digits:
                            price = float(digits)

                    # Fallback: a-price-whole (puede venir "1,548,363" o "1548363")
                    if not price and price_whole_el:
                        raw = (await price_whole_el.inner_text()).strip()
                        digits = "".join(c for c in raw if c.isdigit())
                        if digits:
                            price = float(digits)

                    if not price or price < 10_000 or price > 50_000_000:
                        continue

                    link_el = (
                        await item.query_selector("h2 a") or
                        await item.query_selector("a.a-link-normal[href*='/dp/']")
                    )
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
                    logger.debug(f"[Amazon CO] Error parseando item: {e}")
                    continue

        except Exception as e:
            logger.error(f"[Amazon CO] Error en búsqueda '{query}': {e}")
        finally:
            await page.close()

        return results

    def _timeout(self):
        from app.core.config import settings
        return settings.SCRAPER_TIMEOUT * 1000