import base64
import json
import asyncio
from functools import partial
import google.generativeai as genai
from app.core.config import settings

genai.configure(api_key=settings.GEMINI_API_KEY)
model = genai.GenerativeModel("gemini-1.5-flash")

IDENTIFY_PROMPT = """Analiza esta imagen de un producto y responde ÚNICAMENTE con un JSON en este formato exacto, sin texto adicional, sin backticks, solo el JSON puro:
{
  "name": "nombre del producto y modelo si es visible",
  "category": "categoría (ej: smartwatch, laptop, smartphone, auriculares, zapatos, etc)",
  "brand": "marca si es visible, si no escribe null",
  "search_query": "término de búsqueda optimizado para encontrar este producto en tiendas online (máximo 6 palabras)"
}"""


async def identify_product_from_image(image_bytes: bytes, media_type: str = "image/jpeg") -> dict:
    """
    Manda la imagen a Gemini Vision y regresa los datos del producto identificado.
    Gemini SDK es síncrono, así que lo corremos en un thread pool para no bloquear.
    """
    image_part = {
        "mime_type": media_type,
        "data": base64.b64encode(image_bytes).decode(),
    }

    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(
        None,
        partial(model.generate_content, [IDENTIFY_PROMPT, image_part]),
    )

    raw = response.text.strip()

    # Limpia por si Gemini manda backticks de markdown
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Fallback: si no parsea bien, regresa un dict básico
        return {
            "name": "Producto no identificado",
            "category": "general",
            "brand": None,
            "search_query": "producto",
        }
