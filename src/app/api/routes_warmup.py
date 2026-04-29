from fastapi import APIRouter

router = APIRouter()


@router.get("/warmup")
async def warmup():
    return {"status": "warmed"}
