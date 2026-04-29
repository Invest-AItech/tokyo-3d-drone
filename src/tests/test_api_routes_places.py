import httpx
import respx
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app
from app.services.places_service import (
    PLACES_AUTOCOMPLETE_URL,
    PLACES_DETAILS_URL_TEMPLATE,
)


# ---- /api/v1/places/autocomplete ----


@respx.mock
def test_post_autocomplete_success(client: TestClient):
    respx.post(PLACES_AUTOCOMPLETE_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "suggestions": [
                    {
                        "placePrediction": {
                            "placeId": "p1",
                            "text": {"text": "Tokyo Station, Marunouchi"},
                            "structuredFormat": {
                                "mainText": {"text": "Tokyo Station"},
                                "secondaryText": {"text": "Marunouchi, Chiyoda City"},
                            },
                        }
                    }
                ]
            },
        )
    )
    res = client.post(
        "/api/v1/places/autocomplete",
        json={"query": "Tokyo Station", "locale": "en"},
    )
    assert res.status_code == 200
    body = res.json()
    assert len(body["predictions"]) == 1
    assert body["predictions"][0]["place_id"] == "p1"
    assert body["predictions"][0]["primary_text"] == "Tokyo Station"
    assert body["status"] == "ok"


@respx.mock
def test_post_autocomplete_out_of_range_when_only_unrestricted_has_results(client: TestClient):
    """1 回目 (BB あり) は 0 件、2 回目 (BB なし) で候補があれば status=out_of_range"""
    call_count = {"n": 0}

    def handler(request):
        import json
        body = json.loads(request.content.decode())
        call_count["n"] += 1
        # locationRestriction が付いている = 1 回目 (制限あり) → 0 件返却
        if "locationRestriction" in body:
            return httpx.Response(200, json={"suggestions": []})
        # 制限なし = 2 回目 (フォールバック) → 候補あり
        return httpx.Response(
            200,
            json={
                "suggestions": [
                    {
                        "placePrediction": {
                            "placeId": "p_sapporo",
                            "text": {"text": "Sapporo Station"},
                        }
                    }
                ]
            },
        )

    respx.post(PLACES_AUTOCOMPLETE_URL).mock(side_effect=handler)
    res = client.post(
        "/api/v1/places/autocomplete",
        json={"query": "Sapporo Station", "locale": "en"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["predictions"] == []
    assert body["status"] == "out_of_range"
    assert call_count["n"] == 2  # 制限あり + フォールバック


@respx.mock
def test_post_autocomplete_no_match_when_both_calls_return_empty(client: TestClient):
    """両方 0 件なら status=no_match"""
    respx.post(PLACES_AUTOCOMPLETE_URL).mock(
        return_value=httpx.Response(200, json={"suggestions": []})
    )
    res = client.post(
        "/api/v1/places/autocomplete",
        json={"query": "zzzzzzz", "locale": "en"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["predictions"] == []
    assert body["status"] == "no_match"


@respx.mock
def test_post_autocomplete_skips_fallback_when_primary_has_results(client: TestClient):
    """1 回目で候補があればフォールバック (2 回目) は呼ばない (コスト節約)"""
    call_count = {"n": 0}

    def handler(request):
        call_count["n"] += 1
        return httpx.Response(
            200,
            json={
                "suggestions": [
                    {"placePrediction": {"placeId": "p1", "text": {"text": "Tokyo Station"}}}
                ]
            },
        )

    respx.post(PLACES_AUTOCOMPLETE_URL).mock(side_effect=handler)
    res = client.post(
        "/api/v1/places/autocomplete",
        json={"query": "Tokyo Station", "locale": "en"},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "ok"
    assert call_count["n"] == 1  # フォールバック呼ばれない


def test_post_autocomplete_empty_query_returns_422(client: TestClient):
    res = client.post(
        "/api/v1/places/autocomplete",
        json={"query": "", "locale": "ja"},
    )
    assert res.status_code == 422


def test_post_autocomplete_unsupported_locale_returns_422(client: TestClient):
    res = client.post(
        "/api/v1/places/autocomplete",
        json={"query": "Tokyo", "locale": "zh"},
    )
    assert res.status_code == 422


@respx.mock
def test_post_autocomplete_quota_exceeded_returns_429(client: TestClient):
    respx.post(PLACES_AUTOCOMPLETE_URL).mock(
        return_value=httpx.Response(429, text="quota")
    )
    res = client.post(
        "/api/v1/places/autocomplete", json={"query": "x", "locale": "ja"},
    )
    assert res.status_code == 429


@respx.mock
def test_post_autocomplete_timeout_returns_504(client: TestClient):
    respx.post(PLACES_AUTOCOMPLETE_URL).mock(side_effect=httpx.ReadTimeout("t"))
    res = client.post(
        "/api/v1/places/autocomplete", json={"query": "x", "locale": "ja"},
    )
    assert res.status_code == 504


def test_post_autocomplete_missing_api_key_returns_500():
    no_key_settings = Settings(
        google_routes_api_key="x",
        google_places_api_key="",
    )
    app.dependency_overrides[get_settings] = lambda: no_key_settings
    try:
        client = TestClient(app)
        res = client.post(
            "/api/v1/places/autocomplete", json={"query": "x", "locale": "ja"},
        )
        assert res.status_code == 500
    finally:
        app.dependency_overrides.clear()


# ---- /api/v1/places/details ----


@respx.mock
def test_post_details_success_in_tokyo23(client: TestClient):
    place_id = "p1"
    respx.get(PLACES_DETAILS_URL_TEMPLATE.format(place_id=place_id)).mock(
        return_value=httpx.Response(
            200,
            json={
                "id": place_id,
                "displayName": {"text": "東京駅"},
                "formattedAddress": "千代田区",
                "location": {"latitude": 35.6812, "longitude": 139.7671},
            },
        )
    )
    res = client.post(
        "/api/v1/places/details",
        json={"place_id": place_id, "locale": "ja"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["display_name"] == "東京駅"
    assert body["lat"] == 35.6812
    assert body["lon"] == 139.7671
    assert body["in_tokyo23"] is True


@respx.mock
def test_post_details_success_outside_tokyo23(client: TestClient):
    place_id = "p2"
    respx.get(PLACES_DETAILS_URL_TEMPLATE.format(place_id=place_id)).mock(
        return_value=httpx.Response(
            200,
            json={
                "id": place_id,
                "displayName": {"text": "札幌駅"},
                "location": {"latitude": 43.0642, "longitude": 141.3469},
            },
        )
    )
    res = client.post(
        "/api/v1/places/details",
        json={"place_id": place_id, "locale": "ja"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["in_tokyo23"] is False


def test_post_details_empty_place_id_returns_422(client: TestClient):
    res = client.post(
        "/api/v1/places/details",
        json={"place_id": "", "locale": "ja"},
    )
    assert res.status_code == 422
