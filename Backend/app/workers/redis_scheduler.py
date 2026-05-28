"""
RedisAwareScheduler — Celery Beat scheduler que re-lee el schedule
configurado por el admin desde Redis en cada ciclo (~30s).

FIX: El schedule diario arranca DESACTIVADO por defecto (enabled: false).
El admin debe activarlo explícitamente desde /admin/scraping/schedule.
"""
import json
import logging
from celery.beat import PersistentScheduler, ScheduleEntry
from celery.schedules import crontab

logger = logging.getLogger(__name__)

SCHEDULE_REDIS_KEY = "pricevision:scraping_schedule"
DAILY_TASK         = "app.workers.tasks.run_daily_scraping"
DAILY_ENTRY_NAME   = "daily-scraping"

# FIX: enabled: False por defecto → el scraping automático no corre hasta
# que el admin lo active explícitamente desde el panel.
SCHEDULE_DEFAULT = {"frequency": "daily", "hour": 8, "minute": 30, "enabled": False}


class RedisAwareScheduler(PersistentScheduler):

    _redis_check_interval = 30   # segundos entre lecturas de Redis
    _last_redis_check     = 0
    _last_sched_hash      = None

    def _get_redis_schedule(self):
        try:
            from app.core.config import settings
            import redis as redis_lib
            r = redis_lib.from_url(settings.REDIS_URL, decode_responses=True)
            raw = r.get(SCHEDULE_REDIS_KEY)
            if raw:
                return json.loads(raw)
        except Exception as e:
            logger.debug(f"[RedisScheduler] No se pudo leer Redis: {e}")
        # FIX: si no hay nada en Redis, el default es DESACTIVADO
        return SCHEDULE_DEFAULT

    def tick(self, *args, **kwargs):
        import time
        now = time.monotonic()
        if now - self._last_redis_check >= self._redis_check_interval:
            self._last_redis_check = now
            self._sync_from_redis()
        return super().tick(*args, **kwargs)

    def _sync_from_redis(self):
        sched = self._get_redis_schedule()
        sched_hash = f"{sched.get('enabled')}:{sched.get('hour')}:{sched.get('minute')}"
        if sched_hash == self._last_sched_hash:
            return
        self._last_sched_hash = sched_hash

        enabled = sched.get("enabled", False) and sched.get("frequency") != "disabled"
        hour    = int(sched.get("hour",   8))
        minute  = int(sched.get("minute", 30))

        if enabled:
            from datetime import datetime, timezone as _tz
            entry = ScheduleEntry(
                name         = DAILY_ENTRY_NAME,
                task         = DAILY_TASK,
                schedule     = crontab(hour=str(hour), minute=str(minute)),
                args         = (),
                kwargs       = {},
                options      = {},
                last_run_at  = datetime.now(_tz.utc),
                app          = self.app,
            )
            self.data[DAILY_ENTRY_NAME] = entry
            logger.info(f"[RedisScheduler] Schedule activado → {hour:02d}:{minute:02d} daily")
        else:
            if DAILY_ENTRY_NAME in self.data:
                del self.data[DAILY_ENTRY_NAME]
                logger.info("[RedisScheduler] Schedule diario desactivado.")

        self.sync()