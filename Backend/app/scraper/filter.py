"""
PriceVision — filter.py
Módulo central de filtrado de resultados scrapeados.

Corrige 3 problemas identificados:
  1. Amazon:    "X" (1 char) se filtraba → Series X ≠ Series S ahora se distinguen
  2. Alkosto:   accesorios (control, mando, etc.) pasan aunque tengan las palabras clave
  3. Falabella: resultados patrocinados/sponsored se cuelan antes del filtro
"""

from __future__ import annotations
import re
import unicodedata
import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────
# Constantes de configuración
# ─────────────────────────────────────────────────────────────────

# Porcentaje mínimo de tokens de la query que deben aparecer en el título
RELEVANCE_THRESHOLD = 0.5

# Palabras que indican accesorio cuando la query es de un producto principal (consola, PC, etc.)
ACCESSORY_WORDS: set[str] = {
    "control", "mando", "joystick", "gamepad",
    "headset", "audifonos", "audífonos", "auriculares", "diadema",
    "cargador", "base de carga", "charging",
    "bateria", "batería",
    "cable", "adaptador",
    "funda", "case", "carcasa", "estuche",
    "soporte", "stand",
    "skin", "vinilo",
    "teclado", "mouse", "raton", "ratón",
    "disco duro", "ssd",
    "ventilador", "cooler",
}

# Palabras que indican que la query pide un producto principal (no accesorio)
MAIN_PRODUCT_HINTS: set[str] = {
    "consola", "console",
    "xbox", "playstation", "ps4", "ps5", "nintendo", "switch",
    "laptop", "computador", "pc", "desktop", "portatil", "portátil",
    "tablet", "ipad",
    "televisor", "tv", "monitor",
    "celular", "smartphone", "iphone", "galaxy",
}

# Variantes de modelo que NO pueden mezclarse entre sí
# Cada tupla = grupo mutuamente excluyente
MODEL_VARIANT_GROUPS: list[tuple[str, ...]] = [
    ("series x", "series s"),          # Xbox
    ("ps5", "ps4"),                     # PlayStation
    ("rtx 4090", "rtx 4080", "rtx 4070", "rtx 4060", "rtx 3090", "rtx 3080"),
    ("iphone 16", "iphone 15", "iphone 14", "iphone 13"),
]


# ─────────────────────────────────────────────────────────────────
# Helpers de texto
# ─────────────────────────────────────────────────────────────────

def _normalize(text: str) -> str:
    """Minúsculas + quitar tildes + colapsar espacios."""
    text = text.lower()
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _tokenize(text: str) -> list[str]:
    """
    Divide en tokens alfanuméricos.
    FIX #1 — conserva letras mayúsculas solas (X, S, i, etc.)
    que identifican variantes de modelo.
    """
    raw = re.findall(r"[a-zA-Z0-9]+", text)
    tokens = []
    for t in raw:
        # Conservar si es letra única MAYÚSCULA (sigla de modelo: X, S, Z…)
        if len(t) == 1 and t.isupper():
            tokens.append(t.lower())
        elif len(t) >= 2:
            tokens.append(t.lower())
        # else: número o letra minúscula sola → descartar
    return tokens


# ─────────────────────────────────────────────────────────────────
# Checks individuales
# ─────────────────────────────────────────────────────────────────

def _relevance_ok(query_tokens: list[str], title: str) -> bool:
    """
    ≥ RELEVANCE_THRESHOLD de los tokens de la query deben aparecer en el título.
    """
    if not query_tokens:
        return True
    title_norm = _normalize(title)
    matched = sum(1 for t in query_tokens if t in title_norm)
    ratio = matched / len(query_tokens)
    ok = ratio >= RELEVANCE_THRESHOLD
    if not ok:
        logger.debug(f"[filter] relevance fail ({ratio:.0%}): '{title[:60]}'")
    return ok


def _model_variant_ok(query: str, title: str) -> bool:
    """
    FIX #1 — Si la query pide una variante específica (ej. 'Series X'),
    el resultado no puede ser de otra variante del mismo grupo (ej. 'Series S').
    """
    q_norm = _normalize(query)
    t_norm = _normalize(title)

    for group in MODEL_VARIANT_GROUPS:
        # ¿La query menciona alguna variante de este grupo?
        wanted = next((v for v in group if v in q_norm), None)
        if wanted is None:
            continue
        # ¿El título menciona una variante DIFERENTE del mismo grupo?
        for variant in group:
            if variant != wanted and variant in t_norm:
                logger.debug(
                    f"[filter] model variant mismatch: query='{wanted}' title has '{variant}'"
                )
                return False
    return True


def _not_accessory(query: str, title: str) -> bool:
    """
    FIX #2 — Si la query pide un producto principal, rechazar títulos que
    correspondan a accesorios.
    """
    q_norm = _normalize(query)
    t_norm = _normalize(title)

    # ¿La query pide un producto principal?
    is_main_query = any(hint in q_norm for hint in MAIN_PRODUCT_HINTS)
    if not is_main_query:
        return True  # query ambigua → no filtrar

    # ¿El título empieza con o contiene una palabra de accesorio prominente?
    title_words = set(t_norm.split())
    title_start = t_norm[:40]  # las primeras palabras pesan más

    for acc in ACCESSORY_WORDS:
        if acc in title_start or acc in title_words:
            logger.debug(f"[filter] accessory rejected: '{title[:60]}' (matched '{acc}')")
            return False
    return True


# ─────────────────────────────────────────────────────────────────
# API pública
# ─────────────────────────────────────────────────────────────────

@dataclass
class FilterResult:
    passed: bool
    reason: str = ""


def is_relevant(query: str, title: str, *, sponsored: bool = False) -> FilterResult:
    """
    Decide si un resultado de scraping es relevante para la query.

    Args:
        query:     Texto que buscó el usuario, ej. "Xbox Series X"
        title:     Título del producto scrapeado
        sponsored: True si el scraper detectó que el resultado es patrocinado
                   (FIX #3 — los patrocinados se rechazan directamente)

    Returns:
        FilterResult con .passed=True/False y .reason con la causa del rechazo.
    """
    # FIX #3 — Rechazar patrocinados antes de cualquier otro check
    if sponsored:
        return FilterResult(False, "sponsored")

    query_tokens = _tokenize(_normalize(query))
    title_clean  = _normalize(title)

    if not _relevance_ok(query_tokens, title_clean):
        return FilterResult(False, "relevance")

    if not _model_variant_ok(query, title):
        return FilterResult(False, "model_variant")

    if not _not_accessory(query, title):
        return FilterResult(False, "accessory")

    return FilterResult(True)


def filter_results(
    query: str,
    items: list[dict],
    *,
    title_key: str = "title",
    sponsored_key: str = "sponsored",
) -> list[dict]:
    """
    Filtra una lista de dicts (resultados scrapeados) según la query.

    Uso:
        filtered = filter_results("Xbox Series X", raw_items)

    Cada dict debe tener al menos la clave `title`.
    Opcionalmente puede tener `sponsored` (bool).
    """
    kept = []
    for item in items:
        title     = item.get(title_key, "")
        sponsored = bool(item.get(sponsored_key, False))
        result    = is_relevant(query, title, sponsored=sponsored)
        if result.passed:
            kept.append(item)
        else:
            logger.info(
                f"[filter] REJECTED ({result.reason}): '{title[:70]}'"
            )
    logger.info(f"[filter] '{query}' → {len(kept)}/{len(items)} results passed")
    return kept
