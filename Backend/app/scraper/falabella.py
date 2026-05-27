"""
Falabella Colombia — scraper Playwright (2025).
Falabella usa una SPA con React. Los selectores actuales (.pod-link, b.pod-subTitle)
corresponden a la versión antigua. Los selectores reales son:
  - Contenedor producto: li.jsx-... o div[data-pod]
  - Título: b.pod-subTitle o span.pod-subTitle
  - Precio: span[data-testid='price-label'] o ul.prices-0 li span

Como Falabella bloquea agresivamente bots, usamos networkidle y
esperamos a que cargue la SPA completamente.
"""
from app.scraper.base import BaseScraper, ScrapedPrice
import logging
import re
import unicodedata

logger = logging.getLogger(__name__)


def _normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^\w\s]", "", text).lower()


def _is_relevant(title: str, query: str, min_words: int = 2) -> bool:
    q_words = [w for w in _normalize(query).split() if len(w) > 2]
    t_norm  = _normalize(title)
    matches = sum(1 for w in q_words if w in t_norm)
    return matches >= min(min_words, len(q_words))


class FalabellaScraper(BaseScraper):
    store_name = "Falabella"
    base_url   = "https://www.falabella.com.co"

    async def search(self, query: str) -> list[ScrapedPrice]:
        page = await self.new_page()
        results = []

        try:
            search_url = f"{self.base_url}/falabella-co/search?Ntt={query.replace(' ', '+')}"

            await page.set_extra_http_headers({
                "Accept-Language": "es-CO,es;q=0.9",
                "Referer": self.base_url,
            })

            await page.goto(search_url, wait_until="domcontentloaded", timeout=self._timeout())

            # Falabella es SPA — esperar que carguen los pods de producto
            # Probar múltiples selectores según versión del sitio
            pod_selector = None
            for selector in [
                "a.pod-link",           # versión antigua (aún puede aparecer)
                "[data-pod]",           # versión nueva
                "li.gridItem",          # otra variante
                "div.jsx-search-result-item",
            ]:
                try:
                    await page.wait_for_selector(selector, timeout=10000)
                    pod_selector = selector
                    logger.debug(f"[Falabella] Usando selector de pod: {selector}")
                    break
                except Exception:
                    continue

            if not pod_selector:
                logger.warning(f"[Falabella] No se encontraron pods de producto para '{query}'")
                return results

            items = await page.query_selector_all(pod_selector)

            for item in items[:12]:
                try:
                    # Título — múltiples selectores posibles
                    title_el = (
                        await item.query_selector("b.pod-subTitle") or
                        await item.query_selector("span.pod-subTitle") or
                        await item.query_selector("[data-testid='pod-subTitle']") or
                        await item.query_selector("b.title") or
                        await item.query_selector(".pod-title")
                    )

                    # Precio — múltiples selectores posibles
                    price_el = (
                        await item.query_selector("li.prices-0 span") or
                        await item.query_selector("span[data-testid='price-label']") or
                        await item.query_selector("li.prices-0") or
                        await item.query_selector(".pod-price span") or
                        await item.query_selector("[class*='price'] span")
                    )

                    if not title_el or not price_el:
                        continue

                    title     = (await title_el.inner_text()).strip()
                    price_raw = (await price_el.inner_text()).strip()

                    # Limpiar precio: "$1.299.990" → 1299990
                    price_str = (
                        price_raw
                        .replace("$", "")
                        .replace(".", "")
                        .replace(",", "")
                        .strip()
                        .split()[0]  # tomar solo el primer token
                    )

                    if not price_str.isdigit():
                        continue

                    price = float(price_str)
                    if price <= 0 or price > 100_000_000:
                        continue

                    if not _is_relevant(title, query):
                        logger.debug(f"[Falabella] Descartado: '{title}' para '{query}'")
                        continue

                    # URL del producto
                    href = ""
                    # Si el item mismo es un <a>
                    tag = await item.evaluate("el => el.tagName")
                    if tag.lower() == "a":
                        href = await item.get_attribute("href") or ""
                    else:
                        link_el = await item.query_selector("a.pod-link, a[href]")
                        if link_el:
                            href = await link_el.get_attribute("href") or ""

                    url = f"{self.base_url}{href}" if href.startswith("/") else href

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

                    if len(results) >= 3:
                        break

                except Exception as e:
                    logger.debug(f"[Falabella] Error parseando item: {e}")
                    continue

        except Exception as e:
            logger.error(f"[Falabella] Error en búsqueda '{query}': {e}")
        finally:
            await page.close()

        return results

    def _timeout(self):
        from app.core.config import settings
        return settings.SCRAPER_TIMEOUT * 1000