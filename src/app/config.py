from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "TOKYO 3D Drone"
    app_env: str = "local"
    api_v1_prefix: str = "/api/v1"

    gcp_project_id: str = "plateau-3d-app"
    maptiler_api_key: str = ""
    google_places_api_key: str = ""
    places_api_timeout_s: float = 5.0

    # ---- Tileset / corridor pipeline ----
    runtime_root: Path = Path("./runtime")
    requests_dirname: str = "requests"
    datasets_dirname: str = "datasets"
    viewer_dirname: str = "app/static/viewer"

    request_root_ge: float = 2048.0
    request_child_ge: float = 0.0
    default_max_sse: float = 8.0
    request_id_bytes: int = Field(default=6, ge=4, le=32)
    validate_asset_existence: bool = True
    plateau_height_offset_m: float = -40.0

    enable_cors: bool = True
    cors_allow_origins: str = "*"

    # ---- Community board ----
    recaptcha_site_key: str = ""
    recaptcha_score_threshold: float = 0.5
    ip_hash_salt: str = "dev-salt-do-not-use-in-prod"
    rate_limit_window_sec: int = 60
    rate_limit_max_posts: int = 5
    firestore_project_id: str = ""
    preset_url_allowed_hosts: str = "invest-aitech-tokyo-drone.web.app,localhost,127.0.0.1"

    firebase_landing_url: str = "https://invest-aitech-tokyo-drone.web.app/"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    @property
    def requests_root(self) -> Path:
        return self.runtime_root / self.requests_dirname

    @property
    def datasets_root(self) -> Path:
        return self.runtime_root / self.datasets_dirname

    @property
    def viewer_root(self) -> Path:
        viewer_path = Path(self.viewer_dirname)
        if viewer_path.is_absolute():
            return viewer_path
        return Path(__file__).resolve().parent / "static" / "viewer"

    @property
    def cors_origins(self) -> list[str]:
        if self.cors_allow_origins.strip() == "*":
            return ["*"]
        return [item.strip() for item in self.cors_allow_origins.split(",") if item.strip()]

    @property
    def firestore_project(self) -> str:
        """Resolve Firestore project: explicit setting > Cloud Run auto-injected env var."""
        return self.firestore_project_id or os.environ.get("GOOGLE_CLOUD_PROJECT", "")

    @property
    def preset_url_allowed_hosts_list(self) -> list[str]:
        return [h.strip() for h in self.preset_url_allowed_hosts.split(",") if h.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
