from app.scraper.base import BaseScraper, ScrapedPrice
import logging

logger = logging.getLogger(__name__)


class AmazonScraper(BaseScraper):
    store_name = "Amazon"
    base_url = "https://www.amazon.com.mx"

    async def search(self, query: str) -> list[ScrapedPrice]:
        page = await self.new_page()
        results = []

        try:
            search_url = f"{self.base_url}/s?k={query.replace(' ', '+')}&language=es_MX"
            await page.goto(search_url, timeout=self._timeout())

            # Esperar resultados con múltiples selectores posibles
            try:
                await page.wait_for_selector(
                    "[data-component-type='s-search-result'], .s-result-item[data-asin]",
                    timeout=15000,
                )
            except Exception:
                logger.warning(f"[Amazon] No se encontraron resultados para '{query}'")
                return results

            items = await page.query_selector_all(
                "[data-component-type='s-search-result']"
            )

            for item in items[:8]:
                try:
                    # Verificar que tiene ASIN (es un producto real)
                    asin = await item.get_attribute("data-asin")
                    if not asin:
                        continue

                    # Título — múltiples selectores
                    title_el = (
                        await item.query_selector("h2 a span") or
                        await item.query_selector("h2 span.a-size-medium") or
                        await item.query_selector(".a-size-base-plus.a-color-base.a-text-normal")
                    )

                    # Precio entero
                    price_whole = (
                        await item.query_selector(".a-price-whole") or
                        await item.query_selector(".a-price .a-price-whole")
                    )

                    if not title_el or not price_whole:
                        continue

                    title = (await title_el.inner_text()).strip()
                    whole_text = (await price_whole.inner_text()).replace(",", "").replace(".", "").strip()

                    # Limpiar caracteres no numéricos
                    whole_clean = "".join(c for c in whole_text if c.isdigit())
                    if not whole_clean:
                        continue

                    price_fraction_el = await item.query_selector(".a-price-fraction")
                    fraction = "00"
                    if price_fraction_el:
                        frac_text = (await price_fraction_el.inner_text()).strip()
                        fraction = frac_text if frac_text.isdigit() else "00"

                    price = float(f"{whole_clean}.{fraction}")

                    # Solo incluir si el precio es razonable (en MXN, convertir a COP aprox)
                    if price <= 0:
                        continue

                    # Convertir MXN a COP aproximado (1 MXN ≈ 220 COP, ajustar según necesidad)
                    # O usar el precio directo si Amazon.com.mx ya da precios en COP-equivalentes
                    price_cop = price * 220  # aprox

                    link_el = await item.query_selector("h2 a") or await item.query_selector("a.a-link-normal")
                    href = await link_el.get_attribute("href") if link_el else ""
                    url = f"{self.base_url}{href}" if href and href.startswith("/") else href

                    results.append(
                        ScrapedPrice(
                            store_name=self.store_name,
                            price=round(price_cop),
                            currency="COP",
                            url=url,
                            title=title,
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
