"""
MercadoLibre Colombia — scraper Playwright (2025).
Evasión anti-bot robusta + selectores múltiples con fallback.
"""
from app.scraper.base import BaseScraper, ScrapedPrice
import logging, re, random, asyncio

logger = logging.getLogger(__name__)

# ── User agents reales rotados ────────────────────────────────────────────────
_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.207 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.6312.122 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.207 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.207 Safari/537.36",
]

# ── Script de evasión completo ────────────────────────────────────────────────
_STEALTH_SCRIPT = """
// Ocultar webdriver
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

// Plugins reales (Chrome tiene 3 por defecto)
Object.defineProperty(navigator, 'plugins', {
  get: () => {
    const arr = [
      { name: 'Chrome PDF Plugin',       filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'Chrome PDF Viewer',       filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
      { name: 'Native Client',           filename: 'internal-nacl-plugin', description: '' },
    ];
    arr.__proto__ = PluginArray.prototype;
    return arr;
  }
});

// Idiomas reales
Object.defineProperty(navigator, 'languages', { get: () => ['es-CO', 'es', 'en-US', 'en'] });

// Hardware concurrency (no 0)
Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });

// deviceMemory
Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });

// Chrome object real
window.chrome = {
  runtime: {
    connect: () => {},
    sendMessage: () => {},
    onMessage: { addListener: () => {} },
  },
  loadTimes: () => ({
    requestTime: performance.now() / 1000,
    startLoadTime: performance.now() / 1000,
    commitLoadTime: performance.now() / 1000,
    finishDocumentLoadTime: 0,
    finishLoadTime: 0,
    firstPaintTime: 0,
    firstPaintAfterLoadTime: 0,
    navigationType: 'Other',
    wasFetchedViaSpdy: false,
    wasNpnNegotiated: false,
    npnNegotiatedProtocol: 'unknown',
    wasAlternateProtocolAvailable: false,
    connectionInfo: 'http/1.1',
  }),
  csi: () => ({ startE: Date.now(), onloadT: Date.now(), pageT: 1, tran: 15 }),
  app: { isInstalled: false, InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' }, RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' } },
};

// Permisos (no revelar automation)
const originalQuery = window.navigator.permissions.query;
window.navigator.permissions.query = (parameters) =>
  parameters.name === 'notifications'
    ? Promise.resolve({ state: Notification.permission })
    : originalQuery(parameters);

// Canvas fingerprint (leve ruido para no ser detectado como headless idéntico)
const _toBlob   = HTMLCanvasElement.prototype.toBlob;
const _toDataURL = HTMLCanvasElement.prototype.toDataURL;
const _getCtx   = HTMLCanvasElement.prototype.getContext;
"""


def _clean_url(url: str) -> str:
    if not url:
        return url
    if "#" in url:
        url = url.split("#")[0]
    if "?" in url:
        url = url.split("?")[0]
    return url[:2000]


def _parse_price(raw: str) -> float | None:
    only_digits = re.sub(r"[^\d]", "", raw)
    if not only_digits:
        return None
    price = float(only_digits[:9])
    return price if 5_000 <= price <= 80_000_000 else None


# Grupos de selectores con fallback — MeLi cambia el HTML frecuentemente
_ITEM_SELECTORS = [
    "li.ui-search-layout__item",
    "li.ui-search-layout__item--stack",
    "div.ui-search-result__wrapper",
    ".poly-card",
]

_TITLE_SELECTORS = [
    "h3.poly-component__title-wrapper a.poly-component__title",
    "a.poly-component__title",
    "h2.ui-search-item__title",
    ".ui-search-item__title a",
    "h3 a[class*='title']",
]

_PRICE_SELECTORS = [
    ".poly-price__current .andes-money-amount__fraction",
    ".andes-money-amount__fraction",
    "span[class*='price-tag-fraction']",
    ".price-tag-fraction",
    "span[class*='amount__fraction']",
]


class MercadoLibreScraper(BaseScraper):
    store_name = "Mercado Libre"
    base_url   = "https://www.mercadolibre.com.co"

    async def __aenter__(self):
        from playwright.async_api import async_playwright
        self._playwright = await async_playwright().start()
        self.browser = await self._playwright.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-blink-features=AutomationControlled",
                "--disable-dev-shm-usage",
                "--disable-infobars",
                "--window-size=1280,800",
                "--disable-extensions",
                "--disable-gpu",
                "--disable-background-networking",
                "--disable-background-timer-throttling",
                "--disable-renderer-backgrounding",
                "--disable-backgrounding-occluded-windows",
                "--no-first-run",
                "--no-default-browser-check",
                "--ignore-certificate-errors",
            ],
        )
        return self

    async def _new_stealth_page(self):
        ua = random.choice(_USER_AGENTS)
        context = await self.browser.new_context(
            user_agent=ua,
            viewport={"width": 1280, "height": 800},
            locale="es-CO",
            timezone_id="America/Bogota",
            extra_http_headers={
                "Accept-Language":           "es-CO,es;q=0.9,en-US;q=0.8,en;q=0.7",
                "Accept":                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                "Accept-Encoding":           "gzip, deflate, br",
                "Upgrade-Insecure-Requests": "1",
                "Sec-Fetch-Dest":            "document",
                "Sec-Fetch-Mode":            "navigate",
                "Sec-Fetch-Site":            "none",
                "Sec-Fetch-User":            "?1",
                "Cache-Control":             "max-age=0",
                "Connection":                "keep-alive",
            },
        )
        # Inyectar evasión ANTES de que cargue cualquier página
        await context.add_init_script(_STEALTH_SCRIPT)

        page = await context.new_page()

        # Bloquear solo recursos de tracking, no CSS/JS de MeLi
        await page.route(
            re.compile(r"\.(gif|woff2?|ttf|otf)$"),
            lambda route: route.abort()
        )
        # Bloquear dominios de tracking
        await page.route(
            re.compile(r"(doubleclick|google-analytics|googletagmanager|facebook|hotjar|clarity\.ms)"),
            lambda route: route.abort()
        )

        return page

    async def _find_selector(self, page, selectors: list[str], context=None) -> str | None:
        """Prueba una lista de selectores y devuelve el primero que exista."""
        for sel in selectors:
            try:
                if context:
                    el = await context.query_selector(sel)
                else:
                    el = await page.query_selector(sel)
                if el:
                    return sel
            except Exception:
                continue
        return None

    async def search(self, query: str) -> list[ScrapedPrice]:
        page = await self._new_stealth_page()
        results: list[ScrapedPrice] = []

        # URL de búsqueda directa (más estable que /jm/search)
        encoded = query.replace(" ", "-").lower()
        search_url = f"https://listado.mercadolibre.com.co/{encoded}#D[A:{query.replace(' ', '+')}]"

        try:
            logger.info(f"[MeLi CO] Navegando a: {search_url}")

            # Simular visita natural: primero la home
            await page.goto(
                "https://www.mercadolibre.com.co/",
                wait_until="domcontentloaded",
                timeout=self._timeout(),
            )
            await asyncio.sleep(random.uniform(1.0, 2.0))

            # Ahora ir a la búsqueda
            await page.goto(
                search_url,
                wait_until="domcontentloaded",
                timeout=self._timeout(),
            )

            # Espera humana variable
            await asyncio.sleep(random.uniform(2.0, 3.5))

            # Scroll suave simulando lectura humana
            await page.evaluate("""
                () => new Promise(resolve => {
                    let total = 0;
                    const step = () => {
                        const delta = Math.floor(Math.random() * 120) + 60;
                        window.scrollBy(0, delta);
                        total += delta;
                        if (total < 600) setTimeout(step, Math.floor(Math.random() * 180) + 80);
                        else resolve();
                    };
                    step();
                })
            """)
            await asyncio.sleep(random.uniform(0.5, 1.2))

            # Detectar qué selector de item funciona
            item_sel = await self._find_selector(page, _ITEM_SELECTORS)
            if not item_sel:
                # Último intento: esperar un poco más
                await asyncio.sleep(2.0)
                item_sel = await self._find_selector(page, _ITEM_SELECTORS)

            if not item_sel:
                html_preview = await page.content()
                logger.warning(
                    f"[MeLi CO] No se encontraron items para '{query}'. "
                    f"HTML preview: {html_preview[:500]}"
                )
                return results

            items = await page.query_selector_all(item_sel)
            logger.info(f"[MeLi CO] {len(items)} items con selector '{item_sel}' para '{query}'")

            for item in items[:12]:
                try:
                    # Título — probar selectores con fallback
                    title_sel = await self._find_selector(page, _TITLE_SELECTORS, context=item)
                    if not title_sel:
                        continue
                    title_el = await item.query_selector(title_sel)
                    if not title_el:
                        continue
                    title = (await title_el.inner_text()).strip()
                    href  = await title_el.get_attribute("href") or ""
                    url   = _clean_url(href)
                    if not title or not url:
                        continue

                    # Precio — probar selectores con fallback
                    price_el = None
                    for psel in _PRICE_SELECTORS:
                        price_el = await item.query_selector(psel)
                        if price_el:
                            break
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
                    logger.debug(f"[MeLi CO] Error parseando item: {e}")
                    continue

        except Exception as e:
            logger.error(f"[MeLi CO] Error en búsqueda '{query}': {e}")
        finally:
            await page.close()

        logger.info(f"[MeLi CO] {len(results)} resultados para '{query}'")
        return results

    def _timeout(self):
        from app.core.config import settings
        return settings.SCRAPER_TIMEOUT * 1000