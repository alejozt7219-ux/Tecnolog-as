import base64
import json
import httpx
from app.core.config import settings

IDENTIFY_PROMPT = """Analiza esta imagen de un producto y responde ÚNICAMENTE con un JSON en este formato exacto, sin texto adicional, sin backticks, solo el JSON puro:
{
  "name": "nombre del producto y modelo si es visible",
  "category": "categoría (ej: smartwatch, laptop, smartphone, auriculares, zapatos, etc)",
  "brand": "marca si es visible, si no escribe null",
  "search_query": "término de búsqueda optimizado para encontrar este producto en tiendas online (máximo 6 palabras)"
}"""


async def identify_product_from_image(image_bytes: bytes, media_type: str = "image/jpeg") -> dict:
    image_data = base64.standard_b64encode(image_bytes).decode("utf-8")

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "meta-llama/llama-4-scout-17b-16e-instruct",
                "max_tokens": 300,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{media_type};base64,{image_data}"
                                },
                            },
                            {"type": "text", "text": IDENTIFY_PROMPT},
                        ],
                    }
                ],
            },
        )
        response.raise_for_status()
        raw = response.json()["choices"][0]["message"]["content"].strip()

    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {
            "name": "Producto no identificado",
            "category": "general",
            "brand": None,
            "search_query": "producto",
        }