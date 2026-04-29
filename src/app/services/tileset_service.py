from __future__ import annotations

import json
import secrets
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

from pydantic import TypeAdapter

from app.config import Settings
from app.core.dataset_registry import DatasetRegistry
from app.core.geometry import make_query_geometry, query_to_debug_dict, query_to_representative_lonlat
from app.core.models import (
    CreateRequestBody,
    DatasetInfoResponse,
    RequestCreatedResponse,
    RequestMetaResponse,
)
from app.core.selector import exact_select_tiles, reduce_selected_b3dm_nodes, select_candidate_tiles_by_grid
from app.core.tileset_builder import build_request_tileset_json
from app.services.height_offset_service import estimate_height_offset


class DatasetNotFoundError(RuntimeError):
    pass


class RequestNotFoundError(RuntimeError):
    pass


class TilesetSelectionEmptyError(RuntimeError):
    pass


@dataclass
class RequestContext:
    request_id: str
    request_dir: Path
    tileset_path: Path
    meta_path: Path


_REQUEST_META_ADAPTER = TypeAdapter(RequestMetaResponse)


class TilesetRequestService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.registry = DatasetRegistry(settings)

    def _new_request_context(self) -> RequestContext:
        request_id = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S") + "-" + secrets.token_hex(self.settings.request_id_bytes)
        request_dir = self.settings.requests_root / request_id
        request_dir.mkdir(parents=True, exist_ok=False)
        return RequestContext(
            request_id=request_id,
            request_dir=request_dir,
            tileset_path=request_dir / "tileset.json",
            meta_path=request_dir / "meta.json",
        )

    def get_dataset_info(self, dataset_id: str) -> DatasetInfoResponse:
        try:
            dataset = self.registry.get(dataset_id)
        except FileNotFoundError as exc:
            raise DatasetNotFoundError(str(exc)) from exc

        return DatasetInfoResponse(
            dataset_id=dataset.manifest.dataset_id,
            title=dataset.manifest.title,
            description=dataset.manifest.description,
            default_lod_key=dataset.manifest.default_lod_key,
            data_crs=dataset.manifest.data_crs,
            grid_size_m=dataset.manifest.grid_size_m,
            tile_index_path=str(dataset.tile_index_path),
            tile_grid_path=str(dataset.tile_grid_path),
            assets_root=str(dataset.assets_root),
        )

    def create_request(self, payload: CreateRequestBody, base_url: str) -> RequestCreatedResponse:
        try:
            dataset = self.registry.get(payload.dataset_id)
        except FileNotFoundError as exc:
            raise DatasetNotFoundError(str(exc)) from exc

        lod_key = payload.lod_key or dataset.manifest.default_lod_key
        tile_index_df, tile_grid_df = self.registry.load_frames(dataset)
        query_geom = make_query_geometry(payload.query, dataset.manifest.data_crs)
        query_debug = query_to_debug_dict(payload.query)
        representative_lon, representative_lat = query_to_representative_lonlat(payload.query)
        height_result = estimate_height_offset(
            lat=representative_lat,
            lon=representative_lon,
            fallback_offset_m=getattr(self.settings, "plateau_height_offset_m", -40.0),
        )

        df_grid_hits, df_candidates = select_candidate_tiles_by_grid(
            tile_index_df=tile_index_df,
            tile_grid_df=tile_grid_df,
            lod_key=lod_key,
            query_geom=query_geom,
            grid_size_m=dataset.manifest.grid_size_m,
        )
        df_selected_tiles = exact_select_tiles(query_geom=query_geom, df_candidates=df_candidates)
        df_selected_tiles = reduce_selected_b3dm_nodes(
            df_selected_tiles=df_selected_tiles,
            strategy=payload.b3dm_node_strategy,
        )

        if df_selected_tiles.empty:
            raise TilesetSelectionEmptyError("選択結果が 0 件です。条件を見直してください。")

        context = self._new_request_context()
        tileset_json = build_request_tileset_json(
            selected_tiles_df=df_selected_tiles,
            request_dir=context.request_dir,
            dataset=dataset,
            settings=self.settings,
            query_debug=query_debug,
        )
        context.tileset_path.write_text(
            json.dumps(tileset_json, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        created_at = datetime.now(timezone.utc)
        request_rel_root = f"/runtime/{self.settings.requests_dirname}/{context.request_id}"
        viewer_url = f"/viewer/?request_id={context.request_id}"
        tileset_url = f"{request_rel_root}/tileset.json"
        meta_url = f"{self.settings.api_v1_prefix}/requests/{context.request_id}"

        meta = RequestMetaResponse(
            request_id=context.request_id,
            dataset_id=dataset.dataset_id,
            lod_key=lod_key,
            query_mode=payload.query.mode,
            query=query_debug,
            b3dm_node_strategy=payload.b3dm_node_strategy,
            selected_tile_count=int(len(df_selected_tiles)),
            candidate_tile_count=int(len(df_candidates)),
            grid_hit_count=int(len(df_grid_hits)),
            tileset_url=tileset_url,
            viewer_url=viewer_url,
            created_at=created_at,
            height_offset_m=float(height_result.offset_m),
            representative_lon=float(representative_lon),
            representative_lat=float(representative_lat),
            geoid_height_m=height_result.geoid_height_m,
            ground_elevation_m=height_result.ground_elevation_m,
            height_offset_source=height_result.source,
            debug={
                "dataset_root": str(dataset.dataset_root),
                "assets_root": str(dataset.assets_root),
                "request_dir": str(context.request_dir),
                "request_root_ge": self.settings.request_root_ge,
                "request_child_ge": self.settings.request_child_ge,
            },
        )
        context.meta_path.write_text(
            json.dumps(meta.model_dump(mode="json"), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        return RequestCreatedResponse(
            request_id=context.request_id,
            dataset_id=dataset.dataset_id,
            lod_key=lod_key,
            selected_tile_count=int(len(df_selected_tiles)),
            candidate_tile_count=int(len(df_candidates)),
            grid_hit_count=int(len(df_grid_hits)),
            query_mode=payload.query.mode,
            viewer_url=viewer_url,
            tileset_url=tileset_url,
            meta_url=meta_url,
            created_at=created_at,
            height_offset_m=float(height_result.offset_m),
            height_offset_source=height_result.source,
        )

    def get_request(self, request_id: str, base_url: str) -> RequestMetaResponse:
        meta_path = self.settings.requests_root / request_id / "meta.json"
        if not meta_path.exists():
            raise RequestNotFoundError(f"request not found: {request_id}")
        data = json.loads(meta_path.read_text(encoding="utf-8"))
        return _REQUEST_META_ADAPTER.validate_python(data)
