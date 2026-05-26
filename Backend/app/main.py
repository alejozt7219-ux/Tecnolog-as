from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.routes import auth, scan, admin

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url=None,
)

# En DEBUG se permiten todos los orígenes para desarrollo local.
# En producción CORS_ORIGINS debe definirse en el .env, por ejemplo:
# CORS_ORIGINS=https://mi-app.railway.app,https://mi-dominio.com
allowed_origins = ["*"] if settings.DEBUG else settings.CORS_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=not settings.DEBUG,  # credentials no es compatible con wildcard
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(scan.router)
app.include_router(admin.router)


@app.get("/health")
async def health():
    return {"status": "ok", "app": settings.APP_NAME}
