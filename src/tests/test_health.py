from fastapi.testclient import TestClient
from app.main import app


def test_health_returns_ok():
    client = TestClient(app)
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_healthz_does_not_exist():
    """/healthz は GFE intercept されるので使わない。アプリは 404 を返す。"""
    client = TestClient(app)
    r = client.get("/healthz")
    assert r.status_code == 404
