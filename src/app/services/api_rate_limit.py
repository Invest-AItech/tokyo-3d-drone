"""App-side rate limits for the paid Google API proxies (/places/*).

Per-IP limits (short window + 1 day) and a per-service daily total are kept in
Firestore (same ``recent``-timestamps scheme as ``board_service.check_rate_limit``).
If Firestore is unavailable we fall back to an in-memory counter (per instance)
instead of failing open or closed.

The check must run BEFORE calling Google: a call that is counted afterwards
would not stop anything.
"""
from __future__ import annotations

import logging
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request
from google.cloud import firestore

from app.config import Settings
from app.services import board_service

logger = logging.getLogger(__name__)

COLLECTION = "drone_api_rate_limits"
DAY_SEC = 24 * 60 * 60
RATE_LIMIT_MESSAGE = "混み合っています。しばらくしてからお試しください。"
_MEM_MAX_KEYS = 50_000

_mem_lock = threading.Lock()
_mem_ip: dict[str, list[datetime]] = {}
_mem_global: dict[str, int] = {}


@dataclass(frozen=True)
class Limits:
    window_max: int
    day_max: int
    global_day_max: int


def client_ip(request: Request) -> str:
    """Cloud Run (direct, no proxy in front) appends the client IP to the END of
    X-Forwarded-For; earlier entries are client-supplied and can be forged."""
    xff = request.headers.get("x-forwarded-for", "")
    parts = [p.strip() for p in xff.split(",") if p.strip()]
    if parts:
        return parts[-1]
    return request.client.host if request.client else "0.0.0.0"


def limits_for(settings: Settings, scope: str) -> Limits:
    table = {
        "autocomplete": Limits(
            settings.rl_autocomplete_window_max,
            settings.rl_autocomplete_day_max,
            settings.rl_autocomplete_global_day_max,
        ),
        "details": Limits(
            settings.rl_details_window_max,
            settings.rl_details_day_max,
            settings.rl_details_global_day_max,
        ),
    }
    return table[scope]


def _get_client() -> firestore.Client:
    return board_service._get_client()


def _aware(ts: datetime) -> datetime:
    return ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)


def _decide(recent: list[datetime], now: datetime, window_sec: int, limits: Limits) -> bool:
    """Per-IP decision on already day-pruned timestamps."""
    if len(recent) >= limits.day_max:
        return False
    cutoff = now - timedelta(seconds=window_sec)
    return sum(1 for ts in recent if ts > cutoff) < limits.window_max


def _check_firestore(
    scope: str, ip_hash: str, now: datetime, window_sec: int, limits: Limits
) -> bool:
    db = _get_client()
    ip_ref = db.collection(COLLECTION).document(f"{scope}_{ip_hash}")
    glb_ref = db.collection(COLLECTION).document(f"global_{scope}_{now:%Y%m%d}")

    day_cutoff = now - timedelta(seconds=DAY_SEC)
    snap = ip_ref.get()
    recent: list[datetime] = []
    if snap.exists:
        for ts in (snap.to_dict() or {}).get("recent", []):
            ts = _aware(ts)
            if ts > day_cutoff:
                recent.append(ts)
    if not _decide(recent, now, window_sec, limits):
        return False

    gsnap = glb_ref.get()
    count = int((gsnap.to_dict() or {}).get("count", 0)) if gsnap.exists else 0
    if count >= limits.global_day_max:
        return False

    recent.append(now)
    ip_ref.set({"recent": recent, "updatedAt": now}, merge=True)
    glb_ref.set({"count": firestore.Increment(1), "updatedAt": now}, merge=True)
    return True


def _check_memory(
    scope: str, ip_hash: str, now: datetime, window_sec: int, limits: Limits
) -> bool:
    day_cutoff = now - timedelta(seconds=DAY_SEC)
    ip_key = f"{scope}_{ip_hash}"
    glb_key = f"global_{scope}_{now:%Y%m%d}"
    with _mem_lock:
        if len(_mem_ip) > _MEM_MAX_KEYS:
            _mem_ip.clear()
        if len(_mem_global) > 1000:
            _mem_global.clear()
        recent = [ts for ts in _mem_ip.get(ip_key, []) if ts > day_cutoff]
        if not _decide(recent, now, window_sec, limits):
            _mem_ip[ip_key] = recent
            return False
        if _mem_global.get(glb_key, 0) >= limits.global_day_max:
            _mem_ip[ip_key] = recent
            return False
        recent.append(now)
        _mem_ip[ip_key] = recent
        _mem_global[glb_key] = _mem_global.get(glb_key, 0) + 1
        return True


def reset_memory_state() -> None:
    """Test helper."""
    with _mem_lock:
        _mem_ip.clear()
        _mem_global.clear()


def enforce_rate_limit(request: Request, scope: str, settings: Settings) -> None:
    """Count one call to ``scope``; raise HTTP 429 if a limit is exceeded."""
    if not settings.api_rate_limit_enabled:
        return
    limits = limits_for(settings, scope)
    window_sec = settings.api_rate_limit_window_sec
    ip_hash = board_service.hash_ip(client_ip(request))
    now = datetime.now(timezone.utc)
    try:
        allowed = _check_firestore(scope, ip_hash, now, window_sec, limits)
    except Exception as exc:  # Firestore down / no credentials: degrade to per-instance
        logger.warning("api rate limit: firestore unavailable (%s); using memory", exc)
        allowed = _check_memory(scope, ip_hash, now, window_sec, limits)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=RATE_LIMIT_MESSAGE,
            headers={"Retry-After": str(window_sec)},
        )
