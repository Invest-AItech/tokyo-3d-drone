"""Smoke checks for the Firebase landing static asset.

The firebase/public/index.html is deployed to Firebase Hosting (not Cloud Run),
but it lives in this repo and must satisfy the contract:
  - Hardcoded CTA link → Cloud Run /viewer/ (NOT /start)
  - Cloud Run warmup fetch fires on page load
  - Static assets paths use /static/* (mirrored under firebase/public/static)
  - Rich content (cmd-bar, hero-visual, sec sections, cross-link) is present
"""
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
LANDING = REPO_ROOT / "firebase" / "public" / "index.html"


@pytest.fixture(scope="module")
def html() -> str:
    assert LANDING.exists(), f"missing: {LANDING}"
    return LANDING.read_text(encoding="utf-8")


def test_firebase_landing_exists(html: str) -> None:
    assert "<html" in html.lower()
    assert "TOKYO 3D Drone" in html


def test_cta_points_to_cloud_run_viewer(html: str) -> None:
    """The 'アプリを試す' CTA must go DIRECTLY to /viewer/ (skip /start)."""
    assert 'href="https://tokyo-3d-drone-tcus2zi5tq-an.a.run.app/viewer/"' in html
    # No leftover /start link should remain on Firebase landing
    assert "/start" not in html


def test_warmup_fires_on_load(html: str) -> None:
    assert "/warmup" in html
    assert 'mode: "no-cors"' in html or "mode:'no-cors'" in html
    assert 'cache: "no-store"' in html or "cache:'no-store'" in html


def test_static_asset_paths_present(html: str) -> None:
    """All required static assets must be referenced under /static/* path."""
    required = [
        "/static/css/landing.css",
        "/static/css/app-header.css",
        "/static/css/lang-toggle.css",
        "/static/css/cross-link.css",
        "/static/css/i18n-en.css",
        "/static/js/i18n.js",
        "/static/js/sister-app.js",
        "/static/locales/ja.json",
        "/static/locales/en.json",
    ]
    for asset in required:
        assert asset in html, f"missing asset reference: {asset}"


def test_static_assets_mirrored_to_firebase_public(html: str) -> None:
    """Each /static/* reference must resolve to a real file under firebase/public."""
    static_root = REPO_ROOT / "firebase" / "public" / "static"
    expected_files = [
        "css/landing.css",
        "css/app-header.css",
        "css/lang-toggle.css",
        "css/cross-link.css",
        "css/i18n-en.css",
        "js/i18n.js",
        "js/sister-app.js",
        "locales/ja.json",
        "locales/en.json",
    ]
    for rel in expected_files:
        assert (static_root / rel).exists(), f"firebase mirror missing: {rel}"


def test_no_cloud_run_only_endpoints(html: str) -> None:
    """/api/config.js is a Cloud Run endpoint and would 404 on Firebase."""
    assert "/api/config.js" not in html
    # board.js loads from /api/v1/board → board lives on Cloud Run only
    assert "/static/js/board.js" not in html


def test_rich_content_sections(html: str) -> None:
    """Confirm the migrated landing has rich, descriptive content (not just hero)."""
    # cmd-bar nav with all 5 tabs
    assert 'class="cmd-bar"' in html
    assert 'data-tab="overview"' in html
    assert 'data-tab="features"' in html
    assert 'data-tab="controls"' in html
    assert 'data-tab="board"' in html
    assert 'data-tab="launch"' in html
    # hero with multi-waypoint SVG (5 markers)
    assert "hero-visual" in html
    assert "marker marker-5" in html
    # sec sections
    assert 'id="how"' in html
    assert 'id="features"' in html
    assert 'id="controls"' in html
    assert 'id="freelook"' in html
    assert 'id="tech"' in html
    # cross-link to other 2 missions
    assert "MISSION 01 · VIEW" in html or "MISSION 01" in html
    assert "MISSION 02" in html


def test_i18n_locale_files_match_cloud_run(html: str) -> None:
    """Firebase mirror locales must equal Cloud Run originals (drift = bug)."""
    cr_ja = (REPO_ROOT / "src" / "app" / "static" / "locales" / "ja.json").read_text(
        encoding="utf-8"
    )
    fb_ja = (REPO_ROOT / "firebase" / "public" / "static" / "locales" / "ja.json").read_text(
        encoding="utf-8"
    )
    assert cr_ja == fb_ja, "locales/ja.json drift between Cloud Run and Firebase"

    cr_en = (REPO_ROOT / "src" / "app" / "static" / "locales" / "en.json").read_text(
        encoding="utf-8"
    )
    fb_en = (REPO_ROOT / "firebase" / "public" / "static" / "locales" / "en.json").read_text(
        encoding="utf-8"
    )
    assert cr_en == fb_en, "locales/en.json drift between Cloud Run and Firebase"
