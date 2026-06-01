"""Book.graph_layout persistence (STORY-BIBLE-RELATIONSHIP-GRAPH-01 C5).

The relationship graph saves node positions as a JSON object
{entity_id: {x, y}} on the book via the normal PATCH /books path. Pin
that it round-trips through the API and clears back to empty.
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _book() -> str:
    return client.post("/api/books", json={"title": "Graph Layout", "author": "A"}).json()["id"]


def test_graph_layout_defaults_to_null():
    book_id = _book()
    body = client.get(f"/api/books/{book_id}").json()
    assert body["graph_layout"] is None
    client.delete(f"/api/books/{book_id}")


def test_graph_layout_round_trips_via_patch():
    book_id = _book()
    layout = {"e1": {"x": 12.5, "y": -8.0}, "e2": {"x": 100, "y": 200}}
    r = client.patch(f"/api/books/{book_id}", json={"graph_layout": layout})
    assert r.status_code == 200, r.text

    body = client.get(f"/api/books/{book_id}").json()
    assert body["graph_layout"] == layout

    # Resetting to an empty object persists (the "Reset layout" path).
    client.patch(f"/api/books/{book_id}", json={"graph_layout": {}})
    assert client.get(f"/api/books/{book_id}").json()["graph_layout"] == {}

    client.delete(f"/api/books/{book_id}")
