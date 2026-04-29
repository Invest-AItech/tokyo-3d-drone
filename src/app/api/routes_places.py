from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.config import Settings, get_settings
from app.core.places_models import (
    AutocompleteRequest,
    AutocompleteResponse,
    PlaceDetailsRequest,
    PlaceDetailsResponse,
)
from app.services.places_service import (
    PlacesAPIError,
    PlacesAPITimeout,
    PlacesQuotaExceededError,
    autocomplete,
    get_place_details,
)


router = APIRouter(prefix="/places", tags=["places"])


@router.post("/autocomplete", response_model=AutocompleteResponse)
def post_autocomplete(
    payload: AutocompleteRequest,
    settings: Settings = Depends(get_settings),
) -> AutocompleteResponse:
    """Tokyo 23 BB 制限付きで Autocomplete を呼ぶ。0 件なら制限なしで再問合せして
    「23 区外しかヒットしない (out_of_range)」か「どこにもヒットしない (no_match)」
    を区別する status を返す。フロントは status で「範囲外」「未マッチ」を区別表示。"""
    if not settings.google_places_api_key:
        raise HTTPException(status_code=500, detail="GOOGLE_PLACES_API_KEY is not configured")

    try:
        primary = autocomplete(
            query=payload.query,
            locale=payload.locale,
            api_key=settings.google_places_api_key,
            timeout_s=settings.places_api_timeout_s,
            session_token=payload.session_token,
            restrict_to_tokyo23=True,
        )
    except PlacesQuotaExceededError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except PlacesAPITimeout as exc:
        raise HTTPException(status_code=504, detail=str(exc)) from exc
    except PlacesAPIError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if primary:
        return AutocompleteResponse(predictions=primary, status="ok")

    # 制限あり 0 件 → 制限なしで再問合せして区別。
    # 同じ session_token を引き継ぐと Google 側で 1 セッション扱いになるため引継ぐ。
    try:
        fallback = autocomplete(
            query=payload.query,
            locale=payload.locale,
            api_key=settings.google_places_api_key,
            timeout_s=settings.places_api_timeout_s,
            session_token=payload.session_token,
            restrict_to_tokyo23=False,
        )
    except PlacesQuotaExceededError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except PlacesAPITimeout as exc:
        raise HTTPException(status_code=504, detail=str(exc)) from exc
    except PlacesAPIError:
        # フォールバックで失敗しても primary 側は成功 (0 件) なので no_match 扱いにする
        return AutocompleteResponse(predictions=[], status="no_match")

    status = "out_of_range" if fallback else "no_match"
    return AutocompleteResponse(predictions=[], status=status)


@router.post("/details", response_model=PlaceDetailsResponse)
def post_details(
    payload: PlaceDetailsRequest,
    settings: Settings = Depends(get_settings),
) -> PlaceDetailsResponse:
    if not settings.google_places_api_key:
        raise HTTPException(status_code=500, detail="GOOGLE_PLACES_API_KEY is not configured")

    try:
        details = get_place_details(
            place_id=payload.place_id,
            locale=payload.locale,
            api_key=settings.google_places_api_key,
            timeout_s=settings.places_api_timeout_s,
            session_token=payload.session_token,
        )
    except PlacesQuotaExceededError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except PlacesAPITimeout as exc:
        raise HTTPException(status_code=504, detail=str(exc)) from exc
    except PlacesAPIError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return details
