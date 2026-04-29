import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.composition_models import Composition
from app.main import app

SAMPLES_DIR = (
    Path(__file__).resolve().parents[1] / "app" / "static" / "viewer" / "samples"
)


def test_creator_index_returns_html():
    client = TestClient(app)
    r = client.get("/viewer/")
    assert r.status_code == 200
    assert "text/html" in r.headers["content-type"]
    assert "viewer" in r.text.lower() or "creator" in r.text.lower()


def test_creator_spec_returns_markdown_rendered():
    client = TestClient(app)
    r = client.get("/viewer/spec")
    assert r.status_code == 200
    assert "text/html" in r.headers["content-type"]
    # 仕様ページには必ず "composition" が含まれる
    assert "composition" in r.text.lower()


def test_creator_spec_lists_sample_compositions():
    client = TestClient(app)
    r = client.get("/viewer/spec")
    assert r.status_code == 200
    # 5 サンプルが全て参照されている
    for stem in [
        "01-skytree",
        "02-tokyo-tower",
        "03-shinjuku",
        "04-tokyo-station",
        "05-shibuya",
    ]:
        assert f"samples/{stem}.json" in r.text


def test_creator_spec_has_copy_button():
    client = TestClient(app)
    r = client.get("/viewer/spec")
    assert r.status_code == 200
    assert "copy-spec" in r.text


@pytest.mark.parametrize("path", sorted(SAMPLES_DIR.glob("*.json")))
def test_each_sample_validates_against_composition_model(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    Composition.model_validate(data)
