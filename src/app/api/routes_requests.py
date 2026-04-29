from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, status

from app.config import get_settings
from app.core.models import CreateRequestBody, RequestCreatedResponse, RequestMetaResponse
from app.services.tileset_service import (
    DatasetNotFoundError,
    RequestNotFoundError,
    TilesetRequestService,
    TilesetSelectionEmptyError,
)

router = APIRouter(prefix="/requests", tags=["requests"])
service = TilesetRequestService(get_settings())


@router.post("", response_model=RequestCreatedResponse, status_code=status.HTTP_201_CREATED)
def create_request(payload: CreateRequestBody, request: Request) -> RequestCreatedResponse:
    try:
        return service.create_request(payload, base_url=str(request.base_url).rstrip("/"))
    except DatasetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except TilesetSelectionEmptyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{request_id}", response_model=RequestMetaResponse)
def get_request(request_id: str, request: Request) -> RequestMetaResponse:
    try:
        return service.get_request(request_id, base_url=str(request.base_url).rstrip("/"))
    except RequestNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
