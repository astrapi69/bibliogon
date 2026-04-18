"""Generic WebSocket hub for real-time event broadcasting.

Not audiobook-specific. Supports topic-based subscriptions so
multiple features can share the same infrastructure:

- ``audiobook:{book_id}`` for audiobook export events
- ``book:{book_id}`` for general book update events (reserved)
- ``plugin:{name}:events`` for plugin events (reserved)

Clients connect to ``/api/ws/{topic}`` and receive JSON messages.
The connection is server-push only for now; client messages are
read (to keep the connection alive) but not processed.

Usage from backend code::

    from app.routers.websocket import manager

    await manager.broadcast("audiobook:abc123", {
        "event": "chapter_persisted",
        "chapter": {"title": "Vorwort", "duration_seconds": 42},
    })
"""

import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

router = APIRouter()


class ConnectionManager:
    """Topic-based WebSocket connection manager.

    Thread-safe for the single-process asyncio model that Bibliogon
    uses (all access happens on the event loop). For multi-process
    deployments a Redis pub/sub layer would sit in front - but that's
    explicitly out of scope until needed.
    """

    def __init__(self) -> None:
        self._subscriptions: dict[str, set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, topic: str) -> None:
        await websocket.accept()
        self._subscriptions.setdefault(topic, set()).add(websocket)
        logger.debug("WS connected: topic=%s, clients=%d", topic, len(self._subscriptions[topic]))

    def disconnect(self, websocket: WebSocket, topic: str) -> None:
        conns = self._subscriptions.get(topic)
        if conns:
            conns.discard(websocket)
            if not conns:
                del self._subscriptions[topic]

    async def broadcast(self, topic: str, message: dict[str, Any]) -> None:
        """Send a JSON message to all clients subscribed to ``topic``.

        Dead connections are silently removed. Never raises.
        """
        conns = self._subscriptions.get(topic)
        if not conns:
            return
        dead: list[WebSocket] = []
        for ws in conns:
            try:
                await ws.send_json(message)
            except Exception:  # noqa: BLE001
                dead.append(ws)
        for ws in dead:
            conns.discard(ws)
        if not conns:
            self._subscriptions.pop(topic, None)

    def topic_count(self, topic: str) -> int:
        """Number of active subscribers for a topic. Useful for tests."""
        return len(self._subscriptions.get(topic, set()))


manager = ConnectionManager()


@router.websocket("/ws/{topic}")
async def websocket_endpoint(websocket: WebSocket, topic: str) -> None:
    """Accept a WebSocket connection and subscribe it to ``topic``.

    The connection stays open until the client disconnects. Client
    messages are consumed (keeping the TCP connection alive) but not
    processed - this is a server-push channel.
    """
    await manager.connect(websocket, topic)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket, topic)
