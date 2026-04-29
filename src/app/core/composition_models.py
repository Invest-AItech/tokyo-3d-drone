"""Pydantic models and constants for Creator Mode compositions.

★★★ 上限定数はこのファイルで一元管理。
★★★ 変更したらフロント側 (src/app/static/viewer/constants.js) も合わせて更新すること。
"""
from __future__ import annotations

import math
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator

# --- 上限定数 ---
MAX_POINTS = 50
MAX_TOTAL_DISTANCE_M = 20_000
MAX_BUFFER_M = 500
MIN_BUFFER_M = 50
MAX_SPEED_KMH = 200
MIN_SPEED_KMH = 1
MAX_ALT_M = 500
MIN_ALT_M = 1
MAX_HOVER_S = 10
MAX_CORNER_RADIUS_M = 200

# --- 型エイリアス ---
LOD_VALUES = Literal["lod1", "lod2", "lod2_no_texture"]


# --- モデル ---
class Point(BaseModel):
    id: str = Field(min_length=1, max_length=8)
    lon: float = Field(ge=-180.0, le=180.0)
    lat: float = Field(ge=-90.0, le=90.0)
    altM: float = Field(ge=MIN_ALT_M, le=MAX_ALT_M)
    pitchDeg: float = Field(ge=-89.0, le=45.0)
    headingRelDeg: float = Field(ge=-180.0, le=180.0)
    hoverS: float = Field(default=0.0, ge=0.0, le=MAX_HOVER_S)
    cornerRadiusM: Optional[float] = Field(default=None, ge=0.0, le=MAX_CORNER_RADIUS_M)


class Segment(BaseModel):
    from_: str = Field(alias="from", min_length=1, max_length=8)
    to: str = Field(min_length=1, max_length=8)
    speedKmh: float = Field(ge=MIN_SPEED_KMH, le=MAX_SPEED_KMH)

    model_config = {"populate_by_name": True}


class GlobalSettings(BaseModel):
    tau: float = Field(ge=0.0, le=2.0)
    lookaheadM: float = Field(ge=5.0, le=150.0)
    bufferM: float = Field(ge=MIN_BUFFER_M, le=MAX_BUFFER_M)
    lod: LOD_VALUES
    cornerRadiusM: float = Field(ge=0.0, le=MAX_CORNER_RADIUS_M)


def _haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in meters between two WGS84 points."""
    R = 6_371_000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


class Composition(BaseModel):
    v: int = Field(default=1)
    name: Optional[str] = Field(default=None, max_length=80)
    author: Optional[str] = Field(default=None, max_length=40)
    createdAt: Optional[datetime] = None
    global_: GlobalSettings = Field(alias="global")
    points: list[Point]
    segments: list[Segment]

    model_config = {"populate_by_name": True}

    @model_validator(mode="after")
    def _validate_invariants(self) -> "Composition":
        if len(self.points) < 2:
            raise ValueError("composition must have at least 2 points")
        if len(self.points) > MAX_POINTS:
            raise ValueError(f"composition has {len(self.points)} points, max is {MAX_POINTS}")

        ids = [p.id for p in self.points]
        if len(set(ids)) != len(ids):
            raise ValueError("duplicate point id")

        if len(self.segments) != len(self.points) - 1:
            raise ValueError(
                f"segments length ({len(self.segments)}) must be points-1 ({len(self.points) - 1})"
            )

        for i, seg in enumerate(self.segments):
            expected_from = ids[i]
            expected_to = ids[i + 1]
            if seg.from_ != expected_from or seg.to != expected_to:
                raise ValueError(
                    f"segments[{i}] must be {expected_from}->{expected_to}, "
                    f"got {seg.from_}->{seg.to}"
                )

        total_m = 0.0
        for i in range(len(self.points) - 1):
            a, b = self.points[i], self.points[i + 1]
            total_m += _haversine_meters(a.lat, a.lon, b.lat, b.lon)
        if total_m > MAX_TOTAL_DISTANCE_M:
            raise ValueError(
                f"total distance {total_m:.1f}m exceeds max {MAX_TOTAL_DISTANCE_M}m"
            )

        return self
