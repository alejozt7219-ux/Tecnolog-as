"""
Amazon Colombia — scraper Playwright (2025).
Amazon detecta Playwright por propiedades del navegador (navigator.webdriver=true).
Usamos init_script para ocultarlo + user-agent realista.
"""
from app.scraper.base import BaseScraper, ScrapedPrice
import logging

logger = logging.getLogger(__name__)

# Script para ocultar señales de automatización
_STEALTH_JS = """
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3,4,5] });
Object.defineProperty(navigator, 'languages', { get: () => ['es-CO','es','en'] });
window.chrome = { runtime: {} };
"""


class AmazonScraper(BaseScraper):
    store_name = "Amazon"
    base_url   = "https://www.amazon.com.co"

    async def search(self, query: str) -> list[ScrapedPrice]:
        # Crear contexto con stealth
        context = await self.browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.6367.82 Safari/537.36"
            ),
            viewport={"width": 1366, "height": 768},
            locale="es-CO",
            timezone_id="America/Bogota",
            java_script_enabled=True,
            extra_http_headers={
                "Accept-Language": "es-CO,es;q=0.9,en-US;q=0.8,en;q=0.7",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124"',
                "sec-ch-ua-platform": '"Windows"',
            },
        )
        await context.add_init_script(_STEALTH_JS)
        page = await context.new_page()

        # Bloquear recursos innecesarios
        await page.route(
            "**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ico}",
            lambda route: route.abort(),
        )

        results = []

        try:
            search_url = f"{self.base_url}/s?k={query.replace(' ', '+')}&language=es_CO"
            await page.goto(search_url, wait_until="domcontentloaded", timeout=self._timeout())

            try:
                await page.wait_for_selector(
                    "[data-component-type='s-search-result']",
                    timeout=20000,
                )
            except Exception:
                content = await page.content()
                if "captcha" in content.lower() or "robot" in content.lower():
                    logger.warning(f"[Amazon CO] CAPTCHA detectado para '{query}'")
                elif "sorry" in content.lower():
                    logger.warning(f"[Amazon CO] Bloqueado (sorry page) para '{query}'")
                else:
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

                    title_el = (
                        await item.query_selector("h2 .a-size-medium.a-color-base.a-text-normal") or
                        await item.query_selector("h2 a span") or
                        await item.query_selector("h2 span")
                    )
                    if not title_el:
                        continue

                    title = (await title_el.inner_text()).strip()

                    # Precio: .a-price .a-offscreen = "COP 1,548,363"
                    price = None
                    price_offscreen = await item.query_selector(".a-price .a-offscreen")
                    if price_offscreen:
                        raw = (await price_offscreen.inner_text()).strip()
                        # Amazon CO: "COP 72,431.40" — comas=miles, punto=decimales
                        # Eliminar símbolo, espacios, no-break spaces
                        clean = raw.replace("COP", "").replace("\xa0", "").replace(" ", "").strip()
                        # Quitar comas (separador de miles) pero conservar el punto decimal
                        clean = clean.replace(",", "")
                        try:
                            price = float(clean)  # "72431.40" → 72431.40
                        except ValueError:
                            pass

                    if not price:
                        price_whole_el = await item.query_selector(".a-price-whole")
                        if price_whole_el:
                            raw = (await price_whole_el.inner_text()).strip()
                            # a-price-whole no tiene decimales, solo dígitos y comas/puntos de miles
                            clean = raw.replace(",", "").replace(".", "").strip()
                            if clean.isdigit():
                                price = float(clean)

                    if not price or price < 10_000 or price > 50_000_000:
                        continue

                    link_el = (
                        await item.query_selector("h2 a") or
                        await item.query_selector("a.a-link-normal[href*='/dp/']")
                    )
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
                    logger.debug(f"[Amazon CO] Error parseando item: {e}")
                    continue

        except Exception as e:
            logger.error(f"[Amazon CO] Error en búsqueda '{query}': {e}")
        finally:
            await page.close()
            await context.close()

        return results

    def _timeout(self):
        from app.core.config import settings
        return settings.SCRAPER_TIMEOUT * 1000