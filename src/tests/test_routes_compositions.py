from unittest.mock import patch, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.main import app


VALID_BODY = {
    "v": 1,
    "name": "test",
    "global": {"tau": 0.4, "lookaheadM": 30, "bufferM": 100, "lod": "lod2", "cornerRadiusM": 20},
    "points": [
        {"id": "A", "lon": 139.7, "lat": 35.6, "altM": 50, "pitchDeg": -10, "headingRelDeg": 0},
        {"id": "B", "lon": 139.71, "lat": 35.61, "altM": 60, "pitchDeg": -10, "headingRelDeg": 0},
    ],
    "segments": [{"from": "A", "to": "B", "speedKmh": 80}],
    "recaptchaToken": "dummy-token",
}


@patch("app.api.routes_compositions.composition_service")
@patch("app.api.routes_compositions.board_service")
@patch("app.api.routes_compositions.verify_recaptcha")
def test_post_composition_returns_id_and_url(
    mock_recaptcha, mock_board_service, mock_comp_service
):
    mock_recaptcha.return_value = None
    mock_board_service.hash_ip.return_value = "h"
    mock_board_service.check_rate_limit.return_value = True
    mock_comp_service.save_composition.return_value = "abc12345"

    client = TestClient(app)
    r = client.post("/api/v1/compositions", json=VALID_BODY)
    assert r.status_code == 201
    body = r.json()
    assert body["id"] == "abc12345"
    assert "/viewer/?id=abc12345" in body["url"]


@patch("app.api.routes_compositions.composition_service")
@patch("app.api.routes_compositions.board_service")
@patch("app.api.routes_compositions.verify_recaptcha")
def test_post_invalid_payload_returns_422(
    mock_recaptcha, mock_board_service, mock_comp_service
):
    mock_recaptcha.return_value = None
    mock_board_service.hash_ip.return_value = "h"
    mock_board_service.check_rate_limit.return_value = True

    bad = dict(VALID_BODY)
    bad["points"] = [bad["points"][0]]  # 1 点のみ
    bad["segments"] = []

    client = TestClient(app)
    r = client.post("/api/v1/compositions", json=bad)
    assert r.status_code == 422


@patch("app.api.routes_compositions.verify_recaptcha")
def test_post_recaptcha_failure_returns_403(mock_recaptcha):
    from app.services.recaptcha_service import RecaptchaFailed
    mock_recaptcha.side_effect = RecaptchaFailed("low score")

    client = TestClient(app)
    r = client.post("/api/v1/compositions", json=VALID_BODY)
    assert r.status_code == 403


@patch("app.api.routes_compositions.composition_service")
def test_get_composition_returns_data(mock_comp_service):
    mock_comp_service.get_composition.return_value = {
        "id": "abc12345",
        "data": {"v": 1, "name": "x", "points": [], "segments": [], "global": {}},
    }
    client = TestClient(app)
    r = client.get("/api/v1/compositions/abc12345")
    assert r.status_code == 200
    body = r.json()
    assert body["v"] == 1
    assert body["name"] == "x"
    assert "_doc" in body  # サーバ側で挿入される


@patch("app.api.routes_compositions.composition_service")
def test_get_missing_returns_404(mock_comp_service):
    mock_comp_service.get_composition.return_value = None
    client = TestClient(app)
    r = client.get("/api/v1/compositions/missing")
    assert r.status_code == 404
