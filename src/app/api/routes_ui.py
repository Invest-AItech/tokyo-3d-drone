from fastapi import APIRouter
from fastapi.responses import RedirectResponse, Response
from app.config import get_settings

router = APIRouter()

FIREBASE_LANDING = "https://invest-aitech-tokyo-drone.web.app/"


@router.get("/", include_in_schema=False)
async def root_redirect():
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
