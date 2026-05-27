from celery import Celery
from celery.schedules import crontab
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
    beat_schedule={
        # Scraping diario a las 08:30
        "daily-scraping": {
            "task": "app.workers.tasks.run_daily_scraping",
            "schedule": crontab(hour=8, minute=30),
        },
        # Startup demo: corre 30s después de iniciar (una sola vez al día a las 00:01)
        # Para el verdadero startup, se llama desde main.py via on_after_finalize
        "startup-demo-daily": {
            "task": "app.workers.tasks.run_startup_demo_scraping",
            "schedule": crontab(hour=0, minute=1),
        },
    },
)


@celery_app.on_after_finalize.connect
def setup_periodic_tasks(sender, **kwargs):
    """Lanza el scraping de demos al iniciar el worker por primera vez."""
    import logging
    logger = logging.getLogger(__name__)
    try:
        from app.workers.tasks import run_startup_demo_scraping
        run_startup_demo_scraping.apply_async(countdown=15)
        logger.info("[Celery] Startup demo scraping programado en 15s.")
    except Exception as e:
        logger.warning(f"[Celery] No se pudo programar startup demo: {e}")
