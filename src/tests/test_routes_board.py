from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

VALID_URL = "https://plateau-route-3d-tcus2zi5tq-an.a.run.app/viewer/?p=eyJh"


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@patch("app.api.routes_board.verify_recaptcha")
@patch("app.api.routes_board.board_service")
def test_create_post_success(mock_svc: MagicMock, mock_recaptcha: MagicMock, client: TestClient) -> None:
    mock_svc.check_rate_limit.return_value = True
    mock_svc.create_post.return_value = "abc123"
    mock_svc.hash_ip.return_value = "hashed-ip"

    res = client.post(
        "/api/v1/board/posts",
        json={"title": "t", "presetUrl": VALID_URL, "recaptchaToken": "tok"},
    )
    assert res.status_code == 201
    assert res.json()["id"] == "abc123"
    mock_recaptcha.assert_called_once()


@patch("app.api.routes_board.verify_recaptcha")
def test_create_post_recaptcha_fails(mock_recaptcha: MagicMock, client: TestClient) -> None:
    from app.services.recaptcha_service import RecaptchaFailed
    mock_recaptcha.side_effect = RecaptchaFailed("score too low")

    res = client.post(
        "/api/v1/board/posts",
        json={"title": "t", "presetUrl": VALID_URL, "recaptchaToken": "tok"},
    )
    assert res.status_code == 403


@patch("app.api.routes_board.verify_recaptcha")
@patch("app.api.routes_board.board_service")
def test_create_post_rate_limited(mock_svc: MagicMock, mock_recaptcha: MagicMock, client: TestClient) -> None:
    mock_svc.check_rate_limit.return_value = False
    mock_svc.hash_ip.return_value = "h"

    res = client.post(
        "/api/v1/board/posts",
        json={"title": "t", "presetUrl": VALID_URL, "recaptchaToken": "tok"},
    )
    assert res.status_code == 429


def test_create_post_invalid_url(client: TestClient) -> None:
    res = client.post(
        "/api/v1/board/posts",
        json={"title": "t", "presetUrl": "https://example.com/", "recaptchaToken": "tok"},
    )
    # Pydantic validation failure -> 422
    assert res.status_code == 422


@patch("app.api.routes_board.board_service")
def test_list_posts_top(mock_svc: MagicMock, client: TestClient) -> None:
    mock_svc.list_posts.return_value = (
        [
            {
                "id": "1",
                "title": "t",
                "comment": None,
                "presetUrl": VALID_URL,
                "authorName": None,
                "likes": 5,
                "createdAt": datetime.now(timezone.utc),
                "status": "active",
            }
        ],
        None,
    )
    res = client.get("/api/v1/board/posts?sort=top&limit=5")
    assert res.status_code == 200
    body = res.json()
    assert len(body["posts"]) == 1
    assert body["posts"][0]["likes"] == 5
    mock_svc.list_posts.assert_called_once_with(sort="top", limit=5, cursor=None)


def test_list_posts_invalid_sort(client: TestClient) -> None:
    res = client.get("/api/v1/board/posts?sort=garbage")
    assert res.status_code == 400


@patch("app.api.routes_board.board_service")
def test_like_post(mock_svc: MagicMock, client: TestClient) -> None:
    mock_svc.like_post.return_value = {"likes": 6, "alreadyVoted": False}

    res = client.post("/api/v1/board/posts/abc/likes")
    assert res.status_code == 200
    body = res.json()
    assert body["likes"] == 6
    assert body["alreadyVoted"] is False
    # Cookie should be set on first call
    assert "arpd_aid" in res.cookies


@patch("app.api.routes_board.board_service")
def test_like_post_not_found(mock_svc: MagicMock, client: TestClient) -> None:
    mock_svc.like_post.side_effect = ValueError("post not found")

    res = client.post("/api/v1/board/posts/missing/likes")
    assert res.status_code == 404


@patch("app.api.routes_board.verify_recaptcha")
@patch("app.api.routes_board.board_service")
def test_create_post_composition_type(mock_board_service: MagicMock, mock_recaptcha: MagicMock, client: TestClient) -> None:
    mock_recaptcha.return_value = None
    mock_board_service.hash_ip.return_value = "h"
    mock_board_service.check_rate_limit.return_value = True
    mock_board_service.create_post.return_value = "doc-id-1"

    with patch("app.services.composition_service.mark_board_posted") as mock_mark:
        r = client.post("/api/v1/board/posts", json={
            "title": "comp post",
            "presetUrl": "https://x.com/creator/?id=abc12345",
            "recaptchaToken": "t",
            "postType": "composition",
            "compositionId": "abc12345",
        })
    assert r.status_code == 201
    kwargs = mock_board_service.create_post.call_args.kwargs
    assert kwargs["post_type"] == "composition"
    assert kwargs["composition_id"] == "abc12345"
