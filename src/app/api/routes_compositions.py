"""Creator Mode composition CRUD endpoints.

Pattern: see routes_board.py — reCAPTCHA + rate limit + Firestore.
PATCH/DELETE not implemented in MVP; new save = new id.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import Field

from app.config import get_settings
from app.config import get_settings as _get_settings_for_tileset
from app.core.composition_models import Composition
from app.core.models import CorridorQuery, CreateRequestBody, QueryPoint
from app.services import board_service, composition_service
from app.services.recaptcha_service import RecaptchaFailed, verify_recaptcha
from app.services.tileset_service import TilesetRequestService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/compositions", tags=["compositions"])

# モジュールレベルの service キャッシュ
_tileset_service_instance: Optional[TilesetRequestService] = None


def _get_tileset_service() -> TilesetRequestService:
    """Lazy init + cache. テストでモックするために関数経由でアクセスする。"""
    global _tileset_service_instance
    if _tileset_service_instance is None:
        _tileset_service_instance = TilesetRequestService(_get_settings_for_tileset())
    return _tileset_service_instance


def _composition_default_dataset_id() -> str:
    """Settings.creator_dataset_id があればそれ、なければデフォルト。"""
    s = _get_settings_for_tileset()
    return getattr(s, "creator_dataset_id", "my_dataset")


class CompositionCreate(Composition):
    """Composition + reCAPTCHA token (incoming POST body)."""
    recaptchaToken: str = Field(min_length=1)


def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "0.0.0.0"


def _spec_url(request: Request) -> str:
    return f"{request.url.scheme}://{request.url.netloc}/viewer/spec"


def _public_id_url(request: Request, composition_id: str) -> str:
    return f"{request.url.scheme}://{request.url.netloc}/viewer/?id={composition_id}"


@router.post("", status_code=status.HTTP_201_CREATED)
def post_composition(payload: CompositionCreate, request: Request, response: Response) -> dict:
    settings = get_settings()
    try:
        verify_recaptcha(
            payload.recaptchaToken,
            project_id=settings.firestore_project,
            site_key=settings.recaptcha_site_key,
            expected_action="save_composition",
            threshold=settings.recaptcha_score_threshold,
        )
    except RecaptchaFailed as e:
        logger.warning("recaptcha failed: %s", e)
        raise HTTPException(status_code=403, detail="reCAPTCHA verification failed")
    except Exception as e:
        logger.warning("recaptcha error: %s", e)
        raise HTTPException(status_code=403, detail="reCAPTCHA verification failed")

    ip_hash = board_service.hash_ip(_client_ip(request))
    if not board_service.check_rate_limit(
        ip_hash,
        window=settings.rate_limit_window_sec,
        max_posts=settings.rate_limit_max_posts,
    ):
        raise HTTPException(status_code=429, detail="too many saves, please wait")

    # recaptchaToken を除いたデータだけ保存
    data = payload.model_dump(by_alias=True, exclude={"recaptchaToken"})
    new_id = composition_service.save_composition(
        data=data, ip_hash=ip_hash, name=payload.name
    )
    return {"id": new_id, "url": _public_id_url(request, new_id)}


@router.post("/preview-tileset")
def preview_composition_tileset(payload: Composition, request: Request) -> dict:
    """Build a tileset for an unsaved composition (no Firestore write).

    Used by the Creator UI's "Preview tiles" button so the user can see
    PLATEAU buildings before deciding to Save & Share.
    """
    settings = get_settings()
    ip_hash = board_service.hash_ip(_client_ip(request))
    if not board_service.check_rate_limit(
        ip_hash,
        window=settings.rate_limit_window_sec,
        max_posts=settings.rate_limit_max_posts,
    ):
        raise HTTPException(status_code=429, detail="too many preview requests, please wait")

    points = payload.points
    if len(points) < 2:
        raise HTTPException(status_code=400, detail="composition needs at least 2 points")

    polyline = [QueryPoint(lat=p.lat, lon=p.lon) for p in points]
    query = CorridorQuery(mode="corridor", points=polyline, radius_m=float(payload.global_.bufferM))
    body = CreateRequestBody(
        dataset_id=_composition_default_dataset_id(),
        lod_key=payload.global_.lod,
        query=query,
    )
    service = _get_tileset_service()
    try:
        result = service.create_request(body, base_url=str(request.base_url).rstrip("/"))
    except Exception as e:
        logger.exception("preview tileset failed")
        raise HTTPException(status_code=500, detail=f"tileset build failed: {e}")
    return {
        "request_id": result.request_id,
        "tileset_url": result.tileset_url,
    }


@router.get("/{composition_id}")
def get_composition(composition_id: str, request: Request) -> dict:
    doc = composition_service.get_composition(composition_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="composition not found")
    data = doc.get("data", {})
    # サーバ側で _doc URL を動的に挿入
    data["_doc"] = _spec_url(request)
    return data


@router.get("/{composition_id}/tileset")
def get_composition_tileset(composition_id: str, request: Request) -> dict:
    doc = composition_service.get_composition(composition_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="composition not found")
    data = doc.get("data", {})
    points = data.get("points", [])
    if len(points) < 2:
        raise HTTPException(status_code=400, detail="composition needs at least 2 points")
    buffer_m = float(data.get("global", {}).get("bufferM", 100))
    lod = data.get("global", {}).get("lod", "lod2")

    query = CorridorQuery(
        mode="corridor",
        points=[QueryPoint(lat=p["lat"], lon=p["lon"]) for p in points],
        radius_m=buffer_m,
    )
    payload = CreateRequestBody(
        dataset_id=_composition_default_dataset_id(),
        lod_key=lod,
        query=query,
    )
    service = _get_tileset_service()
    try:
        result = service.create_request(payload, base_url=str(request.base_url).rstrip("/"))
    except Exception as e:
        logger.exception("tileset build failed for composition %s", composition_id)
        raise HTTPException(status_code=500, detail=f"tileset build failed: {e}")

    return {
        "request_id": result.request_id,
        "tileset_url": result.tileset_url,
        "viewer_url": result.viewer_url,
    }
