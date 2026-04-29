from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.services import board_service


def test_collection_name_is_drone_posts():
    """Drone uses drone_posts (NOT posts) for collection name in Firestore."""
    from app.services import board_service
    # Either module-level constants OR direct use — both should resolve to drone_posts.
    # If v1 used POSTS_COLLECTION, that constant must now be "drone_posts".
    src = open(board_service.__file__, encoding="utf-8").read()
    assert getattr(board_service, "POSTS_COLLECTION", "") == "drone_posts" or "drone_posts" in src
    assert getattr(board_service, "RATE_LIMITS_COLLECTION", "") == "drone_rate_limits" or "drone_rate_limits" in src


@pytest.fixture
def mock_firestore():
    with patch("app.services.board_service._get_client") as mock_client:
        client = MagicMock()
        mock_client.return_value = client
        yield client


def _doc(data: dict, doc_id: str) -> MagicMock:
    d = MagicMock()
    d.to_dict.return_value = data
    d.id = doc_id
    d.exists = True
    return d


def test_hash_ip_is_deterministic_and_truncated() -> None:
    h1 = board_service.hash_ip("1.2.3.4")
    h2 = board_service.hash_ip("1.2.3.4")
    assert h1 == h2
    assert len(h1) == 12  # truncated SHA256


def test_hash_ip_differs_per_input() -> None:
    assert board_service.hash_ip("1.2.3.4") != board_service.hash_ip("5.6.7.8")


def test_create_post_writes_to_firestore(mock_firestore) -> None:
    posts_ref = MagicMock()
    new_doc = MagicMock()
    new_doc.id = "abc123"
    posts_ref.add.return_value = (None, new_doc)
    mock_firestore.collection.return_value = posts_ref

    post_id = board_service.create_post(
        title="t",
        comment=None,
        author_name=None,
        preset_url="https://plateau-route-3d-tcus2zi5tq-an.a.run.app/viewer/?p=ey",
    )
    assert post_id == "abc123"
    posts_ref.add.assert_called_once()
    written_doc = posts_ref.add.call_args[0][0]
    assert written_doc["title"] == "t"
    assert written_doc["likes"] == 0
    assert written_doc["status"] == "active"


def test_list_posts_top_orders_by_likes_desc(mock_firestore) -> None:
    posts_ref = MagicMock()
    query = MagicMock()
    query.where.return_value = query
    query.order_by.return_value = query
    query.limit.return_value = query
    query.start_after.return_value = query
    query.stream.return_value = [
        _doc({"title": "a", "likes": 5, "createdAt": datetime.now(timezone.utc), "status": "active"}, "1"),
        _doc({"title": "b", "likes": 2, "createdAt": datetime.now(timezone.utc), "status": "active"}, "2"),
    ]
    posts_ref.where.return_value = query
    mock_firestore.collection.return_value = posts_ref

    posts, cursor = board_service.list_posts(sort="top", limit=5, cursor=None)
    assert [p["title"] for p in posts] == ["a", "b"]
    assert cursor is None  # less than limit, no next


def test_like_post_first_time_increments(mock_firestore) -> None:
    voter_ref = MagicMock()
    voter_snap = MagicMock()
    voter_snap.exists = False
    voter_ref.get.return_value = voter_snap

    post_ref = MagicMock()
    post_snap = MagicMock()
    post_snap.exists = True
    post_snap.to_dict.return_value = {"likes": 4}
    post_ref.get.return_value = post_snap
    post_ref.collection.return_value.document.return_value = voter_ref

    mock_firestore.collection.return_value.document.return_value = post_ref

    res = board_service.like_post("abc", anon_id="z")
    assert res["alreadyVoted"] is False
    assert res["likes"] == 5
    voter_ref.set.assert_called_once()
    post_ref.update.assert_called_once()


def test_like_post_second_time_no_increment(mock_firestore) -> None:
    voter_ref = MagicMock()
    voter_snap = MagicMock()
    voter_snap.exists = True
    voter_ref.get.return_value = voter_snap

    post_ref = MagicMock()
    post_snap = MagicMock()
    post_snap.exists = True
    post_snap.to_dict.return_value = {"likes": 5}
    post_ref.get.return_value = post_snap
    post_ref.collection.return_value.document.return_value = voter_ref

    mock_firestore.collection.return_value.document.return_value = post_ref

    res = board_service.like_post("abc", anon_id="z")
    assert res["alreadyVoted"] is True
    assert res["likes"] == 5
    voter_ref.set.assert_not_called()
    post_ref.update.assert_not_called()


def test_like_post_missing_post_raises(mock_firestore) -> None:
    voter_ref = MagicMock()
    voter_snap = MagicMock()
    voter_snap.exists = False
    voter_ref.get.return_value = voter_snap

    post_ref = MagicMock()
    post_snap = MagicMock()
    post_snap.exists = False
    post_ref.get.return_value = post_snap
    post_ref.collection.return_value.document.return_value = voter_ref

    mock_firestore.collection.return_value.document.return_value = post_ref

    with pytest.raises(ValueError, match="post not found"):
        board_service.like_post("missing", anon_id="z")


def test_rate_limit_under_threshold_allows(mock_firestore) -> None:
    rl_ref = MagicMock()
    rl_snap = MagicMock()
    rl_snap.exists = True
    rl_snap.to_dict.return_value = {"recent": [datetime.now(timezone.utc) - timedelta(seconds=10)]}
    rl_ref.get.return_value = rl_snap

    mock_firestore.collection.return_value.document.return_value = rl_ref

    assert board_service.check_rate_limit("ip-hash", window=60, max_posts=5) is True
    rl_ref.set.assert_called_once()


def test_rate_limit_at_threshold_blocks(mock_firestore) -> None:
    now = datetime.now(timezone.utc)
    rl_ref = MagicMock()
    rl_snap = MagicMock()
    rl_snap.exists = True
    rl_snap.to_dict.return_value = {
        "recent": [now - timedelta(seconds=i) for i in range(5)]
    }
    rl_ref.get.return_value = rl_snap

    mock_firestore.collection.return_value.document.return_value = rl_ref

    assert board_service.check_rate_limit("ip-hash", window=60, max_posts=5) is False
    rl_ref.set.assert_not_called()


@patch("app.services.board_service._get_client")
def test_create_post_with_composition_type(mock_get_client) -> None:
    mock_db = MagicMock()
    mock_get_client.return_value = mock_db
    mock_doc_ref = MagicMock()
    mock_doc_ref.id = "doc-xyz"
    mock_db.collection.return_value.add.return_value = (None, mock_doc_ref)

    new_id = board_service.create_post(
        title="t",
        comment=None,
        author_name=None,
        preset_url="https://x.com/?id=abc12345",
        post_type="composition",
        composition_id="abc12345",
    )
    assert new_id == "doc-xyz"
    saved = mock_db.collection.return_value.add.call_args[0][0]
    assert saved["postType"] == "composition"
    assert saved["compositionId"] == "abc12345"


@patch("app.services.board_service._get_client")
def test_create_post_defaults_to_preset(mock_get_client) -> None:
    mock_db = MagicMock()
    mock_get_client.return_value = mock_db
    mock_doc_ref = MagicMock()
    mock_doc_ref.id = "doc-abc"
    mock_db.collection.return_value.add.return_value = (None, mock_doc_ref)

    board_service.create_post(
        title="t",
        comment=None,
        author_name=None,
        preset_url="https://x.com/?p=ABC",
    )
    saved = mock_db.collection.return_value.add.call_args[0][0]
    assert saved["postType"] == "preset"
    assert saved["compositionId"] is None


def test_rate_limit_old_entries_pruned(mock_firestore) -> None:
    now = datetime.now(timezone.utc)
    rl_ref = MagicMock()
    rl_snap = MagicMock()
    rl_snap.exists = True
    # 5 entries but all older than the 60s window — should be pruned and allow
    rl_snap.to_dict.return_value = {
        "recent": [now - timedelta(seconds=120 + i) for i in range(5)]
    }
    rl_ref.get.return_value = rl_snap

    mock_firestore.collection.return_value.document.return_value = rl_ref

    assert board_service.check_rate_limit("ip-hash", window=60, max_posts=5) is True
