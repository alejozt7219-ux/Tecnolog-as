"""
MercadoLibre Colombia — scraper Playwright con selectores poly-card (2025).
La API pública bloquea requests desde servidores (403). Playwright simula
un navegador real y evita el bloqueo.
Selectores extraídos del HTML real inspeccionado por el usuario.
"""
from app.scraper.base import BaseScraper, ScrapedPrice
import logging

logger = logging.getLogger(__name__)


class MercadoLibreScraper(BaseScraper):
    store_name = "Mercado Libre"
    base_url   = "https://listado.mercadolibre.com.co"

    async def search(self, query: str) -> list[ScrapedPrice]:
        page = await self.new_page()
        results = []

        try:
            search_url = f"{self.base_url}/{query.replace(' ', '-')}"
            await page.goto(search_url, timeout=self._timeout())

            try:
                await page.wait_for_selector(
                    "li.ui-search-layout__item",
                    timeout=15000,
                )
            except Exception:
                logger.warning(f"[MeLi CO] Timeout para '{query}'")
                return results

            items = await page.query_selector_all("li.ui-search-layout__item")

            for item in items[:6]:
                try:
                    # Título — a.poly-component__title
                    title_el = await item.query_selector("a.poly-component__title")

                    # Precio actual con descuento — .poly-price__current .andes-money-amount__fraction
                    # Viene como "1.013.553" (puntos = separador de miles en CO)
                    price_el = await item.query_selector(
                        ".poly-price__current .andes-money-amount__fraction"
                    )

                    if not title_el or not price_el:
                        continue

                    title     = (await title_el.inner_text()).strip()
                    price_str = (
                        (await price_el.inner_text())
                        .replace(".", "")   # quitar separador de miles
                        .replace(",", "")
                        .strip()
                    )
                    if not price_str.isdigit():
                        continue

                    price = float(price_str)
                    if price < 5_000 or price > 80_000_000:
                        continue

                    url = await title_el.get_attribute("href") or ""
                    if "#" in url:
                        url = url.split("#")[0]

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