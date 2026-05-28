from __future__ import annotations

import pytest
from fastapi import HTTPException, WebSocketDisconnect

import obs.api.auth as auth_api
from obs.api.v1 import websocket as ws_api


class _FakeWebSocket:
    def __init__(
        self,
        *,
        headers: dict[str, str] | None = None,
        query_params: dict[str, str] | None = None,
        subprotocols: list[str] | None = None,
    ) -> None:
        self.headers = headers or {}
        self.query_params = query_params or {}
        self.scope = {"subprotocols": subprotocols or []}
        self.accepted = False
        self.close_calls: list[tuple[int | None, str | None]] = []

    async def accept(self) -> None:
        self.accepted = True

    async def close(self, code: int | None = None, reason: str | None = None) -> None:
        self.close_calls.append((code, reason))

    async def receive_json(self) -> dict:
        raise WebSocketDisconnect()

    async def send_json(self, _msg: dict) -> None:
        return None


class _DbStub:
    def __init__(self, has_key: bool) -> None:
        self.has_key = has_key
        self.updated = False

    async def fetchone(self, _query: str, _params: tuple):
        if self.has_key:
            return {"name": "automation-client"}
        return None

    async def execute_and_commit(self, _query: str, _params: tuple) -> None:
        self.updated = True


@pytest.mark.asyncio
async def test_authenticate_ws_rejects_missing_credentials():
    ws = _FakeWebSocket()
    ok, reason = await ws_api._authenticate_ws_request(ws)  # noqa: SLF001
    assert ok is False
    assert reason == "Missing credentials"


@pytest.mark.asyncio
async def test_websocket_endpoint_rejects_query_token_without_supported_auth():
    ws = _FakeWebSocket(query_params={"token": "legacy-query-token"})
    await ws_api.websocket_endpoint(ws)
    assert ws.accepted is False
    assert ws.close_calls == [(4001, "Missing credentials")]


@pytest.mark.asyncio
async def test_websocket_endpoint_accepts_subprotocol_jwt(monkeypatch):
    def _decode_token(token: str, expected_type: str = "access") -> str:
        if token == "valid.jwt.token" and expected_type == "access":
            return "admin"
        raise HTTPException(401, "invalid")

    monkeypatch.setattr(auth_api, "decode_token", _decode_token)

    ws = _FakeWebSocket(subprotocols=["obs.jwt.valid.jwt.token"])
    ws_api.init_ws_manager()
    try:
        await ws_api.websocket_endpoint(ws)
    finally:
        ws_api.reset_ws_manager()

    assert ws.accepted is True


@pytest.mark.asyncio
async def test_websocket_endpoint_accepts_api_key(monkeypatch):
    monkeypatch.setattr(auth_api, "hash_api_key", lambda key: f"hash:{key}")
    db = _DbStub(has_key=True)
    monkeypatch.setattr(ws_api, "get_db", lambda: db)

    ws = _FakeWebSocket(headers={"x-api-key": "obs_valid"})
    ws_api.init_ws_manager()
    try:
        await ws_api.websocket_endpoint(ws)
    finally:
        ws_api.reset_ws_manager()

    assert ws.accepted is True
    assert db.updated is True
