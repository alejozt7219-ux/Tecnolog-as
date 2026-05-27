"""
Falabella Colombia — scraper Playwright (2025).
Selectores basados en HTML real inspeccionado.
"""
from app.scraper.base import BaseScraper, ScrapedPrice
import logging, re, unicodedata

logger = logging.getLogger(__name__)


def _normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^\w\s]", "", text).lower()


def _is_relevant(title: str, query: str, min_words: int = 2) -> bool:
    q_words = [w for w in _normalize(query).split() if len(w) > 2]
    t_norm  = _normalize(title)
    matches = sum(1 for w in q_words if w in t_norm)
    return matches >= min(min_words, len(q_words))


def _parse_price(raw: str) -> float | None:
    only_digits = re.sub(r"[^\d]", "", raw)
    if not only_digits:
        return None
    price = float(only_digits[:9])
    return price if 5_000 <= price <= 80_000_000 else None


class FalabellaScraper(BaseScraper):
    store_name = "Falabella"
    base_url   = "https://www.falabella.com.co"

    # Selector real del item (inspeccionado):
    # El item ES un <a data-pod="catalyst-pod"> directamente
    ITEM_SELECTOR = "a[data-pod='catalyst-pod']"

    # Selectores reales (inspeccionados):
    # Título:  b.pod-subTitle  (texto: "Cafetera de Cápsulas Inissia Negra con Espumador de Leche")
    # Precio:  li.prices-0 span  (texto: "$  554.900  ")
    # URL:     el href del item mismo → "https://www.falabella.com.co/falabella-co/product/73297271/..."
    TITLE_SELECTOR = "b.pod-subTitle"
    PRICE_SELECTOR = "li.prices-0 span"

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

            # Falabella SPA — esperar que carguen los pods
            try:
                await page.wait_for_selector(self.ITEM_SELECTOR, timeout=15000)
            except Exception:
                logger.warning(f"[Falabella] No cargaron pods para '{query}'")
                return results

            items = await page.query_selector_all(self.ITEM_SELECTOR)
            logger.info(f"[Falabella] {len(items)} items para '{query}'")

            for item in items[:12]:
                try:
                    # URL: el item mismo es el <a>
                    href = await item.get_attribute("href") or ""
                    if not href:
                        continue
                    # Limpiar tracking (sponsoredClickData=...)
                    url = href.split("?")[0]
                    if not url:
                        continue
                    if url.startswith("/"):
                        url = f"{self.base_url}{url}"

                    # Título
                    title_el = await item.query_selector(self.TITLE_SELECTOR)
                    if not title_el:
                        continue
                    title = (await title_el.inner_text()).strip()
                    if not title:
                        continue

                    if not _is_relevant(title, query):
                        logger.debug(f"[Falabella] Descartado: '{title}'")
                        continue

                    # Precio
                    price_el = await item.query_selector(self.PRICE_SELECTOR)
                    if not price_el:
                        continue
                    price = _parse_price((await price_el.inner_text()).strip())
                    if not price:
                        continue

                    results.append(ScrapedPrice(
                        store_name=self.store_name,
                        price=price,
                        currency="COP",
                        url=url,
                        title=title,
                        in_stock=True,
                    ))

                    if len(results) >= 3:
                        break

                except Exception as e:
                    logger.debug(f"[Falabella] Error parseando item: {e}")
                    continue

        except Exception as e:
            logger.error(f"[Falabella] Error en búsqueda '{query}': {e}")
        finally:
            await page.close()

        logger.info(f"[Falabella] {len(results)} resultados para '{query}'")
        return results

    def _timeout(self):
        from app.core.config import settings
        return settings.SCRAPER_TIMEOUT * 1000