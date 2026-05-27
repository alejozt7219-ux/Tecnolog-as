import base64
import json
import httpx

from app.core.config import settings


IDENTIFY_PROMPT = """
Eres un sistema experto en identificación EXACTA de productos para e-commerce colombiano.

Tu trabajo NO es describir productos.
Tu trabajo es identificar el modelo COMERCIAL EXACTO.

Debes actuar como:
- experto en catálogos de marcas
- experto en referencias comerciales
- experto en productos tecnológicos y moda
- experto en listings de Mercado Libre, Amazon y Alkosto

OBJETIVO:
Identificar el producto MÁS ESPECÍFICO posible.

IMPORTANTE:
- NO simplifiques modelos
- NO reduzcas variantes
- NO uses nombres genéricos
- NO inventes información que no sea visible o altamente probable
- SI hay varias posibilidades, elige la MÁS específica compatible con la imagen

EJEMPLOS CORRECTOS:
- "iPhone 17 Pro Max"
- "Nike Air Force 1 Low White"
- "Samsung Galaxy S24 Ultra 256GB"
- "Sony WH-1000XM5"
- "Apple Watch Series 9 45mm"

EJEMPLOS INCORRECTOS:
- "iPhone"
- "Nike shoes"
- "Samsung phone"
- "Headphones"
- "Smartwatch"

REGLAS CRÍTICAS:

1. SI EL MODELO EXACTO ES VISIBLE:
Debes devolver EXACTAMENTE ese modelo.

2. SI UNA VARIANTE ES VISUALMENTE DISTINGUIBLE:
Inclúyela.

Ejemplos:
- Pro
- Pro Max
- Ultra
- Plus
- Low
- High
- Mid
- 256GB
- 45mm
- colores distintivos

3. NO OMITAS:
- sufijos
- tamaños
- variantes
- referencias
- generaciones

4. PARA ZAPATILLAS:
Identifica:
- línea exacta
- edición
- tipo Low/Mid/High
- colorway si es reconocible

5. PARA CELULARES:
Identifica:
- modelo exacto
- variante Pro/Ultra/Max
- generación correcta

6. PARA ELECTRÓNICOS:
Incluye:
- referencia exacta
- versión específica

7. SI NO ESTÁS COMPLETAMENTE SEGURO:
Usa el modelo MÁS probable visualmente,
pero nunca inventes referencias imposibles.

8. EL search_query DEBE SER:
- ultra específico
- optimizado para scraping en Colombia
- máximo 8 palabras
- incluir marca + modelo + variante exacta

9. RESPONDE SOLO JSON VÁLIDO.

Formato obligatorio:
{
  "name": "nombre comercial exacto",
  "category": "categoría específica",
  "brand": "marca exacta o null",
  "model": "modelo exacto o null",
  "search_query": "query exacto optimizado"
}
"""


async def identify_product_from_image(
    image_bytes: bytes,
    media_type: str = "image/jpeg"
) -> dict:

    image_data = base64.b64encode(image_bytes).decode("utf-8")

    payload = {
        "model": "meta-llama/llama-4-scout-17b-16e-instruct",

        # MÁS PRECISIÓN
        "temperature": 0,
        "top_p": 0.1,

        # SUFICIENTE PARA JSON
        "max_tokens": 250,

        # FORZAR JSON
        "response_format": {
            "type": "json_object"
        },

        "messages": [

            # SYSTEM PROMPT
            {
                "role": "system",
                "content": (
                    "Eres un sistema experto en identificación "
                    "exacta de productos. "
                    "Responde únicamente JSON válido."
                ),
            },

            # FEW SHOT EXAMPLE 1
            {
                "role": "assistant",
                "content": """
{
  "name": "Nike Air Force 1 Low White",
  "category": "zapatillas",
  "brand": "Nike",
  "model": "Air Force 1 Low",
  "search_query": "Nike Air Force 1 Low White"
}
"""
            },

            # FEW SHOT EXAMPLE 2
            {
                "role": "assistant",
                "content": """
{
  "name": "iPhone 15 Pro Max",
  "category": "smartphone",
  "brand": "Apple",
  "model": "iPhone 15 Pro Max",
  "search_query": "iPhone 15 Pro Max"
}
"""
            },

            # USER INPUT
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

        data = json.loads(raw)

        name = data.get("name") or "Producto no identificado"
        brand = data.get("brand")
        model = data.get("model")

        # SI search_query VIENE MALO, LO RECONSTRUIMOS
        search_query = data.get("search_query")

        if not search_query or len(search_query.strip()) < 3:

            if brand and model:
                search_query = f"{brand} {model}"

            elif name:
                search_query = name

            else:
                search_query = "producto"

        return {
            "name": name,
            "category": data.get("category") or "general",
            "brand": brand,
            "model": model,
            "search_query": search_query[:80],
        }

    except Exception as e:

        print("ERROR PARSEANDO JSON:", e)
        print("RAW RESPONSE:", raw)

        return {
            "name": "Producto no identificado",
            "category": "general",
            "brand": None,
            "model": None,
            "search_query": "producto",
        }