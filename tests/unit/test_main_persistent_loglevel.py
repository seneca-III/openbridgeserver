from __future__ import annotations

from types import SimpleNamespace

import pytest

from obs.main import _read_persistent_log_level, lifespan


class FakeDb:
    def __init__(self, row=None, exc: Exception | None = None) -> None:
        self.row = row
        self.exc = exc

    async def fetchone(self, _sql: str):
        if self.exc:
            raise self.exc
        return self.row


@pytest.mark.parametrize(
    ("row", "expected"),
    [
        ({"value": "debug"}, "DEBUG"),
        ({"value": "INFO"}, "INFO"),
        ({"value": "trace"}, None),
        ({"value": ""}, None),
        (None, None),
    ],
)
async def test_read_persistent_log_level(row, expected):
    assert await _read_persistent_log_level(FakeDb(row=row)) == expected


async def test_read_persistent_log_level_ignores_db_errors():
    assert await _read_persistent_log_level(FakeDb(exc=RuntimeError("missing table"))) is None


async def test_lifespan_uses_persisted_ringbuffer_config_and_stops_active_ringbuffer(monkeypatch):
    events: list[tuple[str, object]] = []

    class DbStub:
        async def fetchone(self, _sql: str):
            return None

        async def disconnect(self):
            events.append(("db_disconnect", None))

    class BusStub:
        def subscribe(self, event_type, handler):
            events.append(("subscribe", handler))

    class MqttStub:
        def on_write_request(self, handler):
            events.append(("write_request", handler))

        async def start(self):
            events.append(("mqtt_start", None))

        async def stop(self):
            events.append(("mqtt_stop", None))

    class RegistryStub:
        handle_value_event = object()

        def get_value(self, _dp_id=None):
            return None

        def count(self):
            return 0

    class RingBufferStub:
        handle_value_event = object()

        async def stop(self):
            events.append(("ringbuffer_stop", None))

    class LogicStub:
        async def start(self):
            events.append(("logic_start", None))

        async def stop(self):
            events.append(("logic_stop", None))

    class SchedulerStub:
        async def stop(self):
            events.append(("scheduler_stop", None))

    db = DbStub()
    ringbuffer = RingBufferStub()
    settings = SimpleNamespace(
        server=SimpleNamespace(log_level="WARNING"),
        database=SimpleNamespace(path="/tmp/obs.sqlite"),
        mosquitto=SimpleNamespace(
            passwd_file="/tmp/passwd",
            service_username="obs",
            service_password="secret",
            reload_command="true",
            reload_pid=None,
        ),
        mqtt=SimpleNamespace(host="localhost", port=1883, username="obs", password="secret"),
    )

    async def _noop_async(*_args, **_kwargs):
        return None

    monkeypatch.setattr("obs.config.get_settings", lambda: settings)
    monkeypatch.setattr("obs.log_buffer.LogBufferHandler.install", lambda *_args, **_kwargs: None)
    monkeypatch.setattr("obs.db.database.init_db", lambda _path: _async_value(db))
    monkeypatch.setattr("obs.db.database.get_db", lambda: db)
    monkeypatch.setattr("obs.api.auth.ensure_default_user", _noop_async)
    monkeypatch.setattr("obs.core.mqtt_passwd.rebuild_passwd_file", _noop_async)
    monkeypatch.setattr("obs.core.mqtt_passwd.reload_mosquitto", _noop_async)
    monkeypatch.setattr("obs.core.event_bus.init_event_bus", lambda: BusStub())
    monkeypatch.setattr("obs.core.mqtt_client.init_mqtt_client", lambda **_kwargs: MqttStub())
    monkeypatch.setattr("obs.core.registry.init_registry", lambda *_args, **_kwargs: _async_value(RegistryStub()))
    monkeypatch.setattr(
        "obs.ringbuffer.persisted_config.load_persisted_ringbuffer_config",
        lambda _db: _async_value(
            {
                "enabled": True,
                "max_entries": 42,
                "max_file_size_bytes": 1024,
                "max_age": 3600,
            }
        ),
    )
    monkeypatch.setattr(
        "obs.ringbuffer.ringbuffer.default_ringbuffer_disk_path",
        lambda path: f"{path}.ringbuffer",
    )
    monkeypatch.setattr("obs.ringbuffer.ringbuffer.set_ringbuffer_enabled", lambda enabled: events.append(("enabled", enabled)))

    async def _init_ringbuffer(**kwargs):
        events.append(("ringbuffer_path", kwargs["disk_path"]))
        return ringbuffer

    monkeypatch.setattr("obs.ringbuffer.ringbuffer.init_ringbuffer", _init_ringbuffer)
    monkeypatch.setattr("obs.ringbuffer.ringbuffer.get_optional_ringbuffer", lambda: ringbuffer)
    monkeypatch.setattr("obs.history.factory.init_history_plugin", _noop_async)
    monkeypatch.setattr("obs.history.factory.handle_value_event", object())
    monkeypatch.setattr("obs.api.v1.websocket.init_ws_manager", lambda: SimpleNamespace(handle_value_event=object()))
    monkeypatch.setattr(
        "obs.core.write_router.init_write_router",
        lambda *_args, **_kwargs: SimpleNamespace(handle=object(), handle_value_event=object()),
    )
    monkeypatch.setattr("obs.adapters.registry.start_all", _noop_async)
    monkeypatch.setattr("obs.adapters.registry.stop_all", _noop_async)
    monkeypatch.setattr("obs.adapters.registry.all_types", lambda: [])
    monkeypatch.setattr("obs.logic.manager.init_logic_manager", lambda **_kwargs: LogicStub())
    monkeypatch.setattr("obs.api.v1.autobackup.init_autobackup_scheduler", lambda **_kwargs: SchedulerStub())

    async with lifespan(SimpleNamespace()):
        assert ("enabled", True) in events
        assert ("ringbuffer_path", "/tmp/obs.sqlite.ringbuffer") in events

    assert ("ringbuffer_stop", None) in events
    assert ("db_disconnect", None) in events


async def _async_value(value):
    return value
