from __future__ import annotations

from typing import Literal

import pandas as pd
from shapely.geometry import box
from shapely.geometry.base import BaseGeometry

from app.core.geometry import bounds_to_grid_range


def select_candidate_tiles_by_grid(
    tile_index_df: pd.DataFrame,
    tile_grid_df: pd.DataFrame,
    lod_key: str,
    query_geom: BaseGeometry,
    grid_size_m: int,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    gx0, gy0, gx1, gy1 = bounds_to_grid_range(query_geom.bounds, grid_size_m)

    df_grid_hits = tile_grid_df[
        (tile_grid_df["lod_key"].astype(str) == str(lod_key))
        & (tile_grid_df["cell_x"] >= gx0)
        & (tile_grid_df["cell_x"] <= gx1)
        & (tile_grid_df["cell_y"] >= gy0)
        & (tile_grid_df["cell_y"] <= gy1)
    ].copy()

    candidate_ids = df_grid_hits["tile_id"].astype(str).drop_duplicates().tolist()
    df_candidates = tile_index_df[
        (tile_index_df["lod_key"].astype(str) == str(lod_key))
        & (tile_index_df["tile_id"].astype(str).isin(candidate_ids))
    ].copy().reset_index(drop=True)

    return df_grid_hits.reset_index(drop=True), df_candidates


def exact_select_tiles(query_geom: BaseGeometry, df_candidates: pd.DataFrame) -> pd.DataFrame:
    if df_candidates.empty:
        return df_candidates.copy()

    selected_flags: list[bool] = []
    for row in df_candidates.itertuples(index=False):
        geom_bbox = box(float(row.minx), float(row.miny), float(row.maxx), float(row.maxy))
        selected_flags.append(bool(query_geom.intersects(geom_bbox)))

    out_df = df_candidates.copy()
    out_df["intersects_query"] = pd.Series(selected_flags, index=out_df.index, dtype=bool)
    return out_df.loc[out_df["intersects_query"]].copy().reset_index(drop=True)


def _normalize_bool_series(series: pd.Series) -> pd.Series:
    if series.dtype == bool:
        return series
    return series.astype("string").str.lower().isin(["true", "1", "yes"])


def reduce_selected_b3dm_nodes(
    df_selected_tiles: pd.DataFrame,
    strategy: Literal["leaf_only", "all_selected"],
) -> pd.DataFrame:
    if df_selected_tiles.empty:
        return df_selected_tiles.copy()

    if strategy == "all_selected":
        return df_selected_tiles.sort_values(by=["tile_id"]).reset_index(drop=True)

    if "has_children" in df_selected_tiles.columns:
        has_children = _normalize_bool_series(df_selected_tiles["has_children"])
        df_leaf = df_selected_tiles.loc[~has_children].copy().reset_index(drop=True)
        if not df_leaf.empty:
            return df_leaf.sort_values(by=["tile_id"]).reset_index(drop=True)

    if "depth" in df_selected_tiles.columns:
        depths = pd.to_numeric(df_selected_tiles["depth"], errors="coerce")
        max_depth = depths.max()
        if pd.notna(max_depth):
            df_deepest = df_selected_tiles.loc[depths == max_depth].copy().reset_index(drop=True)
            if not df_deepest.empty:
                return df_deepest.sort_values(by=["tile_id"]).reset_index(drop=True)

    return df_selected_tiles.sort_values(by=["tile_id"]).reset_index(drop=True)
