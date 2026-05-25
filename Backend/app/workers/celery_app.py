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
    timezone="America/Mexico_City",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    # Tareas programadas (scraping diario 08:30)
    beat_schedule={
        "daily-scraping": {
            "task": "app.workers.tasks.run_daily_scraping",
            "schedule": {"hour": 8, "minute": 30},
        }
    },
)
