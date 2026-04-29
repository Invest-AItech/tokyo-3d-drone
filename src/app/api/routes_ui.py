import re
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import HTMLResponse, RedirectResponse, Response

from app.config import get_settings

router = APIRouter()

FIREBASE_LANDING = "https://invest-aitech-tokyo-drone.web.app/"

_STATIC_DIR = Path(__file__).resolve().parents[1] / "static"
_LANDING_PATH = _STATIC_DIR / "landing.html"


@router.get("/", include_in_schema=False)
async def root_redirect():
    return RedirectResponse(FIREBASE_LANDING, status_code=301)


def _render_landing(page_mode: str) -> HTMLResponse:
    raw = _LANDING_PATH.read_text(encoding="utf-8")
    if 'data-page=' in raw:
        new_html = re.sub(
            r'<body([^>]*)data-page="[^"]*"',
            f'<body\\1data-page="{page_mode}"',
            raw,
            count=1,
        )
    else:
        new_html = raw.replace("<body>", f'<body data-page="{page_mode}">', 1)
    return HTMLResponse(content=new_html)


@router.get("/board", include_in_schema=False)
def board() -> HTMLResponse:
    """コミュニティ掲示板ページ。"""
    return _render_landing("board")


@router.get("/start", include_in_schema=False)
def start():
    """旧 interactive landing。Firebase へ統合済みのため、Firebase ランディングへ 301 リダイレクト。"""
    return RedirectResponse(FIREBASE_LANDING, status_code=301)


@router.get("/api/config.js", include_in_schema=False)
async def config_js():
    s = get_settings()
    body = (
        f"window.MAPTILER_KEY = {repr(s.maptiler_api_key)};\n"
        f"window.RECAPTCHA_SITE_KEY = {repr(s.recaptcha_site_key)};\n"
    )
    return Response(
        content=body,
        media_type="application/javascript",
        headers={"Cache-Control": "no-store"},
    )
