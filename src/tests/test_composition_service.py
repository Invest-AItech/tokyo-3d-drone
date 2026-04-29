from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.services import composition_service


@patch("app.services.composition_service._get_client")
def test_save_composition_returns_short_id(mock_get_client):
    mock_db = MagicMock()
    mock_get_client.return_value = mock_db

    # collection().document(id).get() → not exists（衝突なし）
    mock_doc = MagicMock()
    mock_doc.get.return_value.exists = False
    mock_db.collection.return_value.document.return_value = mock_doc

    composition_data = {
        "v": 1,
        "global": {"tau": 0.4, "lookaheadM": 30, "bufferM": 100, "lod": "lod2", "cornerRadiusM": 20},
        "points": [
            {"id": "A", "lon": 139.7, "lat": 35.6, "altM": 50, "pitchDeg": -10, "headingRelDeg": 0},
            {"id": "B", "lon": 139.8, "lat": 35.6, "altM": 60, "pitchDeg": -10, "headingRelDeg": 0},
        ],
        "segments": [{"from": "A", "to": "B", "speedKmh": 80}],
    }
    new_id = composition_service.save_composition(
        data=composition_data, ip_hash="ab12cd34", name="test"
    )
    assert isinstance(new_id, str)
    assert 6 <= len(new_id) <= 12
    mock_doc.set.assert_called_once()
    saved = mock_doc.set.call_args[0][0]
    assert saved["status"] == "active"
    assert saved["ipHash"] == "ab12cd34"
    assert saved["name"] == "test"
    assert "createdAt" in saved


@patch("app.services.composition_service._get_client")
def test_get_composition_returns_data(mock_get_client):
    mock_db = MagicMock()
    mock_get_client.return_value = mock_db
    mock_snap = MagicMock()
    mock_snap.exists = True
    mock_snap.to_dict.return_value = {
        "id": "abc12345",
        "status": "active",
        "data": {"v": 1, "name": "x"},
    }
    mock_db.collection.return_value.document.return_value.get.return_value = mock_snap

    result = composition_service.get_composition("abc12345")
    assert result is not None
    assert result["data"]["name"] == "x"


@patch("app.services.composition_service._get_client")
def test_get_composition_returns_none_for_missing(mock_get_client):
    mock_db = MagicMock()
    mock_get_client.return_value = mock_db
    mock_snap = MagicMock()
    mock_snap.exists = False
    mock_db.collection.return_value.document.return_value.get.return_value = mock_snap

    assert composition_service.get_composition("missing") is None


@patch("app.services.composition_service._get_client")
def test_get_composition_returns_none_for_deleted(mock_get_client):
    mock_db = MagicMock()
    mock_get_client.return_value = mock_db
    mock_snap = MagicMock()
    mock_snap.exists = True
    mock_snap.to_dict.return_value = {"status": "deleted", "data": {}}
    mock_db.collection.return_value.document.return_value.get.return_value = mock_snap

    assert composition_service.get_composition("deleted-id") is None


@patch("app.services.composition_service.secrets")
@patch("app.services.composition_service._get_client")
def test_short_id_collision_retries(mock_get_client, mock_secrets):
    """衝突時はリトライして別 ID を発行する。"""
    mock_db = MagicMock()
    mock_get_client.return_value = mock_db

    # 1 回目: 衝突あり、2 回目: 衝突なし
    occupied = MagicMock()
    occupied.get.return_value.exists = True
    free = MagicMock()
    free.get.return_value.exists = False
    mock_db.collection.return_value.document.side_effect = [occupied, free]

    mock_secrets.token_urlsafe.side_effect = ["aaaaaaaa", "bbbbbbbb"]

    new_id = composition_service.save_composition(
        data={"v": 1, "name": "x"}, ip_hash="h"
    )
    assert new_id == "bbbbbbbb"
    assert mock_secrets.token_urlsafe.call_count == 2
