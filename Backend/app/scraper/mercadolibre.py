"""
MercadoLibre Colombia — scraper Playwright (2025).
URL correcta: https://listado.mercadolibre.com.co/<query-con-guiones>
Selectores poly-card verificados en HTML real.
"""
from app.scraper.base import BaseScraper, ScrapedPrice
import logging

logger = logging.getLogger(__name__)


def _clean_meli_url(url: str) -> str:
    """
    MeLi genera URLs de tracking enormes (click1.mercadolibre.com.co/mclics/...).
    Las limpiamos para quedarnos solo con la URL canónica del producto.
    """
    if not url:
        return url
    # Quitar fragment con parámetros de tracking (#polycard_client=...)
    if "#" in url:
        url = url.split("#")[0]
    # URLs de click-tracking: intentar extraer pdp_url del query string
    if "mclics" in url or "click1.mercadolibre" in url:
        # Tomar solo el dominio + path, sin query params
        url = url.split("?")[0]
    # Truncar por seguridad a 2000 chars
    return url[:2000]


class MercadoLibreScraper(BaseScraper):
    store_name = "Mercado Libre"
    base_url   = "https://listado.mercadolibre.com.co"

    async def search(self, query: str) -> list[ScrapedPrice]:
        page = await self.new_page()
        results = []

        try:
            # URL correcta: minúsculas, guiones
            slug = query.lower().replace(" ", "-")
            search_url = f"{self.base_url}/{slug}"

            await page.set_extra_http_headers({
                "Accept-Language": "es-CO,es;q=0.9",
                "Referer": "https://www.mercadolibre.com.co/",
            })

            await page.goto(search_url, wait_until="domcontentloaded", timeout=self._timeout())

            # MeLi carga con JS — esperar más tiempo
            try:
                await page.wait_for_selector("li.ui-search-layout__item", timeout=25000)
            except Exception:
                # Intentar URL alternativa
                try:
                    alt_url = f"https://www.mercadolibre.com.co/jm/search?as_word={query.replace(' ', '+')}"
                    await page.goto(alt_url, wait_until="domcontentloaded", timeout=self._timeout())
                    await page.wait_for_selector("li.ui-search-layout__item", timeout=20000)
                except Exception:
                    logger.warning(f"[MeLi CO] Timeout para '{query}'")
                    return results

            items = await page.query_selector_all("li.ui-search-layout__item")

            for item in items[:8]:
                try:
                    # Título
                    title_el = (
                        await item.query_selector("a.poly-component__title") or
                        await item.query_selector(".poly-component__title") or
                        await item.query_selector("h2.ui-search-item__title")
                    )

                    # Precio actual
                    price_el = (
                        await item.query_selector(".poly-price__current .andes-money-amount__fraction") or
                        await item.query_selector(".andes-money-amount__fraction") or
                        await item.query_selector(".price-tag-fraction")
                    )

                    if not title_el or not price_el:
                        continue

                    title = (await title_el.inner_text()).strip()
                    price_str = (
                        (await price_el.inner_text())
                        .replace(".", "")
                        .replace(",", "")
                        .strip()
                    )

                    if not price_str.isdigit():
                        continue

                    price = float(price_str)
                    if price < 5_000 or price > 80_000_000:
                        continue

                    # URL — limpiar tracking
                    raw_url = await title_el.get_attribute("href") or ""
                    if not raw_url:
                        link_el = await item.query_selector("a[href*='mercadolibre']")
                        raw_url = await link_el.get_attribute("href") if link_el else ""

                    url = _clean_meli_url(raw_url)

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