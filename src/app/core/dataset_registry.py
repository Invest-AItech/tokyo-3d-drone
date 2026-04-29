from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import pandas as pd

from app.config import Settings
from app.core.models import DatasetManifest


@dataclass(frozen=True)
class DatasetHandle:
    dataset_id: str
    dataset_root: Path
    manifest_path: Path
    manifest: DatasetManifest
    tile_index_path: Path
    tile_grid_path: Path
    assets_root: Path


class DatasetRegistry:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def get(self, dataset_id: str) -> DatasetHandle:
        dataset_root = self.settings.datasets_root / dataset_id
        manifest_path = dataset_root / "manifest.json"
        if not manifest_path.exists():
            raise FileNotFoundError(f"dataset manifest not found: {manifest_path}")

        manifest = _load_manifest(str(manifest_path))
        tile_index_path = dataset_root / manifest.indexes_dir / manifest.tile_index_file
        tile_grid_path = dataset_root / manifest.indexes_dir / manifest.tile_grid_file
        assets_root = dataset_root / manifest.assets_dir

        if not tile_index_path.exists():
            raise FileNotFoundError(f"tile_index not found: {tile_index_path}")
        if not tile_grid_path.exists():
            raise FileNotFoundError(f"tile_grid not found: {tile_grid_path}")
        if not assets_root.exists():
            raise FileNotFoundError(f"assets root not found: {assets_root}")

        return DatasetHandle(
            dataset_id=dataset_id,
            dataset_root=dataset_root,
            manifest_path=manifest_path,
            manifest=manifest,
            tile_index_path=tile_index_path,
            tile_grid_path=tile_grid_path,
            assets_root=assets_root,
        )

    def load_frames(self, dataset: DatasetHandle) -> tuple[pd.DataFrame, pd.DataFrame]:
        return _load_frames(str(dataset.tile_index_path), str(dataset.tile_grid_path))


@lru_cache(maxsize=64)
def _load_manifest(manifest_path: str) -> DatasetManifest:
    path = Path(manifest_path)
    return DatasetManifest.model_validate_json(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=32)
def _load_frames(tile_index_path: str, tile_grid_path: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    df_tile_index = pd.read_parquet(tile_index_path)
    df_tile_grid = pd.read_parquet(tile_grid_path)
    return df_tile_index, df_tile_grid
