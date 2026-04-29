from fastapi.testclient import TestClient
from app.main import app


def test_start_returns_landing_html():
    """/start should serve landing.html with data-page='start'."""
    client = TestClient(app)
    r = client.get("/start")
    assert r.status_code == 200
    assert "text/html" in r.headers["content-type"]
    # Verify landing structure was returned (not, e.g., a 404 fallback)
    assert "<html" in r.text.lower()
    # data-page injection must mark this as start mode
    assert 'data-page="start"' in r.text


def test_start_uses_same_landing_as_board_with_different_page_mode():
    """/start and /board both render the same source HTML but with different data-page."""
    client = TestClient(app)
    start_r = client.get("/start")
    board_r = client.get("/board")
    assert start_r.status_code == 200
    assert board_r.status_code == 200
    assert 'data-page="start"' in start_r.text
    assert 'data-page="board"' in board_r.text
