from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator


class QueryPoint(BaseModel):
    lat: float
    lon: float


class CircleQuery(BaseModel):
    mode: Literal["circle"]
    center_lat: float
    center_lon: float
    radius_m: float = Field(gt=0)


class CorridorQuery(BaseModel):
    mode: Literal["corridor"]
    points: list[QueryPoint]
    radius_m: float = Field(gt=0)

    @field_validator("points")
    @classmethod
    def validate_points(cls, value: list[QueryPoint]) -> list[QueryPoint]:
        if len(value) < 2:
            raise ValueError("corridor には 2 点以上必要です")
        return value


QuerySpec = Annotated[CircleQuery | CorridorQuery, Field(discriminator="mode")]


class CreateRequestBody(BaseModel):
    dataset_id: str = Field(min_length=1)
    lod_key: str | None = None
    b3dm_node_strategy: Literal["leaf_only", "all_selected"] = "leaf_only"
    query: QuerySpec


class PathRewriteRule(BaseModel):
    from_prefix: str
    to_prefix: str


class DatasetManifest(BaseModel):
    dataset_id: str
    title: str | None = None
    description: str | None = None
    default_lod_key: str = "lod2"
    data_crs: str = "EPSG:32654"
    grid_size_m: int = Field(default=250, gt=0)
    indexes_dir: str = "indexes"
    assets_dir: str = "assets"
    tile_index_file: str = "tile_index.parquet"
    tile_grid_file: str = "tile_grid.parquet"
    path_rewrite_rules: list[PathRewriteRule] = Field(default_factory=list)


class RequestCreatedResponse(BaseModel):
    request_id: str
    dataset_id: str
    lod_key: str
    selected_tile_count: int
    candidate_tile_count: int
    grid_hit_count: int
    query_mode: str
    viewer_url: str
    tileset_url: str
    meta_url: str
    created_at: datetime
    height_offset_m: float = -40.0
    height_offset_source: str = "fallback_fixed_offset"


class RequestMetaResponse(BaseModel):
    request_id: str
    dataset_id: str
    lod_key: str
    query_mode: str
    query: dict
    b3dm_node_strategy: str
    selected_tile_count: int
    candidate_tile_count: int
    grid_hit_count: int
    tileset_url: str
    viewer_url: str
    created_at: datetime
    height_offset_m: float = -40.0
    representative_lon: float | None = None
    representative_lat: float | None = None
    geoid_height_m: float | None = None
    ground_elevation_m: float | None = None
    height_offset_source: str = "fallback_fixed_offset"
    debug: dict = Field(default_factory=dict)


class DatasetInfoResponse(BaseModel):
    dataset_id: str
    title: str | None = None
    description: str | None = None
    default_lod_key: str
    data_crs: str
    grid_size_m: int
    tile_index_path: str
    tile_grid_path: str
    assets_root: str
