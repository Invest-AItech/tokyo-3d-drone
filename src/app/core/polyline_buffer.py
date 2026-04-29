"""Compute axis-aligned bbox around a polyline with a buffer in meters.

Used by Creator Mode tileset to fetch PLATEAU 3D tiles within `buffer_m`
meters of the camera path.
"""
from __future__ import annotations

import math


_METERS_PER_DEG_LAT = 111_000.0  # 高緯度で誤差あるが東京 23 区想定で十分


def bbox_from_polyline_buffer(
    points: list[tuple[float, float]],
    buffer_m: float,
) -> tuple[float, float, float, float]:
    """Return (min_lon, min_lat, max_lon, max_lat).

    Args:
        points: list of (lon, lat) in WGS84 degrees.
        buffer_m: buffer width in meters added on all sides.

    Raises:
        ValueError: if points is empty or buffer_m is negative.
    """
    if not points:
        raise ValueError("points must not be empty")
    if buffer_m < 0:
        raise ValueError(f"buffer_m must be non-negative, got {buffer_m}")

    lons = [p[0] for p in points]
    lats = [p[1] for p in points]
    min_lon, max_lon = min(lons), max(lons)
    min_lat, max_lat = min(lats), max(lats)

    # 緯度方向: 1° ≒ 111km
    delta_lat = buffer_m / _METERS_PER_DEG_LAT

    # 経度方向: 1° ≒ 111km * cos(lat)。緯度の中央値でスケーリング
    mid_lat_rad = math.radians((min_lat + max_lat) / 2.0)
    meters_per_deg_lon = max(1.0, _METERS_PER_DEG_LAT * math.cos(mid_lat_rad))
    delta_lon = buffer_m / meters_per_deg_lon

    return (
        min_lon - delta_lon,
        min_lat - delta_lat,
        max_lon + delta_lon,
        max_lat + delta_lat,
    )
