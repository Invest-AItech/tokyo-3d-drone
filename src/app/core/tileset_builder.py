from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pandas as pd

from app.config import Settings
from app.core.dataset_registry import DatasetHandle
from app.core.geometry import bbox_to_region_radians
from app.core.path_mapper import build_content_uri


def _parse_transform(value: Any) -> list[float] | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, list):
        return [float(v) for v in value]
    text = str(value).strip()
    if not text:
        return None
    data = json.loads(text)
    return [float(v) for v in data]


def build_request_tileset_json(
    selected_tiles_df: pd.DataFrame,
    request_dir: Path,
    dataset: DatasetHandle,
    settings: Settings,
    query_debug: dict,
) -> dict[str, Any]:
    if selected_tiles_df.empty:
        raise ValueError("selected_tiles_df is empty")

    children: list[dict[str, Any]] = []

    for row in selected_tiles_df.to_dict("records"):
        min_h = 0.0 if pd.isna(row.get("min_h")) else float(row["min_h"])
        max_h = 100.0 if pd.isna(row.get("max_h")) else float(row["max_h"])
        content_uri = build_content_uri(request_dir=request_dir, row=row, dataset=dataset, settings=settings)
        child: dict[str, Any] = {
            "boundingVolume": {
                "region": bbox_to_region_radians(
                    float(row["minx"]),
                    float(row["miny"]),
                    float(row["maxx"]),
                    float(row["maxy"]),
                    data_crs=dataset.manifest.data_crs,
                    min_h=min_h,
                    max_h=max_h,
                )
            },
            "geometricError": float(settings.request_child_ge),
            "refine": str(row.get("refine", "REPLACE") or "REPLACE"),
            "content": {"uri": content_uri},
            "extras": {
                "tile_id": str(row.get("tile_id", "")),
                "lod_key": str(row.get("lod_key", "")),
                "content_uri": content_uri,
            },
        }
        transform = _parse_transform(row.get("world_transform_json"))
        if transform is not None:
            child["transform"] = transform
        children.append(child)

    selected_minx = float(pd.to_numeric(selected_tiles_df["minx"], errors="coerce").min())
    selected_miny = float(pd.to_numeric(selected_tiles_df["miny"], errors="coerce").min())
    selected_maxx = float(pd.to_numeric(selected_tiles_df["maxx"], errors="coerce").max())
    selected_maxy = float(pd.to_numeric(selected_tiles_df["maxy"], errors="coerce").max())
    selected_min_h = float(pd.to_numeric(selected_tiles_df.get("min_h"), errors="coerce").fillna(0.0).min())
    selected_max_h = float(pd.to_numeric(selected_tiles_df.get("max_h"), errors="coerce").fillna(100.0).max())
    root_ge = float(max(settings.request_root_ge, 64.0))

    return {
        "asset": {"version": "1.0"},
        "geometricError": root_ge,
        "root": {
            "boundingVolume": {
                "region": bbox_to_region_radians(
                    selected_minx,
                    selected_miny,
                    selected_maxx,
                    selected_maxy,
                    data_crs=dataset.manifest.data_crs,
                    min_h=selected_min_h,
                    max_h=selected_max_h,
                )
            },
            "geometricError": root_ge,
            "refine": "REPLACE",
            "children": children,
            "extras": {
                "selected_tile_count": len(children),
                "query": query_debug,
            },
        },
    }
