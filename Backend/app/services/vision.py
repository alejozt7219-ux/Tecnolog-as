import logging
import base64
import json
import re
import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


IDENTIFY_PROMPT = """
Eres un sistema experto en identificación EXACTA de productos para e-commerce colombiano.

Tu trabajo es identificar el modelo COMERCIAL EXACTO y generar el search_query MÁS ESPECÍFICO posible para encontrar ESE PRODUCTO (no accesorios, no fundas, no cables, no partes).

REGLAS CRÍTICAS:

1. IDENTIFICA EL PRODUCTO PRINCIPAL — nunca accesorios ni fundas.
   - Si ves un iPhone → el producto es el iPhone, NO una funda para iPhone
   - Si ves unas zapatillas → el producto son las zapatillas, NO los cordones
   - Si ves un computador → el producto es el computador, NO una funda de laptop

2. EL search_query DEBE:
   - Empezar con la marca
   - Incluir modelo completo con variante (Pro, Max, Ultra, Plus, etc.)
   - Incluir capacidad/tamaño si es visible o probable (256GB, 45mm, etc.)
   - Terminar con el tipo de producto EXPLÍCITO (smartphone, laptop, auriculares, etc.)
   - Máximo 8 palabras
   - NUNCA incluir palabras como "funda", "case", "cover", "accesorio", "cable"

3. EJEMPLOS CORRECTOS de search_query:
   - "iPhone 17 Pro Max 256GB smartphone"
   - "Samsung Galaxy S25 Ultra smartphone"
   - "Sony WH-1000XM5 auriculares inalámbricos"
   - "MacBook Pro M4 laptop"
   - "Nike Air Force 1 Low zapatillas"
   - "Apple Watch Series 10 45mm smartwatch"
   - "Samsung Galaxy Tab S10 tablet"

4. EJEMPLOS INCORRECTOS de search_query:
   - "iPhone 17 Pro Max" (sin tipo de producto → Amazon devuelve fundas)
   - "funda iPhone 17"
   - "apple smartphone"
   - "celular samsung"

5. PARA CELULARES siempre agrega "smartphone" al final del search_query.
6. PARA LAPTOPS siempre agrega "laptop" o "portátil" al final.
7. PARA AURICULARES siempre agrega "auriculares" al final.
8. PARA SMARTWATCHES siempre agrega "smartwatch" al final.
9. PARA TABLETS siempre agrega "tablet" al final.
10. PARA ZAPATILLAS incluye el colorway si es distinguible.

RESPONDE SOLO JSON VÁLIDO. Sin texto adicional, sin markdown.

Formato obligatorio:
{
  "name": "nombre comercial exacto del producto",
  "category": "categoría específica (smartphone/laptop/auriculares/zapatillas/etc)",
  "brand": "marca exacta",
  "model": "modelo exacto con variante",
  "search_query": "query ultra específico optimizado para no devolver accesorios"
}
"""


# Sufijos que se agregan por categoría para evitar que scrapers devuelvan accesorios
CATEGORY_SUFFIXES = {
    "smartphone":   "smartphone",
    "celular":      "smartphone",
    "móvil":        "smartphone",
    "laptop":       "laptop",
    "portátil":     "laptop",
    "computador":   "laptop",
    "notebook":     "laptop",
    "auriculares":  "auriculares",
    "headphones":   "auriculares",
    "audífonos":    "auriculares",
    "smartwatch":   "smartwatch",
    "reloj":        "smartwatch",
    "tablet":       "tablet",
    "ipad":         "tablet",
    "zapatillas":   "zapatillas",
    "tenis":        "zapatillas",
    "sneakers":     "zapatillas",
    "televisor":    "televisor",
    "tv":           "televisor",
    "cámara":       "cámara",
    "camera":       "cámara",
    "consola":      "consola videojuegos",
    "gaming":       "consola videojuegos",
}

# Palabras que NUNCA deben aparecer en el search_query
BANNED_QUERY_WORDS = [
    "funda", "case", "cover", "protector", "accesorio",
    "cable", "cargador", "charger", "soporte", "holder",
    "screen protector", "vidrio templado", "correa",
]


def _enforce_query_quality(search_query: str, name: str, brand: str, model: str, category: str) -> str:
    """
    Garantiza que el search_query sea específico y no devuelva accesorios.
    """
    if not search_query:
        search_query = f"{brand or ''} {model or name or ''}".strip()

    # Detectar y eliminar palabras prohibidas
    q_lower = search_query.lower()
    has_banned = any(w in q_lower for w in BANNED_QUERY_WORDS)
    if has_banned:
        # Reconstruir desde nombre/marca/modelo
        search_query = f"{brand or ''} {model or name or ''}".strip()

    # Agregar sufijo de categoría si no está presente
    cat_lower = (category or "").lower()
    suffix = None
    for cat_key, cat_suffix in CATEGORY_SUFFIXES.items():
        if cat_key in cat_lower:
            suffix = cat_suffix
            break

    # También intentar detectar por nombre/modelo
    if not suffix:
        name_lower = (name or "").lower()
        model_lower = (model or "").lower()
        for cat_key, cat_suffix in CATEGORY_SUFFIXES.items():
            if cat_key in name_lower or cat_key in model_lower:
                suffix = cat_suffix
                break

    # Agregar sufijo si no está ya en el query
    if suffix and suffix.lower() not in search_query.lower():
        search_query = f"{search_query} {suffix}"

    # Limpiar espacios dobles y recortar
    search_query = re.sub(r"\s+", " ", search_query).strip()

    return search_query[:100]


async def identify_product_from_image(
    image_bytes: bytes,
    media_type: str = "image/jpeg"
) -> dict:

    image_data = base64.b64encode(image_bytes).decode("utf-8")

    payload = {
        "model": "meta-llama/llama-4-scout-17b-16e-instruct",
        "temperature": 0,
        "top_p": 0.1,
        "max_tokens": 300,
        "response_format": {
            "type": "json_object"
        },
        "messages": [
            {
                "role": "system",
                "content": (
                    "Eres un sistema experto en identificación exacta de productos. "
                    "Identificas el producto principal en la imagen, NUNCA sus accesorios. "
                    "Responde únicamente JSON válido sin markdown."
                ),
            },

            # Few-shot: celular → smartphone (no funda)
            {
                "role": "user",
                "content": "Identifica este producto: [imagen de iPhone 17 Pro Max titanio]"
            },
            {
                "role": "assistant",
                "content": '{"name":"iPhone 17 Pro Max","category":"smartphone","brand":"Apple","model":"iPhone 17 Pro Max","search_query":"Apple iPhone 17 Pro Max 256GB smartphone"}'
            },

            # Few-shot: zapatillas con colorway
            {
                "role": "user",
                "content": "Identifica este producto: [imagen de Nike Air Force 1 blancas]"
            },
            {
                "role": "assistant",
                "content": '{"name":"Nike Air Force 1 Low White","category":"zapatillas","brand":"Nike","model":"Air Force 1 Low","search_query":"Nike Air Force 1 Low White zapatillas"}'
            },

            # Few-shot: auriculares
            {
                "role": "user",
                "content": "Identifica este producto: [imagen de Sony WH-1000XM5]"
            },
            {
                "role": "assistant",
                "content": '{"name":"Sony WH-1000XM5","category":"auriculares","brand":"Sony","model":"WH-1000XM5","search_query":"Sony WH-1000XM5 auriculares inalámbricos"}'
            },

            # Input real
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{media_type};base64,{image_data}"
                        },
                    },
                    {
                        "type": "text",
                        "text": IDENTIFY_PROMPT,
                    },
                ],
            },
        ],
    }

    async with httpx.AsyncClient(timeout=40) as client:
        response = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        response.raise_for_status()
        raw = response.json()["choices"][0]["message"]["content"]

    try:
        # Limpiar markdown si Groq lo devuelve igual
        clean_raw = re.sub(r"```(?:json)?", "", raw).strip().strip("`").strip()
        data = json.loads(clean_raw)

        name     = data.get("name") or "Producto no identificado"
        brand    = data.get("brand")
        model    = data.get("model")
        category = data.get("category") or "general"

        search_query = _enforce_query_quality(
            search_query=data.get("search_query", ""),
            name=name,
            brand=brand,
            model=model,
            category=category,
        )

        logger.info(f"[Vision] Identificado: '{name}' → query: '{search_query}'")

        return {
            "name": name,
            "category": category,
            "brand": brand,
            "model": model,
            "search_query": search_query,
        }

    except Exception as e:
        logger.error(f"[Vision] Error parseando JSON: {e} | raw: {raw[:200]}")
        return {
            "name": "Producto no identificado",
            "category": "general",
            "brand": None,
            "model": None,
            "search_query": "producto",
        }