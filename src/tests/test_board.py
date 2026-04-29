from __future__ import annotations

from fastapi.testclient import TestClient


def test_board_serves_landing_with_data_page_board(client: TestClient) -> None:
    response = client.get("/board")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert 'data-page="board"' in response.text


def test_board_contains_landing_content(client: TestClient) -> None:
    response = client.get("/board")
    assert response.status_code == 200
    assert "data-i18n" in response.text
