from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Mapping

from app.config import Settings
from app.core.dataset_registry import DatasetHandle


_RELATIVE_COLUMNS = ("content_rel_path", "asset_rel_path", "content_relative_path")
_ABSOLUTE_COLUMNS = ("content_abs_path", "tile_content_abs_path")


def _coerce_string(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _strip_assets_prefix(path: Path, dataset: DatasetHandle) -> Path:
    parts = list(path.parts)
    if not parts:
        raise ValueError("empty asset path")
    if parts[0] == dataset.manifest.assets_dir:
        return Path(*parts[1:])
    return path


def _apply_rewrite_rules(raw_path: str, dataset: DatasetHandle) -> Path | None:
    normalized = raw_path.replace("\\", "/")
    for rule in dataset.manifest.path_rewrite_rules:
        src = rule.from_prefix.replace("\\", "/").rstrip("/")
        if normalized.startswith(src):
            suffix = normalized[len(src):].lstrip("/")
            candidate = Path(rule.to_prefix) / suffix
            return _strip_assets_prefix(candidate, dataset)
    return None


def resolve_asset_relative_path(row: Mapping[str, Any], dataset: DatasetHandle) -> Path:
    for column in _RELATIVE_COLUMNS:
        value = _coerce_string(row.get(column))
        if value:
            rel = Path(value.lstrip("/"))
            return _strip_assets_prefix(rel, dataset)

    for column in _ABSOLUTE_COLUMNS:
        value = _coerce_string(row.get(column))
        if not value:
            continue
        abs_path = Path(value)
        dataset_assets_root = dataset.assets_root.resolve()
        try:
            return abs_path.resolve().relative_to(dataset_assets_root)
        except Exception:
            rewritten = _apply_rewrite_rules(value, dataset)
            if rewritten is not None:
                return rewritten
            marker = f"/{dataset.manifest.assets_dir}/"
            normalized = value.replace("\\", "/")
            if marker in normalized:
                suffix = normalized.split(marker, 1)[1]
                return Path(suffix)
            raise ValueError(
                "content path could not be mapped under assets root. "
                f"dataset={dataset.dataset_id} value={value!r}"
            )

    raise ValueError("row does not contain a supported content path column")


def build_content_uri(
    request_dir: Path,
    row: Mapping[str, Any],
    dataset: DatasetHandle,
    settings: Settings,
) -> str:
    rel_asset_path = resolve_asset_relative_path(row, dataset)

    # Public URI must remain under the FastAPI static server root.
    # Do not resolve the public target path here, otherwise a symlinked assets/
    # directory escapes to the underlying /content/drive/... real path.
    public_target_path = dataset.assets_root / rel_asset_path
    resolved_target_path = public_target_path.resolve()

    if settings.validate_asset_existence and not resolved_target_path.exists():
        raise FileNotFoundError(f"asset not found: {resolved_target_path}")

    rel_uri = os.path.relpath(public_target_path, start=request_dir).replace(os.sep, "/")
    return rel_uri
