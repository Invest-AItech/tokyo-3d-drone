# src/tests/conftest.py
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

os.environ.setdefault("MAPTILER_API_KEY", "")
os.environ.setdefault("GOOGLE_PLACES_API_KEY", "")
os.environ.setdefault("IP_HASH_SALT", "test-salt")
os.environ.setdefault("RECAPTCHA_SITE_KEY", "")
os.environ.setdefault("GCP_PROJECT_ID", "plateau-3d-app")

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app


@pytest.fixture
def settings() -> Settings:
    return Settings(
        google_places_api_key="test-places-key",
        places_api_timeout_s=5.0,
    )


@pytest.fixture
def client(settings: Settings) -> TestClient:
    app.dependency_overrides[get_settings] = lambda: settings
    yield TestClient(app)
    app.dependency_overrides.clear()
