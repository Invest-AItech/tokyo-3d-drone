from __future__ import annotations

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.config import Settings
from app.services import api_rate_limit as rl

COLLECTION_NAME = "drone_api_rate_limits"

class _Snap:
    def __init__(self, data):
        self._data = data
        self.exists = data is not None

    def to_dict(self):
        return dict(self._data) if self._data is not None else None


class _Doc:
    def __init__(self, store, key):
        self._store, self._key = store, key

    def get(self, transaction=None, **kwargs):
        assert transaction is not None, "reads must happen inside the transaction"
        assert kwargs.get("timeout") and kwargs.get("retry") is not None
        return _Snap(self._store.get(self._key))


class FakeTxn:
    def __init__(self, store):
        self._store = store
        self.writes = 0

    def set(self, ref, data, merge=False):
        self.writes += 1
        cur = dict(self._store.get(ref._key) or {}) if merge else {}
        cur.update(data)
        self._store[ref._key] = cur


class _Coll:
    def __init__(self, store):
        self._store = store

    def document(self, key):
        return _Doc(self._store, key)


class FakeFirestore:
    def __init__(self):
        self.store = {}

    def collection(self, name):
        assert name == COLLECTION_NAME
        return _Coll(self.store)

    def transaction(self, max_attempts=5):
        self.txn = FakeTxn(self.store)
        return self.txn


def make_request(xff: str | None = None, host: str = "9.9.9.9") -> Request:
    headers = [(b"x-forwarded-for", xff.encode())] if xff is not None else []
    return Request({"type": "http", "headers": headers, "client": (host, 1234)})


@pytest.fixture
def fake_db(monkeypatch):
    db = FakeFirestore()
    monkeypatch.setattr(rl, "_get_client", lambda: db)
    used = []

    def fake_transactional(fn):
        def run(txn, *args):
            used.append(fn.__name__)
            return fn(txn, *args)

        return run

    monkeypatch.setattr(rl.firestore, "transactional", fake_transactional)
    db.transactional_used = used
    return db


def count(settings, scope, xff="1.1.1.1", n=1):
    for _ in range(n):
        rl.enforce_rate_limit(make_request(xff), scope, settings)


def test_client_ip_uses_last_xff_entry():
    assert rl.client_ip(make_request("1.2.3.4, 5.6.7.8")) == "5.6.7.8"


def test_client_ip_single_and_missing_header():
    assert rl.client_ip(make_request("5.6.7.8")) == "5.6.7.8"
    assert rl.client_ip(make_request(None, host="7.7.7.7")) == "7.7.7.7"
    assert rl.client_ip(make_request(" , ", host="7.7.7.7")) == "7.7.7.7"


def test_autocomplete_allows_up_to_window_limit_then_429(fake_db):
    s = Settings(rl_autocomplete_window_max=3, rl_autocomplete_day_max=100, rl_autocomplete_global_day_max=100)
    count(s, "autocomplete", n=3)
    with pytest.raises(HTTPException) as ei:
        count(s, "autocomplete")
    assert ei.value.status_code == 429
    assert "混み合っています" in ei.value.detail


def test_autocomplete_day_limit_blocks(fake_db):
    s = Settings(rl_autocomplete_window_max=100, rl_autocomplete_day_max=2, rl_autocomplete_global_day_max=100)
    count(s, "autocomplete", n=2)
    with pytest.raises(HTTPException) as ei:
        count(s, "autocomplete")
    assert ei.value.status_code == 429


def test_autocomplete_global_day_limit_blocks_other_ips(fake_db):
    s = Settings(rl_autocomplete_window_max=100, rl_autocomplete_day_max=100, rl_autocomplete_global_day_max=2)
    count(s, "autocomplete", xff="1.1.1.1")
    count(s, "autocomplete", xff="2.2.2.2")
    with pytest.raises(HTTPException) as ei:
        count(s, "autocomplete", xff="3.3.3.3")
    assert ei.value.status_code == 429


def test_autocomplete_other_ip_counted_separately(fake_db):
    s = Settings(rl_autocomplete_window_max=1, rl_autocomplete_day_max=100, rl_autocomplete_global_day_max=100)
    count(s, "autocomplete", xff="1.1.1.1")
    count(s, "autocomplete", xff="2.2.2.2")  # no exception
    with pytest.raises(HTTPException):
        count(s, "autocomplete", xff="1.1.1.1")


def test_autocomplete_forged_xff_prefix_does_not_evade(fake_db):
    s = Settings(rl_autocomplete_window_max=1, rl_autocomplete_day_max=100, rl_autocomplete_global_day_max=100)
    count(s, "autocomplete", xff="10.0.0.1, 8.8.8.8")
    with pytest.raises(HTTPException):
        count(s, "autocomplete", xff="10.0.0.2, 8.8.8.8")


def test_details_allows_up_to_window_limit_then_429(fake_db):
    s = Settings(rl_details_window_max=3, rl_details_day_max=100, rl_details_global_day_max=100)
    count(s, "details", n=3)
    with pytest.raises(HTTPException) as ei:
        count(s, "details")
    assert ei.value.status_code == 429
    assert "混み合っています" in ei.value.detail


def test_details_day_limit_blocks(fake_db):
    s = Settings(rl_details_window_max=100, rl_details_day_max=2, rl_details_global_day_max=100)
    count(s, "details", n=2)
    with pytest.raises(HTTPException) as ei:
        count(s, "details")
    assert ei.value.status_code == 429


def test_details_global_day_limit_blocks_other_ips(fake_db):
    s = Settings(rl_details_window_max=100, rl_details_day_max=100, rl_details_global_day_max=2)
    count(s, "details", xff="1.1.1.1")
    count(s, "details", xff="2.2.2.2")
    with pytest.raises(HTTPException) as ei:
        count(s, "details", xff="3.3.3.3")
    assert ei.value.status_code == 429


def test_details_other_ip_counted_separately(fake_db):
    s = Settings(rl_details_window_max=1, rl_details_day_max=100, rl_details_global_day_max=100)
    count(s, "details", xff="1.1.1.1")
    count(s, "details", xff="2.2.2.2")  # no exception
    with pytest.raises(HTTPException):
        count(s, "details", xff="1.1.1.1")


def test_details_forged_xff_prefix_does_not_evade(fake_db):
    s = Settings(rl_details_window_max=1, rl_details_day_max=100, rl_details_global_day_max=100)
    count(s, "details", xff="10.0.0.1, 8.8.8.8")
    with pytest.raises(HTTPException):
        count(s, "details", xff="10.0.0.2, 8.8.8.8")


def test_default_limits_places():
    s = Settings()
    assert rl.limits_for(s, "autocomplete") == rl.Limits(60, 300, 1000)
    assert rl.limits_for(s, "details") == rl.Limits(30, 150, 500)


def test_falls_back_to_memory_when_firestore_fails(monkeypatch):
    def boom():
        raise RuntimeError("no credentials")

    monkeypatch.setattr(rl, "_get_client", boom)
    s = Settings(rl_autocomplete_window_max=1, rl_autocomplete_day_max=100, rl_autocomplete_global_day_max=100)
    count(s, "autocomplete")
    with pytest.raises(HTTPException):
        count(s, "autocomplete")


def test_disabled_flag_skips_counting(fake_db):
    s = Settings(api_rate_limit_enabled=False, rl_autocomplete_window_max=1)
    count(s, "autocomplete", n=5)
    assert fake_db.store == {}


def test_firestore_documents_written(fake_db):
    count(Settings(), "autocomplete", xff="1.1.1.1")
    keys = sorted(fake_db.store)
    assert any(k.startswith("autocomplete_") for k in keys)
    glb = [k for k in keys if k.startswith("global_autocomplete_")]
    assert len(glb) == 1 and fake_db.store[glb[0]]["count"] == 1


# ---- endpoint wiring: counted BEFORE calling Google ----
import httpx
import respx
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app

from app.services.places_service import PLACES_AUTOCOMPLETE_URL


def _client(settings):
    app.dependency_overrides[get_settings] = lambda: settings
    return TestClient(app)


@respx.mock
def test_autocomplete_zero_hits_counts_second_google_call():
    # 0 件 -> 制限なしで再問合せ (Google 2 回) = 2 回と数える。上限 2 なので次の要求は 429
    settings = Settings(
        google_places_api_key="k", rl_autocomplete_window_max=2, rl_autocomplete_day_max=100
    )
    google = respx.post(PLACES_AUTOCOMPLETE_URL).mock(return_value=httpx.Response(200, json={}))
    try:
        c = _client(settings)
        body = {"query": "zzz", "locale": "en"}
        first = c.post("/api/v1/places/autocomplete", json=body)
        assert first.status_code == 200
        assert google.call_count == 2
        second = c.post("/api/v1/places/autocomplete", json=body)
    finally:
        app.dependency_overrides.clear()
    assert second.status_code == 429
    assert google.call_count == 2  # blocked before reaching Google


@respx.mock
def test_details_endpoint_429_without_calling_google():
    settings = Settings(google_places_api_key="k", rl_details_window_max=0, rl_details_day_max=0)
    google = respx.route().mock(return_value=httpx.Response(200, json={}))
    try:
        res = _client(settings).post(
            "/api/v1/places/details", json={"place_id": "p1", "locale": "en"}
        )
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 429
    assert not google.called


def test_check_runs_in_transaction_and_writes_both_docs(fake_db):
    s = Settings()
    count(s, "autocomplete")
    assert fake_db.transactional_used == ["_apply_limits"]
    assert fake_db.txn.writes == 2


def test_rejected_call_writes_nothing(fake_db):
    s = Settings(rl_autocomplete_window_max=1)
    count(s, "autocomplete")
    with pytest.raises(HTTPException):
        count(s, "autocomplete")
    assert fake_db.txn.writes == 0


def test_exactly_at_limit_is_rejected_one_below_is_allowed(fake_db):
    s = Settings(rl_autocomplete_window_max=2, rl_autocomplete_day_max=100, rl_autocomplete_global_day_max=100)
    count(s, "autocomplete")
    count(s, "autocomplete")  # 2nd allowed (count 1 < 2)
    with pytest.raises(HTTPException):  # 3rd: 2 >= 2
        count(s, "autocomplete")
