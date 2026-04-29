from fastapi.testclient import TestClient


def test_config_js_exposes_keys(monkeypatch):
    monkeypatch.setenv("MAPTILER_API_KEY", "mt-test-key")
    monkeypatch.setenv("RECAPTCHA_SITE_KEY", "rc-test-site")
    from app.config import get_settings
    get_settings.cache_clear()
    from app.main import app
    client = TestClient(app)
    r = client.get("/api/config.js")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/javascript")
    body = r.text
    assert "window.MAPTILER_KEY" in body
    assert "mt-test-key" in body
    assert "window.RECAPTCHA_SITE_KEY" in body
    assert "rc-test-site" in body


def test_config_js_has_no_store_cache():
    from app.config import get_settings
    get_settings.cache_clear()
    from app.main import app
    client = TestClient(app)
    r = client.get("/api/config.js")
    assert r.headers.get("cache-control") == "no-store"
