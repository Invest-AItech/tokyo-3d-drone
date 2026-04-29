"""Firestore I/O for the community board (Phase 2).

Exposes pure functions over the ``drone_posts`` and ``drone_rate_limits`` collections.
The Firestore client is lazily created and cached; tests should patch
``_get_client`` to inject a MagicMock.
"""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from google.cloud import firestore

from app.config import get_settings

logger = logging.getLogger(__name__)

_client_cache: Optional[firestore.Client] = None


def _get_client() -> firestore.Client:
    global _client_cache
    if _client_cache is None:
        project = get_settings().firestore_project
        _client_cache = firestore.Client(project=project) if project else firestore.Client()
    return _client_cache


def hash_ip(ip: str) -> str:
    """Hash an IP with the configured salt to a 12-char prefix.

    PII reduction: we only need rough uniqueness for rate limiting,
    not the original IP, so a truncated SHA-256 is sufficient.
    """
    salt = get_settings().ip_hash_salt
    raw = (ip + salt).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:12]


def check_rate_limit(ip_hash: str, *, window: int, max_posts: int) -> bool:
    """Return True if posting is allowed, False if rate-limited.

    Stores the recent post timestamps under ``rate_limits/{ip_hash}`` and
    prunes entries older than ``window`` seconds on every call.
    """
    db = _get_client()
    rl_ref = db.collection("drone_rate_limits").document(ip_hash)
    snap = rl_ref.get()
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(seconds=window)
    recent: list[datetime] = []
    if snap.exists:
        data = snap.to_dict() or {}
        for ts in data.get("recent", []):
            ts_aware = ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)
            if ts_aware > cutoff:
                recent.append(ts_aware)
    if len(recent) >= max_posts:
        return False
    recent.append(now)
    rl_ref.set({"recent": recent, "updatedAt": now}, merge=True)
    return True


def create_post(
    *,
    title: str,
    comment: Optional[str],
    author_name: Optional[str],
    preset_url: str,
    post_type: str = "preset",
    composition_id: Optional[str] = None,
) -> str:
    """Insert a new post and return the generated document ID."""
    db = _get_client()
    posts_ref = db.collection("drone_posts")
    now = datetime.now(timezone.utc)
    doc = {
        "title": title,
        "comment": comment,
        "authorName": author_name,
        "presetUrl": preset_url,
        "likes": 0,
        "createdAt": now,
        "updatedAt": now,
        "status": "active",
        "postType": post_type,
        "compositionId": composition_id,
    }
    _, ref = posts_ref.add(doc)
    return ref.id


def list_posts(
    *,
    sort: str,
    limit: int,
    cursor: Optional[str],
) -> tuple[list[dict], Optional[str]]:
    """List active posts ordered by ``sort`` ('top' = likes desc, 'recent' = createdAt desc)."""
    db = _get_client()
    posts_ref = db.collection("drone_posts")
    q = posts_ref.where("status", "==", "active")
    if sort == "top":
        q = q.order_by("likes", direction=firestore.Query.DESCENDING)
    else:
        q = q.order_by("createdAt", direction=firestore.Query.DESCENDING)
    q = q.limit(limit)
    if cursor:
        cursor_snap = posts_ref.document(cursor).get()
        if cursor_snap.exists:
            q = q.start_after(cursor_snap)
    docs = list(q.stream())
    posts: list[dict] = []
    last_id: Optional[str] = None
    for d in docs:
        data = d.to_dict() or {}
        data["id"] = d.id
        posts.append(data)
        last_id = d.id
    next_cursor = last_id if len(docs) == limit else None
    return posts, next_cursor


def like_post(post_id: str, *, anon_id: str) -> dict:
    """Increment the like count, refusing duplicate votes from the same anon_id.

    NOT atomic — two simultaneous votes from the same anon_id could both succeed
    in the brief window between the existence check and the writes. This is
    accepted: votes are advisory ranking signals on a public board.
    """
    db = _get_client()
    post_ref = db.collection("drone_posts").document(post_id)
    voter_ref = post_ref.collection("voters").document(anon_id)

    voter_snap = voter_ref.get()
    post_snap = post_ref.get()

    if not post_snap.exists:
        raise ValueError("post not found")

    post_data = post_snap.to_dict() or {}

    if voter_snap.exists:
        return {"likes": post_data.get("likes", 0), "alreadyVoted": True}

    now = datetime.now(timezone.utc)
    voter_ref.set({"votedAt": now})
    new_likes = post_data.get("likes", 0) + 1
    post_ref.update({"likes": new_likes, "updatedAt": now})
    return {"likes": new_likes, "alreadyVoted": False}


def hide_post(post_id: str) -> None:
    """Admin operation: mark a post as hidden (does not delete)."""
    db = _get_client()
    db.collection("drone_posts").document(post_id).update({"status": "hidden"})
