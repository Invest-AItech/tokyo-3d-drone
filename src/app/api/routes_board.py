"""Community board API endpoints (Phase 2).

Endpoints:
- POST /board/posts          create a new post (reCAPTCHA + rate-limited)
- GET  /board/posts          list posts (top|recent)
- POST /board/posts/{id}/likes  vote (cookie-based dedup)
"""
from __future__ import annotations

import logging
import secrets
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Response, status

from app.config import get_settings
from app.core.board_models import LikeResponse, PostCreate, PostList
from app.services import board_service
from app.services.recaptcha_service import RecaptchaFailed, verify_recaptcha

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/board", tags=["board"])

ANON_COOKIE_NAME = "arpd_aid"
ANON_COOKIE_MAX_AGE = 60 * 60 * 24 * 365  # 1 year


def _ensure_anon_cookie(request: Request, response: Response) -> str:
    aid = request.cookies.get(ANON_COOKIE_NAME)
    if not aid:
        aid = secrets.token_urlsafe(16)
        response.set_cookie(
            ANON_COOKIE_NAME,
            aid,
            max_age=ANON_COOKIE_MAX_AGE,
            httponly=False,
            secure=True,
            samesite="lax",
            path="/",
        )
    return aid


def _client_ip(request: Request) -> str:
    """Cloud Run forwards real IP via X-Forwarded-For (first entry)."""
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "0.0.0.0"


@router.post("/posts", status_code=status.HTTP_201_CREATED)
def create_post(payload: PostCreate, request: Request, response: Response) -> dict:
    settings = get_settings()
    try:
        verify_recaptcha(
            payload.recaptchaToken,
            project_id=settings.firestore_project,
            site_key=settings.recaptcha_site_key,
            expected_action="post_preset",
            threshold=settings.recaptcha_score_threshold,
        )
    except RecaptchaFailed as e:
        logger.warning("recaptcha failed: %s", e)
        raise HTTPException(status_code=403, detail="reCAPTCHA verification failed")
    except Exception as e:  # network / unexpected
        logger.warning("recaptcha error: %s", e)
        raise HTTPException(status_code=403, detail="reCAPTCHA verification failed")

    ip_hash = board_service.hash_ip(_client_ip(request))
    if not board_service.check_rate_limit(
        ip_hash,
        window=settings.rate_limit_window_sec,
        max_posts=settings.rate_limit_max_posts,
    ):
        raise HTTPException(status_code=429, detail="too many posts, please wait")

    _ensure_anon_cookie(request, response)
    post_id = board_service.create_post(
        title=payload.title,
        comment=payload.comment,
        author_name=payload.authorName,
        preset_url=payload.presetUrl,
        post_type=payload.postType,
        composition_id=payload.compositionId,
    )

    if payload.postType == "composition" and payload.compositionId:
        try:
            from app.services import composition_service
            composition_service.mark_board_posted(payload.compositionId, post_id)
        except Exception as e:
            logger.warning("mark_board_posted failed: %s", e)

    return {"id": post_id}


@router.get("/posts", response_model=PostList)
def list_posts(
    sort: str = "top",
    limit: int = 20,
    cursor: Optional[str] = None,
) -> dict:
    if sort not in ("top", "recent"):
        raise HTTPException(status_code=400, detail="sort must be 'top' or 'recent'")
    limit = max(1, min(50, limit))
    posts, next_cursor = board_service.list_posts(sort=sort, limit=limit, cursor=cursor)
    return {"posts": posts, "nextCursor": next_cursor}


@router.post("/posts/{post_id}/likes", response_model=LikeResponse)
def like_post(post_id: str, request: Request, response: Response) -> dict:
    aid = _ensure_anon_cookie(request, response)
    try:
        return board_service.like_post(post_id, anon_id=aid)
    except ValueError:
        raise HTTPException(status_code=404, detail="post not found")
