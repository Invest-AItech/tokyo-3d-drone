from __future__ import annotations

import httpx

from app.core.places_models import (
    TOKYO_23_BBOX,
    PlaceDetailsResponse,
    PlacePrediction,
    is_in_tokyo23_bbox,
)


PLACES_AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete"
PLACES_DETAILS_URL_TEMPLATE = "https://places.googleapis.com/v1/places/{place_id}"

# Field mask: predictions に含めるフィールドだけを要求してレスポンスを最小化
# (課金にも影響)
AUTOCOMPLETE_FIELD_MASK = (
    "suggestions.placePrediction.placeId,"
    "suggestions.placePrediction.text,"
    "suggestions.placePrediction.structuredFormat"
)
DETAILS_FIELD_MASK = "id,displayName,formattedAddress,location"


class PlacesAPIError(RuntimeError):
    """Places API が成功レスポンスを返さなかった (401/403/500 等)。"""


class PlacesQuotaExceededError(PlacesAPIError):
    """Places API が 429 を返した。"""


class PlacesAPITimeout(PlacesAPIError):
    """API 呼び出しがタイムアウト。"""


def autocomplete(
    *,
    query: str,
    locale: str,
    api_key: str,
    timeout_s: float,
    session_token: str | None = None,
    restrict_to_tokyo23: bool = True,
) -> list[PlacePrediction]:
    """Google Places API (New) Autocomplete を呼ぶ。

    restrict_to_tokyo23=True (既定) で locationRestriction = TOKYO_23_BBOX を渡す。
    False を渡すと regionCode のみ (= 全国範囲)。範囲外/未マッチ判別の二段呼び
    フォールバックで使うために False が必要。
    """
    body: dict = {
        "input": query,
        "languageCode": locale,
        "regionCode": "JP",
    }
    if restrict_to_tokyo23:
        body["locationRestriction"] = {"rectangle": TOKYO_23_BBOX}
    if session_token:
        body["sessionToken"] = session_token

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key.strip(),
        "X-Goog-FieldMask": AUTOCOMPLETE_FIELD_MASK,
    }

    try:
        resp = httpx.post(PLACES_AUTOCOMPLETE_URL, json=body, headers=headers, timeout=timeout_s)
    except httpx.TimeoutException as exc:
        raise PlacesAPITimeout(str(exc)) from exc
    except httpx.HTTPError as exc:
        raise PlacesAPIError(f"http error: {exc}") from exc

    if resp.status_code == 429:
        raise PlacesQuotaExceededError(f"quota exceeded: {resp.text}")
    if resp.status_code >= 400:
        raise PlacesAPIError(f"status={resp.status_code} body={resp.text}")

    data = resp.json()
    suggestions = data.get("suggestions") or []

    predictions: list[PlacePrediction] = []
    for s in suggestions:
        pp = s.get("placePrediction") or {}
        place_id = pp.get("placeId")
        if not place_id:
            continue
        full_text = (pp.get("text") or {}).get("text") or ""
        structured = pp.get("structuredFormat") or {}
        primary = (structured.get("mainText") or {}).get("text") or full_text
        secondary = (structured.get("secondaryText") or {}).get("text") or ""
        predictions.append(
            PlacePrediction(
                place_id=place_id,
                primary_text=primary,
                secondary_text=secondary,
                full_text=full_text,
            )
        )
    return predictions


def get_place_details(
    *,
    place_id: str,
    locale: str,
    api_key: str,
    timeout_s: float,
    session_token: str | None = None,
) -> PlaceDetailsResponse:
    """Google Places API (New) Place Details を呼び、座標を含む詳細を返す。"""
    url = PLACES_DETAILS_URL_TEMPLATE.format(place_id=place_id)
    params = {"languageCode": locale, "regionCode": "JP"}
    if session_token:
        params["sessionToken"] = session_token

    headers = {
        "X-Goog-Api-Key": api_key.strip(),
        "X-Goog-FieldMask": DETAILS_FIELD_MASK,
    }

    try:
        resp = httpx.get(url, params=params, headers=headers, timeout=timeout_s)
    except httpx.TimeoutException as exc:
        raise PlacesAPITimeout(str(exc)) from exc
    except httpx.HTTPError as exc:
        raise PlacesAPIError(f"http error: {exc}") from exc

    if resp.status_code == 429:
        raise PlacesQuotaExceededError(f"quota exceeded: {resp.text}")
    if resp.status_code >= 400:
        raise PlacesAPIError(f"status={resp.status_code} body={resp.text}")

    data = resp.json()
    location = data.get("location") or {}
    lat = location.get("latitude")
    lon = location.get("longitude")
    if lat is None or lon is None:
        raise PlacesAPIError(f"no location in details response: {data}")

    display_name = (data.get("displayName") or {}).get("text") or ""
    formatted_address = data.get("formattedAddress") or ""

    return PlaceDetailsResponse(
        place_id=data.get("id") or place_id,
        display_name=display_name,
        formatted_address=formatted_address,
        lat=float(lat),
        lon=float(lon),
        in_tokyo23=is_in_tokyo23_bbox(float(lat), float(lon)),
    )
