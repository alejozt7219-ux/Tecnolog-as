"""
Éxito Colombia — scraper Playwright (2025).
Selectores verificados en HTML real (mayo 2025).
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
    matches = sum(1 for w in q_words if re.search(r"\b" + w + r"\b", t_norm))
    return matches >= min(min_words, len(q_words))


class ExitoScraper(BaseScraper):
    store_name = "Éxito"
    base_url = "https://www.exito.com"

    async def search(self, query: str) -> list[ScrapedPrice]:
        page = await self.new_page()
        results = []

        try:
            search_url = f"{self.base_url}/s?q={query.replace(' ', '+')}&sort=score_desc&page=0"
            await page.goto(search_url, timeout=self._timeout())

            try:
                await page.wait_for_selector(
                    "article[class*='productCard']",
                    timeout=15000
                )
            except Exception:
                logger.warning(f"[Éxito] Timeout esperando productos para '{query}'")
                return results

            items = await page.query_selector_all("article[class*='productCard']")
            logger.debug(f"[Éxito] {len(items)} items encontrados para '{query}'")

            for item in items[:10]:
                try:
                    title_el = (
                        await item.query_selector("h3[class*='styles_name']") or
                        await item.query_selector("[data-testid='product-name']") or
                        await item.query_selector("h3")
                    )
                    price_el = (
                        await item.query_selector(
                            "div[data-fs-container-price-otros-geral] p"
                        ) or
                        await item.query_selector("[data-testid='product-price']") or
                        await item.query_selector("p[class*='ProductPrice_container__price']")
                    )
                    link_el = (
                        await item.query_selector("a[data-testid='product-link']") or
                        await item.query_selector("a[href*='/p']") or
                        await item.query_selector("a")
                    )

                    if not title_el or not price_el:
                        continue

                    title     = (await title_el.inner_text()).strip()
                    price_raw = (await price_el.inner_text()).strip()

                    # Filtrar por relevancia
                    if not _is_relevant(title, query):
                        logger.debug(f"[Éxito] Descartado: '{title}' para '{query}'")
                        continue

                    price_str = (
                        price_raw
                        .replace("$", "")
                        .replace(".", "")
                        .replace(",", "")
                        .replace("\xa0", "")
                        .strip()
                        .split()[0]
                    )

                    if not price_str.isdigit():
                        continue

                    price = float(price_str)
                    if price < 5_000 or price > 80_000_000:
                        continue

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

                    if len(results) >= 3:
                        break

                except Exception as e:
                    logger.debug(f"[Éxito] Error parseando item: {e}")
                    continue

        except Exception as e:
            logger.error(f"[Éxito] Error en búsqueda '{query}': {e}")
        finally:
            await page.close()

        logger.info(f"[Éxito] {len(results)} resultados para '{query}'")
        return results

    def _timeout(self):
        from app.core.config import settings
        return settings.SCRAPER_TIMEOUT * 1000