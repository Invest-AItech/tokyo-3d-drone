import os
from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    gcp_project_id: str = "plateau-3d-app"
    maptiler_api_key: str = ""
    google_places_api_key: str = ""
    ip_hash_salt: str = "dev-salt"
    recaptcha_site_key: str = ""
    firebase_landing_url: str = "https://invest-aitech-tokyo-drone.web.app/"

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
