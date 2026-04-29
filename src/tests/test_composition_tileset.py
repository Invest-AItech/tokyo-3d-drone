from unittest.mock import patch, MagicMock

from fastapi.testclient import TestClient

from app.main import app


@patch("app.api.routes_compositions.composition_service")
@patch("app.api.routes_compositions._get_tileset_service")
def test_composition_tileset_endpoint_invokes_corridor_pipeline(
    mock_get_service, mock_comp_service
):
    """composition の points が CorridorQuery に変換され既存 service.create_request に渡る。"""
    mock_comp_service.get_composition.return_value = {
        "id": "abc12345",
        "data": {
            "v": 1,
            "global": {"bufferM": 100, "lod": "lod2", "tau": 0.4, "lookaheadM": 30, "cornerRadiusM": 20},
            "points": [
                {"id": "A", "lon": 139.7, "lat": 35.6, "altM": 50, "pitchDeg": 0, "headingRelDeg": 0},
                {"id": "B", "lon": 139.71, "lat": 35.61, "altM": 50, "pitchDeg": 0, "headingRelDeg": 0},
            ],
            "segments": [{"from": "A", "to": "B", "speedKmh": 80}],
        },
    }
    mock_service = MagicMock()
    mock_get_service.return_value = mock_service
    mock_service.create_request.return_value = MagicMock(
        request_id="req-xyz",
        tileset_url="/runtime/requests/req-xyz/tileset.json",
        viewer_url="/viewer/?request_id=req-xyz",
    )

    client = TestClient(app)
    r = client.get("/api/v1/compositions/abc12345/tileset")
    assert r.status_code == 200
    body = r.json()
    assert body["tileset_url"].endswith("/tileset.json")

    # CorridorQuery が正しく構築されたことを確認
    payload = mock_service.create_request.call_args[0][0]
    assert payload.query.mode == "corridor"
    assert payload.query.radius_m == 100
    assert len(payload.query.points) == 2
    assert payload.query.points[0].lon == 139.7
    assert payload.query.points[0].lat == 35.6
    assert payload.lod_key == "lod2"


@patch("app.api.routes_compositions.composition_service")
def test_composition_tileset_404_for_missing_composition(mock_comp_service):
    mock_comp_service.get_composition.return_value = None
    client = TestClient(app)
    r = client.get("/api/v1/compositions/missing/tileset")
    assert r.status_code == 404


@patch("app.api.routes_compositions._get_tileset_service")
@patch("app.api.routes_compositions.board_service")
def test_preview_tileset_invokes_corridor_pipeline_without_persistence(
    mock_board_service, mock_get_service
):
    mock_board_service.hash_ip.return_value = "h"
    mock_board_service.check_rate_limit.return_value = True
    mock_service = MagicMock()
    mock_get_service.return_value = mock_service
    mock_service.create_request.return_value = MagicMock(
        request_id="req-preview", tileset_url="/runtime/requests/req-preview/tileset.json"
    )

    body = {
        "v": 1,
        "global": {"tau": 0.4, "lookaheadM": 30, "bufferM": 100, "lod": "lod2", "cornerRadiusM": 20},
        "points": [
            {"id": "A", "lon": 139.7, "lat": 35.6, "altM": 50, "pitchDeg": 0, "headingRelDeg": 0},
            {"id": "B", "lon": 139.71, "lat": 35.61, "altM": 50, "pitchDeg": 0, "headingRelDeg": 0},
        ],
        "segments": [{"from": "A", "to": "B", "speedKmh": 80}],
    }
    client = TestClient(app)
    r = client.post("/api/v1/compositions/preview-tileset", json=body)
    assert r.status_code == 200
    j = r.json()
    assert j["tileset_url"].endswith("/tileset.json")
    # composition は Firestore に書き込まれないことを暗黙的に確認（composition_service への呼び出しはなし）
    payload = mock_service.create_request.call_args[0][0]
    assert payload.query.mode == "corridor"
    assert payload.query.radius_m == 100
    assert len(payload.query.points) == 2


@patch("app.api.routes_compositions.board_service")
def test_preview_tileset_rate_limited(mock_board_service):
    mock_board_service.hash_ip.return_value = "h"
    mock_board_service.check_rate_limit.return_value = False
    body = {
        "v": 1,
        "global": {"tau": 0.4, "lookaheadM": 30, "bufferM": 100, "lod": "lod2", "cornerRadiusM": 20},
        "points": [
            {"id": "A", "lon": 139.7, "lat": 35.6, "altM": 50, "pitchDeg": 0, "headingRelDeg": 0},
            {"id": "B", "lon": 139.71, "lat": 35.61, "altM": 50, "pitchDeg": 0, "headingRelDeg": 0},
        ],
        "segments": [{"from": "A", "to": "B", "speedKmh": 80}],
    }
    client = TestClient(app)
    r = client.post("/api/v1/compositions/preview-tileset", json=body)
    assert r.status_code == 429
