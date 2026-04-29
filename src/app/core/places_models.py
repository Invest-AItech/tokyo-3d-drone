from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


# 東京 23 区を含むバウンディングボックス。
# 北海道・沖縄など明らかな範囲外を弾くための矩形。武蔵野市・川崎市など
# 隣接エリアは入る。23 区きっちりではないが、ユーザー要件「ある程度の精度」に合致。
TOKYO_23_BBOX = {
    "low": {"latitude": 35.50, "longitude": 139.55},
    "high": {"latitude": 35.82, "longitude": 139.92},
}


SupportedLocale = Literal["ja", "en"]

# サジェスト結果のメタ。フロントが「対象範囲外」「未マッチ」を区別表示できるよう返す。
# - "ok"            : Tokyo 23 BB 内で 1 件以上候補あり
# - "out_of_range"  : BB なしなら候補があるが BB ありで 0 件 (= 23 区外でしかヒットしない)
# - "no_match"      : BB あり/なし両方で 0 件 (= 文字列がどこにもヒットしない)
AutocompleteStatus = Literal["ok", "out_of_range", "no_match"]


class AutocompleteRequest(BaseModel):
    query: str = Field(min_length=1, max_length=200)
    locale: SupportedLocale = "ja"
    session_token: str | None = Field(default=None, max_length=64)


class PlacePrediction(BaseModel):
    place_id: str
    primary_text: str
    secondary_text: str = ""
    full_text: str


class AutocompleteResponse(BaseModel):
    predictions: list[PlacePrediction]
    status: AutocompleteStatus = "ok"


class PlaceDetailsRequest(BaseModel):
    place_id: str = Field(min_length=1, max_length=256)
    locale: SupportedLocale = "ja"
    session_token: str | None = Field(default=None, max_length=64)


class PlaceDetailsResponse(BaseModel):
    place_id: str
    display_name: str
    formatted_address: str = ""
    lat: float = Field(ge=-90.0, le=90.0)
    lon: float = Field(ge=-180.0, le=180.0)
    in_tokyo23: bool


def is_in_tokyo23_bbox(lat: float, lon: float) -> bool:
    low = TOKYO_23_BBOX["low"]
    high = TOKYO_23_BBOX["high"]
    return (
        low["latitude"] <= lat <= high["latitude"]
        and low["longitude"] <= lon <= high["longitude"]
    )
