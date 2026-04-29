from __future__ import annotations

import math
from functools import lru_cache
from typing import Iterable

from pyproj import Transformer
from shapely.geometry import LineString, Point
from shapely.geometry.base import BaseGeometry

from app.core.models import CircleQuery, CorridorQuery, QueryPoint


@lru_cache(maxsize=16)
def get_transformers(data_crs: str) -> tuple[Transformer, Transformer]:
    wgs84_to_local = Transformer.from_crs("EPSG:4326", data_crs, always_xy=True)
    local_to_wgs84 = Transformer.from_crs(data_crs, "EPSG:4326", always_xy=True)
    return wgs84_to_local, local_to_wgs84


def lonlat_to_local_xy(lon: float, lat: float, data_crs: str) -> tuple[float, float]:
    to_local, _ = get_transformers(data_crs)
    x, y = to_local.transform(float(lon), float(lat))
    return float(x), float(y)


def bbox_to_region_radians(
    minx: float,
    miny: float,
    maxx: float,
    maxy: float,
    data_crs: str,
    min_h: float = 0.0,
    max_h: float = 100.0,
) -> list[float]:
    _, to_wgs84 = get_transformers(data_crs)
    west_deg, south_deg = to_wgs84.transform(float(minx), float(miny))
    east_deg, north_deg = to_wgs84.transform(float(maxx), float(maxy))
    west = math.radians(min(west_deg, east_deg))
    south = math.radians(min(south_deg, north_deg))
    east = math.radians(max(west_deg, east_deg))
    north = math.radians(max(south_deg, north_deg))
    return [west, south, east, north, float(min_h), float(max_h)]


def bounds_to_grid_range(bounds: tuple[float, float, float, float], grid_size_m: int) -> tuple[int, int, int, int]:
    minx, miny, maxx, maxy = bounds
    gx0 = math.floor(minx / grid_size_m)
    gy0 = math.floor(miny / grid_size_m)
    gx1 = math.floor(maxx / grid_size_m)
    gy1 = math.floor(maxy / grid_size_m)
    return gx0, gy0, gx1, gy1


def make_circle_geometry(query: CircleQuery, data_crs: str) -> BaseGeometry:
    cx, cy = lonlat_to_local_xy(query.center_lon, query.center_lat, data_crs)
    return Point(cx, cy).buffer(query.radius_m, resolution=64)


def make_corridor_geometry(query: CorridorQuery, data_crs: str) -> BaseGeometry:
    xy_points = [lonlat_to_local_xy(point.lon, point.lat, data_crs) for point in query.points]
    return LineString(xy_points).buffer(query.radius_m, cap_style=2, join_style=2)


def make_query_geometry(query: CircleQuery | CorridorQuery, data_crs: str) -> BaseGeometry:
    if query.mode == "circle":
        return make_circle_geometry(query, data_crs)
    return make_corridor_geometry(query, data_crs)


def query_to_debug_dict(query: CircleQuery | CorridorQuery) -> dict:
    data = query.model_dump()
    if query.mode == "corridor":
        data["points"] = [point.model_dump() if isinstance(point, QueryPoint) else point for point in query.points]
    return data


def query_to_representative_lonlat(query: CircleQuery | CorridorQuery) -> tuple[float, float]:
    if query.mode == "circle":
        return float(query.center_lon), float(query.center_lat)

    if not query.points:
        raise ValueError("corridor query has no points")

    lon = sum(float(point.lon) for point in query.points) / len(query.points)
    lat = sum(float(point.lat) for point in query.points) / len(query.points)
    return float(lon), float(lat)
