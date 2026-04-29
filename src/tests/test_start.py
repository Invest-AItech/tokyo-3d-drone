from fastapi.testclient import TestClient
from app.main import app


def test_start_redirects_to_firebase():
    """/start should 301 redirect to Firebase landing.

    The rich landing now lives on Firebase Hosting; /start is a
    redundant Cloud Run endpoint that catches manual visits and
    forwards users to the canonical Firebase URL.
    """
    client = TestClient(app, follow_redirects=False)
    r = client.get("/start")
    assert r.status_code == 301
    assert r.headers["location"] == "https://invest-aitech-tokyo-drone.web.app/"


def test_board_still_serves_landing_html():
    """/board still renders landing.html with data-page='board' (board lives on CR)."""
    client = TestClient(app)
    r = client.get("/board")
    assert r.status_code == 200
    assert "text/html" in r.headers["content-type"]
    assert 'data-page="board"' in r.text
