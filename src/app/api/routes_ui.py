from fastapi import APIRouter
from fastapi.responses import RedirectResponse

router = APIRouter()

FIREBASE_LANDING = "https://invest-aitech-tokyo-drone.web.app/"


@router.get("/", include_in_schema=False)
async def root_redirect():
    return RedirectResponse(FIREBASE_LANDING, status_code=301)
