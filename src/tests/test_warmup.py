from fastapi.testclient import TestClient
from app.main import app


def test_warmup_returns_warmed():
    client = TestClient(app)
    r = client.get("/warmup")
    assert r.status_code == 200
    assert r.json() == {"status": "warmed"}
