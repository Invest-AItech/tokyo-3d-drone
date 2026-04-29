from fastapi import FastAPI
from app.api import routes_health, routes_warmup

app = FastAPI(title="TOKYO 3D Drone")
app.include_router(routes_health.router)
app.include_router(routes_warmup.router)
