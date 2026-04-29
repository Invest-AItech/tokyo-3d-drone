"""Pydantic models for the community board (Phase 2)."""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional
from urllib.parse import parse_qs, urlparse

from pydantic import BaseModel, Field, field_validator


class PostCreate(BaseModel):
    """Incoming POST /api/v1/board/posts payload."""

    title: str = Field(min_length=1, max_length=80)
    comment: Optional[str] = Field(default=None, max_length=500)
    authorName: Optional[str] = Field(default=None, max_length=20)
    presetUrl: str = Field(min_length=1, max_length=400)
    recaptchaToken: str = Field(min_length=1)
    postType: Literal["preset", "composition"] = "preset"
    compositionId: Optional[str] = Field(default=None, max_length=20)

    @field_validator("presetUrl")
    @classmethod
    def must_have_p_or_id_param(cls, v: str) -> str:
        u = urlparse(v)
        if not u.scheme or not u.netloc:
            raise ValueError("presetUrl must be an absolute URL")
        qs = parse_qs(u.query)
        has_p = "p" in qs and qs["p"][0]
        has_id = "id" in qs and qs["id"][0]
        if not (has_p or has_id):
            raise ValueError("presetUrl must contain ?p= (preset) or ?id= (composition) parameter")
        return v


class Post(BaseModel):
    """A board post as stored in / read from Firestore."""

    id: str
    title: str
    comment: Optional[str] = None
    presetUrl: str
    authorName: Optional[str] = None
    likes: int = 0
    createdAt: datetime
    status: Literal["active", "hidden"] = "active"
    postType: Literal["preset", "composition"] = "preset"
    compositionId: Optional[str] = None


class PostList(BaseModel):
    """Paginated list response."""

    posts: list[Post]
    nextCursor: Optional[str] = None


class LikeResponse(BaseModel):
    """POST /posts/{id}/likes response."""

    likes: int
    alreadyVoted: bool = False
