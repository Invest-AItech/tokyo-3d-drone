"""Firestore I/O for Creator Mode compositions.

Pattern follows board_service.py: lazy-cached Firestore client, mockable
via _get_client patching.
"""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timezone
from typing import Any, Optional

from google.cloud import firestore

from app.config import get_settings

logger = logging.getLogger(__name__)

_client_cache: Optional[firestore.Client] = None
_COLLECTION = "compositions"
_ID_BYTES = 6  # secrets.token_urlsafe(6) → 8 文字
_MAX_RETRY = 5


def _get_client() -> firestore.Client:
    global _client_cache
    if _client_cache is None:
        project = get_settings().firestore_project
        _client_cache = firestore.Client(project=project) if project else firestore.Client()
    return _client_cache


def _generate_unique_ref(db: firestore.Client):
    """Generate a short id and return (id, DocumentReference), retrying on collision."""
    for _ in range(_MAX_RETRY):
        candidate = secrets.token_urlsafe(_ID_BYTES)
        ref = db.collection(_COLLECTION).document(candidate)
        if not ref.get().exists:
            return candidate, ref
    raise RuntimeError(f"failed to generate unique composition id after {_MAX_RETRY} retries")


def save_composition(
    *,
    data: dict[str, Any],
    ip_hash: str,
    name: Optional[str] = None,
) -> str:
    """Persist a composition document and return its short id."""
    db = _get_client()
    new_id, ref = _generate_unique_ref(db)
    now = datetime.now(timezone.utc)
    doc = {
        "id": new_id,
        "v": data.get("v", 1),
        "name": name or data.get("name"),
        "author": data.get("author"),
        "data": data,
        "createdAt": now,
        "updatedAt": now,
        "ipHash": ip_hash,
        "status": "active",
        "boardPostId": None,
    }
    ref.set(doc)
    return new_id


def get_composition(composition_id: str) -> Optional[dict[str, Any]]:
    """Return the composition doc or None if missing/deleted."""
    db = _get_client()
    snap = db.collection(_COLLECTION).document(composition_id).get()
    if not snap.exists:
        return None
    doc = snap.to_dict() or {}
    if doc.get("status") == "deleted":
        return None
    return doc


def mark_board_posted(composition_id: str, post_id: str) -> None:
    """Link this composition to a board post."""
    db = _get_client()
    db.collection(_COLLECTION).document(composition_id).update({
        "boardPostId": post_id,
        "updatedAt": datetime.now(timezone.utc),
    })


def soft_delete(composition_id: str) -> None:
    """Admin operation: logical delete."""
    db = _get_client()
    db.collection(_COLLECTION).document(composition_id).update({"status": "deleted"})
