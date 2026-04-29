from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.config import get_settings
from app.core.models import DatasetInfoResponse
from app.services.tileset_service import DatasetNotFoundError, TilesetRequestService

router = APIRouter(prefix="/datasets", tags=["datasets"])
service = TilesetRequestService(get_settings())


@router.get("/{dataset_id}", response_model=DatasetInfoResponse)
def get_dataset(dataset_id: str) -> DatasetInfoResponse:
    try:
        return service.get_dataset_info(dataset_id)
    except DatasetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
