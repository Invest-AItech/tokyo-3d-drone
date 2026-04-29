from fastapi.testclient import TestClient
from app.main import app


def test_root_redirects_to_firebase():
    client = TestClient(app, follow_redirects=False)
    r = client.get("/")
    assert r.status_code == 301
    assert r.headers["location"] == "https://invest-aitech-tokyo-drone.web.app/"
