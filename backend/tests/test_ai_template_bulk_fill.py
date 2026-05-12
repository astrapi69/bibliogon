"""End-to-end tests for the bulk AI-fill endpoints (estimate
+ start + SSE).

UNIVERSAL-AI-TEMPLATE-01 Session 1, commit 9/10. LLM patched
throughout. Pins:

- Estimate carries per-item breakdown AND totals (carry-forward
  Q6), with field-class-by-field-class detail per item.
- Estimate is cost-known when the configured model is in
  PROVIDER_PRICING, None otherwise.
- Start submits a background job and returns job_id.
- The job worker emits start / item_start / item_done /
  item_skipped / item_error / done events, plus the standard
  stream_end from job_store on terminal status.
- Per-item failure isolation: one LLMError lands as item_done
  with field_class_errors populated, the next item still runs.
- Article ai_tokens_used is bumped per item; book likewise.
- Cap MAX_BULK_AI_FILL = 50 enforced via Pydantic max_length.
- Missing IDs surface as 404 at the start endpoint.
- Force semantics propagate to the per-item fill.
- Rate-limit pacing reads ai.rate_limit_seconds; tests force
  it to 0 to keep the suite fast.
"""

from __future__ import annotations

import asyncio
import json
import time
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.ai.llm_client import LLMError
from app.job_store import job_store
from app.main import app


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def enable_ai():
    with patch("app.ai.routes._is_ai_enabled", return_value=True):
        yield


@pytest.fixture(autouse=True)
def fast_rate_limit():
    """Force rate-limit to 0 in tests so we never wait between
    items. The production default of 1.0 second is verified
    separately via _get_rate_limit_seconds unit tests."""
    with patch(
        "app.routers.ai_template_bulk_fill._get_rate_limit_seconds",
        return_value=0.0,
    ):
        yield


@pytest.fixture(autouse=True)
def stub_model_config():
    """Stub the configured model so estimate cost calculations
    return concrete USD values rather than None."""

    def _stub() -> dict:
        return {
            "model": "gpt-4o",
            "enabled": True,
            "base_url": "http://localhost:1234/v1",
            "rate_limit_seconds": 0.0,
        }

    with patch("app.ai.routes._get_ai_config", side_effect=_stub):
        yield


TIPTAP = json.dumps(
    {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": "Body text for the article."}],
            }
        ],
    }
)


def _create_article(client: TestClient, *, title: str) -> dict:
    resp = client.post(
        "/api/articles", json={"title": title, "language": "en"}
    )
    article = resp.json()
    client.patch(
        f"/api/articles/{article['id']}", json={"content_json": TIPTAP}
    )
    return client.get(f"/api/articles/{article['id']}").json()


def _create_book_with_chapter(client: TestClient, title: str) -> dict:
    resp = client.post(
        "/api/books",
        json={"title": title, "language": "en", "author": "Test"},
    )
    book = resp.json()
    client.post(
        f"/api/books/{book['id']}/chapters",
        json={"title": "Chapter 1", "content": TIPTAP},
    )
    return book


def _llm_result(yaml_payload: str, *, model: str = "gpt-4o") -> dict[str, Any]:
    return {
        "content": yaml_payload,
        "model": model,
        "usage": {
            "prompt_tokens": 100,
            "completion_tokens": 20,
            "total_tokens": 120,
        },
    }


def _patch_chat(responses: list[Any]):
    chat = AsyncMock(side_effect=responses)

    class _FakeClient:
        async def chat(self, *a, **kw):
            return await chat(*a, **kw)

    return patch("app.ai.routes._get_client", return_value=_FakeClient()), chat


async def _drain_stream(client: TestClient, url: str) -> list[dict[str, Any]]:
    """Subscribe to the SSE stream and collect every event
    until stream_end. Uses the httpx streaming API."""
    events: list[dict[str, Any]] = []
    with client.stream("GET", url) as resp:
        for line in resp.iter_lines():
            if isinstance(line, bytes):
                line = line.decode("utf-8")
            if not line or not line.startswith("data: "):
                continue
            payload = json.loads(line[len("data: ") :])
            events.append(payload)
            if payload.get("type") == "stream_end":
                break
    return events


def _wait_for_job(timeout: float = 3.0) -> None:
    """Yield control briefly so the asyncio task driving the
    submitted job can make progress. Without this the test's
    synchronous reads see only the initial event(s)."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        time.sleep(0.05)


# ---------------------------------------------------------------------------
# Article estimate endpoint
# ---------------------------------------------------------------------------


def test_article_estimate_per_item_and_totals(client):
    a1 = _create_article(client, title="Alpha")
    a2 = _create_article(client, title="Beta")

    resp = client.post(
        "/api/articles/bulk-ai-fill/estimate",
        json={
            "ids": [a1["id"], a2["id"]],
            "field_classes": ["seo", "tags"],
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["model"] == "gpt-4o"
    assert body["field_classes"] == ["seo", "tags"]
    assert len(body["items"]) == 2

    for item in body["items"]:
        # Per-class breakdown present.
        assert set(item["per_class"].keys()) == {"seo", "tags"}
        for fc, breakdown in item["per_class"].items():
            assert breakdown["input_tokens"] > 0
            assert breakdown["output_tokens"] > 0
            assert breakdown["cost_usd"] is not None  # gpt-4o is priced
        # Per-item totals are the sum across classes.
        assert item["estimated_input_tokens"] == sum(
            v["input_tokens"] for v in item["per_class"].values()
        )
        assert item["estimated_output_tokens"] == sum(
            v["output_tokens"] for v in item["per_class"].values()
        )

    totals = body["totals"]
    assert totals["total_items"] == 2
    assert totals["total_field_class_calls"] == 4
    assert totals["estimated_input_tokens"] == sum(
        i["estimated_input_tokens"] for i in body["items"]
    )
    assert totals["estimated_cost_usd"] is not None


def test_article_estimate_cost_is_none_for_unknown_model(client):
    a = _create_article(client, title="X")
    with patch(
        "app.ai.routes._get_ai_config",
        return_value={"model": "some-local-model", "enabled": True},
    ):
        resp = client.post(
            "/api/articles/bulk-ai-fill/estimate",
            json={"ids": [a["id"]], "field_classes": ["seo"]},
        )
    body = resp.json()
    assert body["totals"]["estimated_cost_usd"] is None
    assert body["items"][0]["estimated_cost_usd"] is None
    # Token counts are still reported.
    assert body["items"][0]["estimated_input_tokens"] > 0


def test_article_estimate_missing_id_returns_404(client):
    resp = client.post(
        "/api/articles/bulk-ai-fill/estimate",
        json={"ids": ["nope"], "field_classes": ["seo"]},
    )
    assert resp.status_code == 404


def test_article_estimate_unknown_field_class_returns_400(client):
    a = _create_article(client, title="X")
    resp = client.post(
        "/api/articles/bulk-ai-fill/estimate",
        json={"ids": [a["id"]], "field_classes": ["nope"]},
    )
    assert resp.status_code == 400


def test_article_estimate_cap_enforced(client):
    ids = [f"id-{i}" for i in range(51)]
    resp = client.post(
        "/api/articles/bulk-ai-fill/estimate",
        json={"ids": ids, "field_classes": ["seo"]},
    )
    assert resp.status_code == 422


def test_article_estimate_cap_respects_runtime_config(client):
    """AI-FILL-CAP-CONFIG-01: a user editing
    ``ai.bulk.max_ai_fill`` in app.yaml raises the active cap
    without a restart. 51 ids previously rejected as 422
    now succeed end-to-end (404 because the synthesized ids
    don't exist in the DB, which is what we expect once the
    cap check has been cleared)."""
    ids = [f"id-{i}" for i in range(51)]
    with patch(
        "app.routers.ai_template_bulk_fill._get_active_bulk_ai_fill_cap",
        return_value=100,
    ):
        resp = client.post(
            "/api/articles/bulk-ai-fill/estimate",
            json={"ids": ids, "field_classes": ["seo"]},
        )
    # Cap is no longer the gate; the next check (article
    # existence) takes over and surfaces 404. The 422 path is
    # gone for this batch size under the elevated cap.
    assert resp.status_code != 422
    assert resp.status_code == 404


def test_article_start_cap_respects_runtime_config(client):
    """Same insurance for the /start endpoint. The runtime cap
    is read fresh per request, so lowering it via the helper
    must immediately reject a 5-id batch that the default 50
    would accept."""
    a = _create_article(client, title="Alpha")
    ids = [a["id"]] * 5  # ignore content; the cap check fires first
    with patch(
        "app.routers.ai_template_bulk_fill._get_active_bulk_ai_fill_cap",
        return_value=3,
    ):
        resp = client.post(
            "/api/articles/bulk-ai-fill/start",
            json={"ids": ids, "field_classes": ["seo"]},
        )
    assert resp.status_code == 422
    assert "cap is 3" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# Article start + SSE
# ---------------------------------------------------------------------------


def test_article_start_returns_job_id(client):
    a = _create_article(client, title="Alpha")
    p, _ = _patch_chat([_llm_result("seo_title: SEO\nseo_description: SD\n")])
    with p:
        resp = client.post(
            "/api/articles/bulk-ai-fill/start",
            json={"ids": [a["id"]], "field_classes": ["seo"]},
        )
    assert resp.status_code == 200
    job_id = resp.json()["job_id"]
    assert job_id

    # Poll the status endpoint until the job is terminal.
    for _ in range(40):
        status = client.get(
            f"/api/articles/bulk-ai-fill/jobs/{job_id}"
        ).json()
        if status["status"] in ("completed", "failed", "cancelled"):
            break
        time.sleep(0.05)
    assert status["status"] == "completed"


def test_article_start_emits_full_event_sequence(client):
    a1 = _create_article(client, title="Alpha")
    a2 = _create_article(client, title="Beta")
    p, _ = _patch_chat(
        [
            _llm_result("seo_title: A1\nseo_description: A1d\n"),
            _llm_result("seo_title: A2\nseo_description: A2d\n"),
        ]
    )
    with p:
        resp = client.post(
            "/api/articles/bulk-ai-fill/start",
            json={"ids": [a1["id"], a2["id"]], "field_classes": ["seo"]},
        )
        job_id = resp.json()["job_id"]
        events = asyncio.run(
            _drain_stream(client, f"/api/articles/bulk-ai-fill/jobs/{job_id}/stream")
        )

    types = [e["type"] for e in events]
    assert types[0] == "start"
    assert types.count("item_start") == 2
    assert types.count("item_done") == 2
    assert "done" in types
    assert types[-1] == "stream_end"

    start_data = events[0]["data"]
    assert start_data["total"] == 2
    assert start_data["field_classes"] == ["seo"]
    assert start_data["rate_limit_seconds"] == 0.0

    done = next(e for e in events if e["type"] == "done")
    assert done["data"]["total_items"] == 2
    assert done["data"]["items_updated"] == 2
    assert done["data"]["total_tokens"] == 240


def test_article_start_per_item_llm_error_isolated(client):
    a1 = _create_article(client, title="Alpha")
    a2 = _create_article(client, title="Beta")
    p, _ = _patch_chat(
        [
            LLMError("outage on item 1"),
            _llm_result("seo_title: B\nseo_description: Bd\n"),
        ]
    )
    with p:
        resp = client.post(
            "/api/articles/bulk-ai-fill/start",
            json={"ids": [a1["id"], a2["id"]], "field_classes": ["seo"]},
        )
        job_id = resp.json()["job_id"]
        events = asyncio.run(
            _drain_stream(client, f"/api/articles/bulk-ai-fill/jobs/{job_id}/stream")
        )

    item_dones = [e for e in events if e["type"] == "item_done"]
    # First item: LLM failed at the per-class level (no LLMError
    # bubbles up because fill_article_with_ai swallows it into
    # field_class_errors). So both items produce item_done.
    assert len(item_dones) == 2
    assert "seo" in item_dones[0]["data"]["field_class_errors"]
    assert item_dones[1]["data"]["updated_fields"] == ["seo_title", "seo_description"]


def test_article_start_skipped_when_no_body(client):
    a = _create_article(client, title="Alpha")
    # Wipe the content so the worker hits the no-content guard.
    client.patch(f"/api/articles/{a['id']}", json={"content_json": ""})
    p, chat = _patch_chat([])
    with p:
        resp = client.post(
            "/api/articles/bulk-ai-fill/start",
            json={"ids": [a["id"]], "field_classes": ["seo"]},
        )
        job_id = resp.json()["job_id"]
        events = asyncio.run(
            _drain_stream(client, f"/api/articles/bulk-ai-fill/jobs/{job_id}/stream")
        )
    types = [e["type"] for e in events]
    assert "item_skipped" in types
    skipped = next(e for e in events if e["type"] == "item_skipped")
    assert skipped["data"]["reason"] == "no-content"
    # LLM was never called (no responses queued).
    assert chat.await_count == 0


def test_article_start_disabled_ai_returns_403(client):
    a = _create_article(client, title="X")
    with patch("app.ai.routes._is_ai_enabled", return_value=False):
        resp = client.post(
            "/api/articles/bulk-ai-fill/start",
            json={"ids": [a["id"]], "field_classes": ["seo"]},
        )
    assert resp.status_code == 403


def test_article_start_unknown_id_returns_404(client):
    resp = client.post(
        "/api/articles/bulk-ai-fill/start",
        json={"ids": ["nope"], "field_classes": ["seo"]},
    )
    assert resp.status_code == 404


def test_article_start_cap_enforced(client):
    ids = [f"id-{i}" for i in range(51)]
    resp = client.post(
        "/api/articles/bulk-ai-fill/start",
        json={"ids": ids, "field_classes": ["seo"]},
    )
    assert resp.status_code == 422


def test_article_start_force_propagates(client):
    a = _create_article(client, title="Alpha")
    client.patch(f"/api/articles/{a['id']}", json={"seo_title": "Existing"})
    p, _ = _patch_chat(
        [_llm_result("seo_title: New\nseo_description: New desc\n")]
    )
    with p:
        resp = client.post(
            "/api/articles/bulk-ai-fill/start",
            json={
                "ids": [a["id"]],
                "field_classes": ["seo"],
                "force": True,
            },
        )
        job_id = resp.json()["job_id"]
        asyncio.run(
            _drain_stream(client, f"/api/articles/bulk-ai-fill/jobs/{job_id}/stream")
        )
    refreshed = client.get(f"/api/articles/{a['id']}").json()
    assert refreshed["seo_title"] == "New"


def test_article_ai_tokens_used_bumped_per_item(client):
    a = _create_article(client, title="Alpha")
    p, _ = _patch_chat([_llm_result("seo_title: x\nseo_description: y\n")])
    with p:
        resp = client.post(
            "/api/articles/bulk-ai-fill/start",
            json={"ids": [a["id"]], "field_classes": ["seo"]},
        )
        job_id = resp.json()["job_id"]
        asyncio.run(
            _drain_stream(client, f"/api/articles/bulk-ai-fill/jobs/{job_id}/stream")
        )
    refreshed = client.get(f"/api/articles/{a['id']}").json()
    assert refreshed["ai_tokens_used"] == 120


def test_article_stream_404_for_unknown_job(client):
    resp = client.get("/api/articles/bulk-ai-fill/jobs/nope/stream")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Book endpoints (smoke + cost-breakdown sanity)
# ---------------------------------------------------------------------------


def test_book_estimate_carries_chapter_count(client):
    book = _create_book_with_chapter(client, "Book Alpha")
    resp = client.post(
        "/api/books/bulk-ai-fill/estimate",
        json={
            "ids": [book["id"]],
            "field_classes": ["chapter_summaries", "cover_prompt"],
        },
    )
    body = resp.json()
    item = body["items"][0]
    assert item["chapter_count"] == 1
    assert "chapter_summaries" in item["per_class"]
    assert "cover_prompt" in item["per_class"]
    # Output-token estimate for chapter_summaries scales with
    # chapter count (50 tokens * 1 chapter).
    assert item["per_class"]["chapter_summaries"]["output_tokens"] == 50


def test_book_start_emits_full_event_sequence(client):
    book = _create_book_with_chapter(client, "Book Alpha")
    p, _ = _patch_chat([_llm_result("cover_image_prompt: a cover\n")])
    with p:
        resp = client.post(
            "/api/books/bulk-ai-fill/start",
            json={"ids": [book["id"]], "field_classes": ["cover_prompt"]},
        )
        job_id = resp.json()["job_id"]
        events = asyncio.run(
            _drain_stream(client, f"/api/books/bulk-ai-fill/jobs/{job_id}/stream")
        )
    types = [e["type"] for e in events]
    assert "start" in types
    assert "item_start" in types
    assert "item_done" in types
    assert "done" in types
    assert types[-1] == "stream_end"
    refreshed = client.get(f"/api/books/{book['id']}").json()
    assert refreshed["cover_image_prompt"] == "a cover"


def test_book_start_unknown_id_returns_404(client):
    resp = client.post(
        "/api/books/bulk-ai-fill/start",
        json={"ids": ["nope"], "field_classes": ["cover_prompt"]},
    )
    assert resp.status_code == 404


def test_book_start_cap_enforced(client):
    ids = [f"id-{i}" for i in range(51)]
    resp = client.post(
        "/api/books/bulk-ai-fill/start",
        json={"ids": ids, "field_classes": ["cover_prompt"]},
    )
    assert resp.status_code == 422


def test_book_stream_404_for_unknown_job(client):
    resp = client.get("/api/books/bulk-ai-fill/jobs/nope/stream")
    assert resp.status_code == 404
