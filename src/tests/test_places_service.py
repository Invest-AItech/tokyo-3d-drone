import json

import httpx
import pytest
import respx

from app.core.places_models import is_in_tokyo23_bbox
from app.services.places_service import (
    PLACES_AUTOCOMPLETE_URL,
    PLACES_DETAILS_URL_TEMPLATE,
    PlacesAPIError,
    PlacesAPITimeout,
    PlacesQuotaExceededError,
    autocomplete,
    get_place_details,
)


# ---- bounding-box helper ----


def test_is_in_tokyo23_bbox_tokyo_station_inside():
    assert is_in_tokyo23_bbox(35.6812, 139.7671) is True


def test_is_in_tokyo23_bbox_hokkaido_outside():
    assert is_in_tokyo23_bbox(43.0642, 141.3469) is False


def test_is_in_tokyo23_bbox_okinawa_outside():
    assert is_in_tokyo23_bbox(26.2123, 127.6792) is False


def test_is_in_tokyo23_bbox_osaka_outside():
    assert is_in_tokyo23_bbox(34.6937, 135.5023) is False


def test_is_in_tokyo23_bbox_corner_low_inclusive():
    assert is_in_tokyo23_bbox(35.50, 139.55) is True


def test_is_in_tokyo23_bbox_corner_high_inclusive():
    assert is_in_tokyo23_bbox(35.82, 139.92) is True


# ---- autocomplete ----


@respx.mock
def test_autocomplete_returns_predictions_with_structured_format():
    respx.post(PLACES_AUTOCOMPLETE_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "suggestions": [
                    {
                        "placePrediction": {
                            "placeId": "ChIJtokyostation",
                            "text": {"text": "Tokyo Station, 1 Chome-9 Marunouchi"},
                            "structuredFormat": {
                                "mainText": {"text": "Tokyo Station"},
                                "secondaryText": {"text": "1 Chome-9 Marunouchi, Chiyoda City"},
                            },
                        }
                    }
                ]
            },
        )
    )
    predictions = autocomplete(
        query="Tokyo Station",
        locale="en",
        api_key="test-key",
        timeout_s=5.0,
    )
    assert len(predictions) == 1
    assert predictions[0].place_id == "ChIJtokyostation"
    assert predictions[0].primary_text == "Tokyo Station"
    assert predictions[0].secondary_text == "1 Chome-9 Marunouchi, Chiyoda City"
    assert "Tokyo Station" in predictions[0].full_text


@respx.mock
def test_autocomplete_falls_back_to_full_text_when_structured_missing():
    respx.post(PLACES_AUTOCOMPLETE_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "suggestions": [
                    {
                        "placePrediction": {
                            "placeId": "abc123",
                            "text": {"text": "Some Place"},
                        }
                    }
                ]
            },
        )
    )
    predictions = autocomplete(
        query="some", locale="ja", api_key="k", timeout_s=5.0,
    )
    assert len(predictions) == 1
    assert predictions[0].primary_text == "Some Place"
    assert predictions[0].secondary_text == ""


@respx.mock
def test_autocomplete_skips_predictions_without_place_id():
    respx.post(PLACES_AUTOCOMPLETE_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "suggestions": [
                    {"placePrediction": {"text": {"text": "no id"}}},
                    {"placePrediction": {"placeId": "xyz", "text": {"text": "ok"}}},
                ]
            },
        )
    )
    predictions = autocomplete(query="x", locale="ja", api_key="k", timeout_s=5.0)
    assert len(predictions) == 1
    assert predictions[0].place_id == "xyz"


@respx.mock
def test_autocomplete_empty_suggestions_returns_empty_list():
    respx.post(PLACES_AUTOCOMPLETE_URL).mock(
        return_value=httpx.Response(200, json={"suggestions": []})
    )
    predictions = autocomplete(query="zzz", locale="ja", api_key="k", timeout_s=5.0)
    assert predictions == []


@respx.mock
def test_autocomplete_sends_location_restriction_for_tokyo23():
    captured = {}

    def handler(request):
        captured["body"] = json.loads(request.content.decode())
        return httpx.Response(200, json={"suggestions": []})

    respx.post(PLACES_AUTOCOMPLETE_URL).mock(side_effect=handler)
    autocomplete(query="x", locale="ja", api_key="k", timeout_s=5.0)
    body = captured["body"]
    assert body["locationRestriction"]["rectangle"]["low"]["latitude"] == 35.50
    assert body["locationRestriction"]["rectangle"]["low"]["longitude"] == 139.55
    assert body["locationRestriction"]["rectangle"]["high"]["latitude"] == 35.82
    assert body["locationRestriction"]["rectangle"]["high"]["longitude"] == 139.92
    assert body["regionCode"] == "JP"


@respx.mock
def test_autocomplete_omits_location_restriction_when_unrestricted():
    """restrict_to_tokyo23=False なら locationRestriction を body に含めない"""
    captured = {}

    def handler(request):
        captured["body"] = json.loads(request.content.decode())
        return httpx.Response(200, json={"suggestions": []})

    respx.post(PLACES_AUTOCOMPLETE_URL).mock(side_effect=handler)
    autocomplete(query="x", locale="ja", api_key="k", timeout_s=5.0, restrict_to_tokyo23=False)
    assert "locationRestriction" not in captured["body"]
    assert captured["body"]["regionCode"] == "JP"  # regionCode は維持


@respx.mock
def test_autocomplete_passes_locale_as_languageCode():
    captured = {}

    def handler(request):
        captured["body"] = json.loads(request.content.decode())
        return httpx.Response(200, json={"suggestions": []})

    respx.post(PLACES_AUTOCOMPLETE_URL).mock(side_effect=handler)
    autocomplete(query="tokyo", locale="en", api_key="k", timeout_s=5.0)
    assert captured["body"]["languageCode"] == "en"


@respx.mock
def test_autocomplete_includes_session_token_when_provided():
    captured = {}

    def handler(request):
        captured["body"] = json.loads(request.content.decode())
        return httpx.Response(200, json={"suggestions": []})

    respx.post(PLACES_AUTOCOMPLETE_URL).mock(side_effect=handler)
    autocomplete(query="x", locale="ja", api_key="k", timeout_s=5.0, session_token="abc")
    assert captured["body"]["sessionToken"] == "abc"


@respx.mock
def test_autocomplete_omits_session_token_when_absent():
    captured = {}

    def handler(request):
        captured["body"] = json.loads(request.content.decode())
        return httpx.Response(200, json={"suggestions": []})

    respx.post(PLACES_AUTOCOMPLETE_URL).mock(side_effect=handler)
    autocomplete(query="x", locale="ja", api_key="k", timeout_s=5.0)
    assert "sessionToken" not in captured["body"]


@respx.mock
def test_autocomplete_429_raises_quota_error():
    respx.post(PLACES_AUTOCOMPLETE_URL).mock(return_value=httpx.Response(429, text="rate limit"))
    with pytest.raises(PlacesQuotaExceededError):
        autocomplete(query="x", locale="ja", api_key="k", timeout_s=5.0)


@respx.mock
def test_autocomplete_500_raises_api_error():
    respx.post(PLACES_AUTOCOMPLETE_URL).mock(return_value=httpx.Response(500, text="oops"))
    with pytest.raises(PlacesAPIError):
        autocomplete(query="x", locale="ja", api_key="k", timeout_s=5.0)


@respx.mock
def test_autocomplete_timeout_raises_timeout_error():
    respx.post(PLACES_AUTOCOMPLETE_URL).mock(side_effect=httpx.ReadTimeout("timeout"))
    with pytest.raises(PlacesAPITimeout):
        autocomplete(query="x", locale="ja", api_key="k", timeout_s=0.1)


# ---- get_place_details ----


@respx.mock
def test_get_place_details_returns_in_tokyo23_true_for_tokyo_station():
    place_id = "ChIJtokyostation"
    respx.get(PLACES_DETAILS_URL_TEMPLATE.format(place_id=place_id)).mock(
        return_value=httpx.Response(
            200,
            json={
                "id": place_id,
                "displayName": {"text": "東京駅"},
                "formattedAddress": "日本、〒100-0005 東京都千代田区丸の内１丁目",
                "location": {"latitude": 35.6812, "longitude": 139.7671},
            },
        )
    )
    details = get_place_details(
        place_id=place_id, locale="ja", api_key="k", timeout_s=5.0,
    )
    assert details.place_id == place_id
    assert details.display_name == "東京駅"
    assert details.lat == pytest.approx(35.6812)
    assert details.lon == pytest.approx(139.7671)
    assert details.in_tokyo23 is True


@respx.mock
def test_get_place_details_returns_in_tokyo23_false_for_outside():
    place_id = "ChIJhokkaido"
    respx.get(PLACES_DETAILS_URL_TEMPLATE.format(place_id=place_id)).mock(
        return_value=httpx.Response(
            200,
            json={
                "id": place_id,
                "displayName": {"text": "札幌駅"},
                "formattedAddress": "北海道札幌市",
                "location": {"latitude": 43.0642, "longitude": 141.3469},
            },
        )
    )
    details = get_place_details(
        place_id=place_id, locale="ja", api_key="k", timeout_s=5.0,
    )
    assert details.in_tokyo23 is False


@respx.mock
def test_get_place_details_missing_location_raises():
    place_id = "ChIJnoloc"
    respx.get(PLACES_DETAILS_URL_TEMPLATE.format(place_id=place_id)).mock(
        return_value=httpx.Response(
            200, json={"id": place_id, "displayName": {"text": "x"}}
        )
    )
    with pytest.raises(PlacesAPIError):
        get_place_details(place_id=place_id, locale="ja", api_key="k", timeout_s=5.0)


@respx.mock
def test_get_place_details_429_raises_quota_error():
    place_id = "ChIJany"
    respx.get(PLACES_DETAILS_URL_TEMPLATE.format(place_id=place_id)).mock(
        return_value=httpx.Response(429, text="rate")
    )
    with pytest.raises(PlacesQuotaExceededError):
        get_place_details(place_id=place_id, locale="ja", api_key="k", timeout_s=5.0)


@respx.mock
def test_get_place_details_timeout_raises():
    place_id = "ChIJany"
    respx.get(PLACES_DETAILS_URL_TEMPLATE.format(place_id=place_id)).mock(
        side_effect=httpx.ReadTimeout("timeout")
    )
    with pytest.raises(PlacesAPITimeout):
        get_place_details(place_id=place_id, locale="ja", api_key="k", timeout_s=0.1)
