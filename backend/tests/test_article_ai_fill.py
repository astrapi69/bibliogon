"""End-to-end tests for ``POST /api/articles/{id}/ai-fill``.

UNIVERSAL-AI-TEMPLATE-01 Session 1, commit 5/10. The LLM is
patched everywhere so no network / API key is required.

Invariants pinned:

- AI disabled -> 403; empty body -> 400; unknown field-class
  -> 400; unknown article -> 404.
- Each field-class produces one LLM call.
- Per-class isolation: when one class's LLMError fires the
  rest still proceed and the error surfaces in
  ``field_class_errors``.
- Tokens accumulate to ``Article.ai_tokens_used`` even when
  no field ends up updated.
- ``estimated_cost_usd`` is set when the model is known
  (e.g. ``gpt-4o``) and None when unknown.
- Force semantics match commit 4: AI-returned null/empty
  always skips; existing populated values skip with
  force=false; force=true overwrites.
- inline_image_count override beats the H2 heuristic; the
  heuristic counts H2 nodes and caps at 5.
- Field-class -> response shape: each entry under
  ``field_class_results`` carries updated, skipped, tokens,
  cost_usd, error.
"""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.ai.llm_client import LLMError
from app.main import app


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def enable_ai():
    """Pretend AI is enabled for these tests so the 403 guard
    doesn't get in the way."""
    with patch("app.ai.routes._is_ai_enabled", return_value=True):
        yield


def _create_article(client: TestClient, content_json: str | None = None) -> dict:
    resp = client.post(
        "/api/articles", json={"title": "Test Article", "language": "en"}
    )
    assert resp.status_code == 201
    article = resp.json()
    if content_json:
        client.patch(
            f"/api/articles/{article['id']}", json={"content_json": content_json}
        )
        article = client.get(f"/api/articles/{article['id']}").json()
    return article


_TIPTAP_WITH_H2S = json.dumps(
    {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": "Intro paragraph."}],
            },
            {
                "type": "heading",
                "attrs": {"level": 2},
                "content": [{"type": "text", "text": "Section one"}],
            },
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": "Content one."}],
            },
            {
                "type": "heading",
                "attrs": {"level": 2},
                "content": [{"type": "text", "text": "Section two"}],
            },
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": "Content two."}],
            },
            {
                "type": "heading",
                "attrs": {"level": 2},
                "content": [{"type": "text", "text": "Section three"}],
            },
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": "Content three."}],
            },
        ],
    }
)


_TIPTAP_NO_H2 = json.dumps(
    {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": "Body without headings."}],
            }
        ],
    }
)


def _make_llm_result(
    yaml_payload: str,
    *,
    model: str = "gpt-4o",
    prompt_tokens: int = 100,
    completion_tokens: int = 50,
) -> dict[str, Any]:
    return {
        "content": yaml_payload,
        "model": model,
        "usage": {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens,
        },
    }


def _patch_chat(responses_by_call: list[dict[str, Any]]):
    """Patch _get_client so client.chat() returns the supplied
    responses in order. The patched chat is an AsyncMock with
    side_effect set."""
    chat_mock = AsyncMock(side_effect=responses_by_call)

    class _FakeClient:
        async def chat(self, *args, **kwargs):
            return await chat_mock(*args, **kwargs)

    return patch("app.ai.routes._get_client", return_value=_FakeClient()), chat_mock


# ---------------------------------------------------------------------------
# Guard rails
# ---------------------------------------------------------------------------


def test_ai_disabled_returns_403(client):
    # Override the autouse fixture for this test only.
    with patch("app.ai.routes._is_ai_enabled", return_value=False):
        resp = client.post(
            "/api/articles/anyid/ai-fill",
            json={"field_classes": ["seo"]},
        )
    assert resp.status_code == 403


def test_unknown_article_returns_404(client):
    p, _ = _patch_chat([])
    with p:
        resp = client.post(
            "/api/articles/doesnotexist/ai-fill",
            json={"field_classes": ["seo"]},
        )
    assert resp.status_code == 404


def test_empty_body_returns_400(client):
    article = _create_article(client, content_json=None)
    p, _ = _patch_chat([])
    with p:
        resp = client.post(
            f"/api/articles/{article['id']}/ai-fill",
            json={"field_classes": ["seo"]},
        )
    assert resp.status_code == 400
    assert "no content" in resp.json()["detail"].lower()


def test_unknown_field_class_returns_400(client):
    article = _create_article(client, content_json=_TIPTAP_NO_H2)
    p, _ = _patch_chat([])
    with p:
        resp = client.post(
            f"/api/articles/{article['id']}/ai-fill",
            json={"field_classes": ["totally_made_up"]},
        )
    assert resp.status_code == 400
    assert "totally_made_up" in resp.json()["detail"]


def test_empty_field_classes_list_returns_422(client):
    article = _create_article(client, content_json=_TIPTAP_NO_H2)
    resp = client.post(
        f"/api/articles/{article['id']}/ai-fill",
        json={"field_classes": []},
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Happy path: single field-class
# ---------------------------------------------------------------------------


def test_seo_class_updates_both_columns(client):
    article = _create_article(client, content_json=_TIPTAP_NO_H2)
    yaml_payload = (
        "seo_title: AI-generated SEO title\n"
        "seo_description: AI-generated SEO description for the article.\n"
    )
    p, chat = _patch_chat([_make_llm_result(yaml_payload)])
    with p:
        resp = client.post(
            f"/api/articles/{article['id']}/ai-fill",
            json={"field_classes": ["seo"]},
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "seo_title" in body["updated_fields"]
    assert "seo_description" in body["updated_fields"]
    assert chat.await_count == 1

    refreshed = client.get(f"/api/articles/{article['id']}").json()
    assert refreshed["seo_title"] == "AI-generated SEO title"
    assert refreshed["seo_description"].startswith("AI-generated SEO description")


def test_tags_class_writes_json_list(client):
    article = _create_article(client, content_json=_TIPTAP_NO_H2)
    yaml_payload = 'tags:\n  - "alpha"\n  - "beta"\n  - "gamma"\n'
    p, _ = _patch_chat([_make_llm_result(yaml_payload)])
    with p:
        resp = client.post(
            f"/api/articles/{article['id']}/ai-fill",
            json={"field_classes": ["tags"]},
        )
    assert resp.status_code == 200
    refreshed = client.get(f"/api/articles/{article['id']}").json()
    assert refreshed["tags"] == ["alpha", "beta", "gamma"]


def test_image_prompts_class_uses_heuristic_count(client):
    article = _create_article(client, content_json=_TIPTAP_WITH_H2S)
    yaml_payload = (
        "featured_image_prompt: photoreal newsroom, no text\n"
        "inline_image_prompts:\n"
        "  - section_hint: Section one\n"
        "    prompt: first section illustration\n"
        "  - section_hint: Section two\n"
        "    prompt: second section illustration\n"
        "  - section_hint: Section three\n"
        "    prompt: third section illustration\n"
    )
    p, _ = _patch_chat([_make_llm_result(yaml_payload)])
    with p:
        resp = client.post(
            f"/api/articles/{article['id']}/ai-fill",
            json={"field_classes": ["image_prompts"]},
        )
    body = resp.json()
    assert body["inline_image_count"] == 3  # heuristic = 3 H2 headings
    assert "featured_image_prompt" in body["updated_fields"]
    assert "inline_image_prompts" in body["updated_fields"]
    refreshed = client.get(f"/api/articles/{article['id']}").json()
    assert refreshed["featured_image_prompt"] == "photoreal newsroom, no text"
    assert len(refreshed["inline_image_prompts"]) == 3


def test_image_prompts_inline_count_override_wins(client):
    article = _create_article(client, content_json=_TIPTAP_WITH_H2S)
    yaml_payload = (
        "featured_image_prompt: x\n"
        "inline_image_prompts:\n"
        "  - section_hint: a\n    prompt: b\n"
    )
    p, _ = _patch_chat([_make_llm_result(yaml_payload)])
    with p:
        resp = client.post(
            f"/api/articles/{article['id']}/ai-fill",
            json={"field_classes": ["image_prompts"], "inline_image_count": 1},
        )
    body = resp.json()
    assert body["inline_image_count"] == 1


def test_heuristic_floors_at_one_when_no_h2(client):
    article = _create_article(client, content_json=_TIPTAP_NO_H2)
    yaml_payload = (
        "featured_image_prompt: x\n"
        "inline_image_prompts:\n"
        "  - section_hint: a\n    prompt: b\n"
    )
    p, _ = _patch_chat([_make_llm_result(yaml_payload)])
    with p:
        resp = client.post(
            f"/api/articles/{article['id']}/ai-fill",
            json={"field_classes": ["image_prompts"]},
        )
    assert resp.json()["inline_image_count"] == 1


# ---------------------------------------------------------------------------
# Multiple field-classes in one call
# ---------------------------------------------------------------------------


def test_multiple_field_classes_each_produce_one_llm_call(client):
    article = _create_article(client, content_json=_TIPTAP_NO_H2)
    p, chat = _patch_chat(
        [
            _make_llm_result("seo_title: A\nseo_description: B\n"),
            _make_llm_result('tags:\n  - "x"\n  - "y"\n'),
            _make_llm_result("topic: Java\n"),
        ]
    )
    with p:
        resp = client.post(
            f"/api/articles/{article['id']}/ai-fill",
            json={"field_classes": ["seo", "tags", "topic"]},
        )
    assert resp.status_code == 200
    assert chat.await_count == 3
    body = resp.json()
    assert set(body["field_class_results"].keys()) == {"seo", "tags", "topic"}
    assert "seo_title" in body["field_class_results"]["seo"]["updated"]
    assert "tags" in body["field_class_results"]["tags"]["updated"]
    assert "topic" in body["field_class_results"]["topic"]["updated"]


# ---------------------------------------------------------------------------
# Per-class error isolation
# ---------------------------------------------------------------------------


def test_one_class_llm_error_does_not_kill_others(client):
    article = _create_article(client, content_json=_TIPTAP_NO_H2)

    chat_mock = AsyncMock(
        side_effect=[
            LLMError("temporary outage"),
            _make_llm_result('tags:\n  - "alpha"\n'),
        ]
    )

    class _FakeClient:
        async def chat(self, *a, **kw):
            return await chat_mock(*a, **kw)

    with patch("app.ai.routes._get_client", return_value=_FakeClient()):
        resp = client.post(
            f"/api/articles/{article['id']}/ai-fill",
            json={"field_classes": ["seo", "tags"]},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert "seo" in body["field_class_errors"]
    assert "temporary outage" in body["field_class_errors"]["seo"]
    # Tags class still applied.
    assert "tags" in body["updated_fields"]


# ---------------------------------------------------------------------------
# Token + cost accounting
# ---------------------------------------------------------------------------


def test_ai_tokens_used_bumped_on_article(client):
    article = _create_article(client, content_json=_TIPTAP_NO_H2)
    yaml_payload = "topic: Build Tools\n"
    p, _ = _patch_chat(
        [_make_llm_result(yaml_payload, prompt_tokens=200, completion_tokens=20)]
    )
    with p:
        resp = client.post(
            f"/api/articles/{article['id']}/ai-fill",
            json={"field_classes": ["topic"]},
        )
    assert resp.status_code == 200
    refreshed = client.get(f"/api/articles/{article['id']}").json()
    assert refreshed["ai_tokens_used"] == 220


def test_tokens_charged_even_when_no_field_updated(client):
    """If the AI returned values but force=false skips them all
    (everything already populated), the tokens are still real
    spend and must bump ai_tokens_used."""
    article = _create_article(client, content_json=_TIPTAP_NO_H2)
    client.patch(
        f"/api/articles/{article['id']}",
        json={"seo_title": "Existing", "seo_description": "Existing description"},
    )
    p, _ = _patch_chat(
        [
            _make_llm_result(
                "seo_title: New\nseo_description: New desc\n",
                prompt_tokens=100,
                completion_tokens=10,
            )
        ]
    )
    with p:
        resp = client.post(
            f"/api/articles/{article['id']}/ai-fill",
            json={"field_classes": ["seo"], "force": False},
        )
    body = resp.json()
    assert body["updated_fields"] == []
    assert body["tokens_used"] == 110
    refreshed = client.get(f"/api/articles/{article['id']}").json()
    assert refreshed["ai_tokens_used"] == 110


def test_estimated_cost_is_none_for_unknown_model(client):
    article = _create_article(client, content_json=_TIPTAP_NO_H2)
    p, _ = _patch_chat(
        [
            _make_llm_result(
                "topic: x\n", model="some-weird-local-model"
            )
        ]
    )
    with p:
        resp = client.post(
            f"/api/articles/{article['id']}/ai-fill",
            json={"field_classes": ["topic"]},
        )
    body = resp.json()
    assert body["estimated_cost_usd"] is None
    assert body["field_class_results"]["topic"]["cost_usd"] is None


def test_estimated_cost_is_set_for_known_model(client):
    article = _create_article(client, content_json=_TIPTAP_NO_H2)
    p, _ = _patch_chat(
        [
            _make_llm_result(
                "topic: x\n",
                model="gpt-4o",
                prompt_tokens=1_000_000,
                completion_tokens=0,
            )
        ]
    )
    with p:
        resp = client.post(
            f"/api/articles/{article['id']}/ai-fill",
            json={"field_classes": ["topic"]},
        )
    body = resp.json()
    # gpt-4o input price = $2.50 per million tokens.
    assert body["estimated_cost_usd"] == pytest.approx(2.50)


# ---------------------------------------------------------------------------
# Force-override semantics
# ---------------------------------------------------------------------------


def test_force_false_skips_populated_columns(client):
    article = _create_article(client, content_json=_TIPTAP_NO_H2)
    client.patch(
        f"/api/articles/{article['id']}", json={"seo_title": "Existing"}
    )
    p, _ = _patch_chat(
        [_make_llm_result("seo_title: AI replacement\nseo_description: AI desc\n")]
    )
    with p:
        resp = client.post(
            f"/api/articles/{article['id']}/ai-fill",
            json={"field_classes": ["seo"]},
        )
    body = resp.json()
    assert body["skip_reasons"]["seo_title"] == "field-already-populated"
    refreshed = client.get(f"/api/articles/{article['id']}").json()
    assert refreshed["seo_title"] == "Existing"
    # seo_description was unset, so it got applied.
    assert refreshed["seo_description"] == "AI desc"


def test_force_true_overwrites(client):
    article = _create_article(client, content_json=_TIPTAP_NO_H2)
    client.patch(
        f"/api/articles/{article['id']}", json={"seo_title": "Existing"}
    )
    p, _ = _patch_chat(
        [_make_llm_result("seo_title: AI replacement\nseo_description: AI desc\n")]
    )
    with p:
        resp = client.post(
            f"/api/articles/{article['id']}/ai-fill",
            json={"field_classes": ["seo"], "force": True},
        )
    refreshed = client.get(f"/api/articles/{article['id']}").json()
    assert refreshed["seo_title"] == "AI replacement"


def test_ai_null_value_always_skipped(client):
    article = _create_article(client, content_json=_TIPTAP_NO_H2)
    p, _ = _patch_chat(
        [_make_llm_result("seo_title: null\nseo_description: null\n")]
    )
    with p:
        resp = client.post(
            f"/api/articles/{article['id']}/ai-fill",
            json={"field_classes": ["seo"], "force": True},
        )
    body = resp.json()
    assert body["skip_reasons"]["seo_title"] == "value-is-empty"
    assert body["skip_reasons"]["seo_description"] == "value-is-empty"


# ---------------------------------------------------------------------------
# YAML-fragment parsing tolerance
# ---------------------------------------------------------------------------


def test_markdown_fenced_yaml_response_parses(client):
    article = _create_article(client, content_json=_TIPTAP_NO_H2)
    fenced = "```yaml\ntopic: Fenced Topic\n```"
    p, _ = _patch_chat([_make_llm_result(fenced)])
    with p:
        resp = client.post(
            f"/api/articles/{article['id']}/ai-fill",
            json={"field_classes": ["topic"]},
        )
    refreshed = client.get(f"/api/articles/{article['id']}").json()
    assert refreshed["topic"] == "Fenced Topic"


def test_malformed_yaml_response_yields_no_updates(client):
    article = _create_article(client, content_json=_TIPTAP_NO_H2)
    p, _ = _patch_chat([_make_llm_result("not: : : valid yaml")])
    with p:
        resp = client.post(
            f"/api/articles/{article['id']}/ai-fill",
            json={"field_classes": ["topic"]},
        )
    body = resp.json()
    assert body["updated_fields"] == []
    # Tokens were still consumed, so they still get charged.
    assert body["tokens_used"] > 0
