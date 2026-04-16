"""Tests for the generic WebSocket ConnectionManager."""

import pytest
from unittest.mock import AsyncMock, MagicMock

from app.routers.websocket import ConnectionManager


@pytest.fixture
def mgr():
    return ConnectionManager()


def _mock_ws():
    """Create a mock WebSocket with async send_json."""
    ws = AsyncMock()
    ws.send_json = AsyncMock()
    return ws


@pytest.mark.asyncio
async def test_broadcast_sends_to_subscribed_topic(mgr):
    ws1 = _mock_ws()
    ws2 = _mock_ws()
    await mgr.connect(ws1, "audiobook:book1")
    await mgr.connect(ws2, "audiobook:book2")

    await mgr.broadcast("audiobook:book1", {"event": "chapter_persisted"})

    ws1.send_json.assert_awaited_once_with({"event": "chapter_persisted"})
    ws2.send_json.assert_not_awaited()


@pytest.mark.asyncio
async def test_broadcast_to_empty_topic_is_noop(mgr):
    await mgr.broadcast("audiobook:ghost", {"event": "test"})
    # No exception, no side effects


@pytest.mark.asyncio
async def test_disconnect_removes_client(mgr):
    ws = _mock_ws()
    await mgr.connect(ws, "topic:a")
    assert mgr.topic_count("topic:a") == 1

    mgr.disconnect(ws, "topic:a")
    assert mgr.topic_count("topic:a") == 0

    # Broadcast after disconnect should not reach the client
    await mgr.broadcast("topic:a", {"event": "late"})
    ws.send_json.assert_not_awaited()


@pytest.mark.asyncio
async def test_broadcast_removes_dead_connections(mgr):
    alive = _mock_ws()
    dead = _mock_ws()
    dead.send_json = AsyncMock(side_effect=RuntimeError("connection closed"))

    await mgr.connect(alive, "topic:b")
    await mgr.connect(dead, "topic:b")
    assert mgr.topic_count("topic:b") == 2

    await mgr.broadcast("topic:b", {"event": "ping"})

    # Dead connection silently removed
    assert mgr.topic_count("topic:b") == 1
    alive.send_json.assert_awaited_once()


@pytest.mark.asyncio
async def test_multiple_topics_independent(mgr):
    ws = _mock_ws()
    await mgr.connect(ws, "topic:x")
    await mgr.connect(ws, "topic:y")

    await mgr.broadcast("topic:x", {"event": "x"})
    await mgr.broadcast("topic:y", {"event": "y"})

    assert ws.send_json.await_count == 2


@pytest.mark.asyncio
async def test_topic_count_zero_for_unknown(mgr):
    assert mgr.topic_count("nonexistent") == 0
