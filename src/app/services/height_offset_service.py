from __future__ import annotations

# PLATEAU 3D Tiles の頂点座標は変換時点で「日本のジオイド2011」によって楕円体高に
# 変換済みであり、本来 Cesium に PLATEAU-Terrain (Cesium ion asset 3258112) を
# 重ねれば建物は補正なしで地表に乗る。フロントは PLATEAU-Terrain を採用したため、
# tileset の modelMatrix による追加補正は不要となり、本サービスは恒常的に 0m を返す。
#
# 本モジュールは API レスポンスのスキーマ後方互換のためだけに残置している。
# 旧式 (-(geoid + ground_elevation)) の自動補正は標高の高い地点 (世田谷など) で
# 建物が地下に沈み込む欠陥があったため廃止した。
from dataclasses import dataclass


@dataclass(frozen=True)
class HeightOffsetResult:
    offset_m: float
    geoid_height_m: float | None = None
    ground_elevation_m: float | None = None
    source: str = "plateau_terrain_no_offset"


def estimate_height_offset(lat: float, lon: float, fallback_offset_m: float = 0.0) -> HeightOffsetResult:
    del lat, lon, fallback_offset_m
    return HeightOffsetResult(
        offset_m=0.0,
        geoid_height_m=None,
        ground_elevation_m=None,
        source="plateau_terrain_no_offset",
    )
