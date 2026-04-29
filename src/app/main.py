from fastapi import FastAPI
from app.api import routes_health

app = FastAPI(title="TOKYO 3D Drone")
app.include_router(routes_health.router)
