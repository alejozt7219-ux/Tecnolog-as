"""
Helpers para registrar eventos en activity_logs.
Usa sesión síncrona (para Celery tasks) o asíncrona (para rutas FastAPI).
"""
from __future__ import annotations
import logging
from typing import Optional

logger = logging.getLogger(__name__)


# ── Versión ASYNC (para rutas FastAPI) ───────────────────────────────────────

async def log_event_async(
    db,
    event_type: str,
    *,
    actor_id: Optional[int] = None,
    actor_name: Optional[str] = None,
    actor_role: Optional[str] = None,
    detail: Optional[str] = None,
    query: Optional[str] = None,
    task_id: Optional[str] = None,
):
    """Inserta una fila en activity_logs usando una sesión AsyncSession."""
    try:
        from app.models.product import ActivityLog, ActivityEventType
        entry = ActivityLog(
            event_type=ActivityEventType(event_type),
            actor_id=actor_id,
            actor_name=actor_name,
            actor_role=actor_role,
            detail=detail,
            query=query,
            task_id=task_id,
        )
        db.add(entry)
        await db.commit()
    except Exception as exc:
        logger.warning(f"[activity_log] No se pudo registrar evento {event_type}: {exc}")


# ── Versión SYNC (para Celery tasks) ─────────────────────────────────────────

def log_event_sync(
    db,
    event_type: str,
    *,
    actor_id: Optional[int] = None,
    actor_name: Optional[str] = None,
    actor_role: Optional[str] = None,
    detail: Optional[str] = None,
    query: Optional[str] = None,
    task_id: Optional[str] = None,
):
    """Inserta una fila en activity_logs usando una sesión síncrona (Session de SQLAlchemy)."""
    try:
        from app.models.product import ActivityLog, ActivityEventType
        entry = ActivityLog(
            event_type=ActivityEventType(event_type),
            actor_id=actor_id,
            actor_name=actor_name,
            actor_role=actor_role,
            detail=detail,
            query=query,
            task_id=task_id,
        )
        db.add(entry)
        db.commit()
    except Exception as exc:
        logger.warning(f"[activity_log] No se pudo registrar evento {event_type}: {exc}")
