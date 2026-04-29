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
