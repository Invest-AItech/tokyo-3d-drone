from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.api import (
    routes_board,
    routes_compositions,
    routes_creator,
    routes_datasets,
    routes_health,
    routes_places,
    routes_ui,
    routes_warmup,
)
from app.config import get_settings

settings = get_settings()
app = FastAPI(title=settings.app_name)

# Order matters: routes_ui has `/` redirect, register first
app.include_router(routes_ui.router)
app.include_router(routes_health.router)
app.include_router(routes_warmup.router)
# Bare routers (no /api/v1 prefix) — routes_creator owns /creator, /board
app.include_router(routes_creator.router)
# /api/v1 routers
app.include_router(routes_compositions.router, prefix=settings.api_v1_prefix)
app.include_router(routes_board.router, prefix=settings.api_v1_prefix)
app.include_router(routes_places.router, prefix=settings.api_v1_prefix)
app.include_router(routes_datasets.router, prefix=settings.api_v1_prefix)

# Static mount (will be used by Phase E later)
STATIC_DIR = Path(__file__).resolve().parent / "static"
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
