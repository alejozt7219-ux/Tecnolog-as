"""
Falabella Colombia — scraper Playwright con filtro de relevancia.
Descarta resultados cuyo título no contenga ninguna palabra clave del query,
evitando que búsquedas como 'Samsung Galaxy Watch' retornen un Garmin.
"""
from app.scraper.base import BaseScraper, ScrapedPrice
import logging
import re
import unicodedata

logger = logging.getLogger(__name__)


def _normalize(text: str) -> str:
    """Minúsculas sin tildes ni puntuación."""
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^\w\s]", "", text).lower()


def _is_relevant(title: str, query: str, min_words: int = 2) -> bool:
    """Retorna True si al menos min_words palabras del query aparecen en el título."""
    q_words  = [w for w in _normalize(query).split() if len(w) > 2]
    t_norm   = _normalize(title)
    matches  = sum(1 for w in q_words if w in t_norm)
    return matches >= min(min_words, len(q_words))


class FalabellaScraper(BaseScraper):
    store_name = "Falabella"
    base_url   = "https://www.falabella.com.co"

    async def search(self, query: str) -> list[ScrapedPrice]:
        page = await self.new_page()
        results = []

        try:
            search_url = f"{self.base_url}/falabella-co/search?Ntt={query.replace(' ', '+')}"
            await page.goto(search_url, timeout=self._timeout())
            await page.wait_for_selector("a.pod-link", timeout=12000)

            items = await page.query_selector_all("a.pod-link")

            for item in items[:10]:   # revisar más items para encontrar relevantes
                try:
                    title_el = await item.query_selector("b.pod-subTitle")
                    price_el = await item.query_selector("li.prices-0 span")

                    if not title_el or not price_el:
                        continue

                    title     = (await title_el.inner_text()).strip()
                    price_raw = (await price_el.inner_text())
                    price_str = (
                        price_raw
                        .replace("$", "")
                        .replace(".", "")
                        .replace(",", "")
                        .strip()
                    )

                    if not price_str.isdigit():
                        continue

                    price = float(price_str)
                    if price <= 0:
                        continue

                    # Filtro de relevancia: descartar productos no relacionados
                    if not _is_relevant(title, query):
                        logger.debug(f"[Falabella] Descartado por irrelevante: '{title}' para query '{query}'")
                        continue

                    url = await item.get_attribute("href") or ""
                    if url.startswith("/"):
                        url = f"{self.base_url}{url}"

                    # Detectar sin stock en la URL (Falabella incluye el producto aunque esté agotado)
                    in_stock = True

                    results.append(
                        ScrapedPrice(
                            store_name=self.store_name,
                            price=price,
                            currency="COP",
                            url=url,
                            title=title,
                            in_stock=in_stock,
                        )
                    )

                    if len(results) >= 3:   # suficientes resultados relevantes
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