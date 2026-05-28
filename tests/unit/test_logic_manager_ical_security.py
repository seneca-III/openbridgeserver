from __future__ import annotations

import asyncio
import socket

import pytest

from obs.logic.manager import _build_ical_fetch_target, _is_public_http_url, _read_limited_response_body


def test_is_public_http_url_blocks_non_http_scheme() -> None:
    assert _is_public_http_url("file:///etc/passwd") is False


def test_is_public_http_url_blocks_loopback(monkeypatch) -> None:
    def _fake_getaddrinfo(*_args, **_kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 80))]

    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo)
    assert _is_public_http_url("http://localhost/calendar.ics") is False


def test_is_public_http_url_allows_public_ip(monkeypatch) -> None:
    def _fake_getaddrinfo(*_args, **_kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))]

    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo)
    assert _is_public_http_url("https://example.com/calendar.ics") is True


def test_is_public_http_url_rejects_malformed_port() -> None:
    assert _is_public_http_url("https://example.com:abc/calendar.ics") is False


def test_is_public_http_url_rejects_malformed_ipv6_url() -> None:
    assert _is_public_http_url("http://[::1") is False


def test_is_public_http_url_blocks_shared_address_space(monkeypatch) -> None:
    def _fake_getaddrinfo(*_args, **_kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("100.64.0.1", 80))]

    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo)
    assert _is_public_http_url("http://shared-space.example/calendar.ics") is False


def test_build_ical_fetch_target_pins_ip_and_sets_host_and_sni(monkeypatch) -> None:
    def _fake_getaddrinfo(*_args, **_kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))]

    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo)
    fetch_url, headers, extensions = _build_ical_fetch_target("https://example.com/calendar.ics")
    assert fetch_url == "https://93.184.216.34/calendar.ics"
    assert headers == {"Host": "example.com"}
    assert extensions == {"sni_hostname": "example.com"}


def test_read_limited_response_body_raises_on_large_response() -> None:
    class _FakeResponse:
        async def aiter_bytes(self):
            yield b"a" * 8
            yield b"b" * 8

    with pytest.raises(ValueError, match="iCal response too large"):
        asyncio.run(_read_limited_response_body(_FakeResponse(), 10))
