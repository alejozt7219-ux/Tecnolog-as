from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "pricevision",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.workers.tasks"],
)


celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="America/Bogota",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    broker_connection_retry_on_startup=True,
    # Usar nuestro scheduler personalizado que lee Redis en cada tick
    beat_scheduler="app.workers.redis_scheduler:RedisAwareScheduler",
    # FIX: No definir ningún beat_schedule estático aquí.
    # El RedisAwareScheduler construye la entrada "daily-scraping" dinámicamente
    # leyendo Redis, y por defecto lo arranca DESACTIVADO (enabled: false).
    # El admin lo activa explícitamente desde el panel → /admin/scraping/schedule
    beat_schedule={},
)

# ─── Notas sobre el arranque del demo ───────────────────────────────────────
# El scraping inicial de los 5 productos demo se dispara desde auth.py cuando
# se registra el primer admin, con un lock Redis (SET NX) que garantiza que
# solo ocurre una vez, evitando el doble disparo con el beat schedule.
#
# El scraping diario (run_daily_scraping) NO se ejecuta automáticamente hasta
# que el admin lo active desde el panel de configuración de schedule.
# Esto evita errores en entornos de desarrollo o despliegues sin scrapers listos.