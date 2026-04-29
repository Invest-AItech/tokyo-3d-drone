from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.core.board_models import LikeResponse, Post, PostCreate, PostList

VALID_URL = "https://plateau-route-3d-tcus2zi5tq-an.a.run.app/viewer/?p=eyJh"


def test_post_create_minimal_valid() -> None:
    p = PostCreate(title="t", presetUrl=VALID_URL, recaptchaToken="x")
    assert p.title == "t"
    assert p.comment is None
    assert p.authorName is None


def test_post_create_full() -> None:
    p = PostCreate(
        title="my preset",
        comment="nice",
        authorName="alice",
        presetUrl=VALID_URL,
        recaptchaToken="x",
    )
    assert p.comment == "nice"
    assert p.authorName == "alice"


def test_title_required() -> None:
    with pytest.raises(ValidationError):
        PostCreate(title="", presetUrl=VALID_URL, recaptchaToken="x")


def test_title_max_80() -> None:
    with pytest.raises(ValidationError):
        PostCreate(title="x" * 81, presetUrl=VALID_URL, recaptchaToken="x")


def test_comment_max_500() -> None:
    with pytest.raises(ValidationError):
        PostCreate(title="t", comment="x" * 501, presetUrl=VALID_URL, recaptchaToken="x")


def test_author_name_max_20() -> None:
    with pytest.raises(ValidationError):
        PostCreate(title="t", authorName="x" * 21, presetUrl=VALID_URL, recaptchaToken="x")


def test_preset_url_must_have_p_param() -> None:
    with pytest.raises(ValidationError):
        PostCreate(title="t", presetUrl="https://example.com/", recaptchaToken="x")


def test_preset_url_must_be_url() -> None:
    with pytest.raises(ValidationError):
        PostCreate(title="t", presetUrl="not-a-url", recaptchaToken="x")


def test_preset_url_max_400() -> None:
    long = "https://plateau-route-3d-tcus2zi5tq-an.a.run.app/viewer/?p=" + "a" * 400
    with pytest.raises(ValidationError):
        PostCreate(title="t", presetUrl=long, recaptchaToken="x")


def test_recaptcha_token_required() -> None:
    with pytest.raises(ValidationError):
        PostCreate(title="t", presetUrl=VALID_URL)


def test_post_serialization_keys() -> None:
    p = Post(
        id="abc",
        title="t",
        comment=None,
        presetUrl=VALID_URL,
        authorName=None,
        likes=0,
        createdAt=datetime.now(timezone.utc),
        status="active",
    )
    data = p.model_dump()
    assert data["id"] == "abc"
    assert data["status"] == "active"


def test_post_list_default_empty() -> None:
    pl = PostList(posts=[], nextCursor=None)
    assert pl.posts == []
    assert pl.nextCursor is None


def test_like_response_default() -> None:
    lr = LikeResponse(likes=5)
    assert lr.likes == 5
    assert lr.alreadyVoted is False


def test_post_create_accepts_composition_type() -> None:
    p = PostCreate(
        title="x",
        presetUrl="https://x.com/?id=abc12345",
        recaptchaToken="t",
        postType="composition",
        compositionId="abc12345",
    )
    assert p.postType == "composition"
    assert p.compositionId == "abc12345"


def test_post_create_defaults_to_preset() -> None:
    p = PostCreate(title="x", presetUrl="https://x.com/?p=ABC", recaptchaToken="t")
    assert p.postType == "preset"


def test_post_create_rejects_url_without_p_or_id() -> None:
    with pytest.raises(ValidationError):
        PostCreate(title="x", presetUrl="https://x.com/?other=1", recaptchaToken="t")


def test_post_create_invalid_post_type() -> None:
    with pytest.raises(ValidationError):
        PostCreate(
            title="x",
            presetUrl="https://x.com/?p=ABC",
            recaptchaToken="t",
            postType="invalid",
        )
