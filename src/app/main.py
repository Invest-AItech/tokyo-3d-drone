from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import (
    routes_board,
    routes_compositions,
    routes_creator,
    routes_datasets,
    routes_health,
    routes_places,
    routes_requests,
    routes_ui,
    routes_warmup,
)
from app.config import get_settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    s = get_settings()
    s.runtime_root.mkdir(parents=True, exist_ok=True)
    s.requests_root.mkdir(parents=True, exist_ok=True)
    s.datasets_root.mkdir(parents=True, exist_ok=True)
    yield


settings = get_settings()
app = FastAPI(title=settings.app_name, lifespan=lifespan)

if settings.enable_cors:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.middleware("http")
async def no_cache_static_assets(request, call_next):
    """ /static/, /viewer/ の HTML/JS/CSS は ETag 検証を必ずさせる。
    モバイルブラウザが古い app.js をキャッシュから使い続けて
    新しい挙動が反映されない問題への対処。 """
    response = await call_next(request)
    path = request.url.path
    if path.startswith("/static/") or path.startswith("/viewer"):
        response.headers["Cache-Control"] = "no-cache, must-revalidate"
    return response


# Order matters: routes_ui has `/` redirect, register first
app.include_router(routes_ui.router)
app.include_router(routes_health.router)
app.include_router(routes_warmup.router)
# Bare router (no /api/v1 prefix) — routes_creator owns /viewer (HTML page) and /board (HTML page)
app.include_router(routes_creator.router)
# /api/v1 routers
app.include_router(routes_requests.router, prefix=settings.api_v1_prefix)
app.include_router(routes_compositions.router, prefix=settings.api_v1_prefix)
app.include_router(routes_board.router, prefix=settings.api_v1_prefix)
app.include_router(routes_places.router, prefix=settings.api_v1_prefix)
app.include_router(routes_datasets.router, prefix=settings.api_v1_prefix)


# Mounts: order matters — runtime + viewer 静的配信を /static より先に
app.mount(
    "/runtime",
    StaticFiles(directory=str(settings.runtime_root), check_dir=False, follow_symlink=True),
    name="runtime",
)
app.mount(
    "/static",
    StaticFiles(
        directory=str(Path(__file__).resolve().parent / "static"),
        check_dir=False,
    ),
    name="static",
)
