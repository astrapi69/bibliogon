"""End-to-end tests for the Article AI-template endpoints.

UNIVERSAL-AI-TEMPLATE-01 Session 1, commit 4/10. Pins three
endpoints:

- GET  /api/articles/{id}/ai-template  (per-article export)
- POST /api/articles/{id}/ai-template  (per-article import)
- GET  /api/ai-templates/article       (empty / new-idea)

Invariants pinned by these tests:

- Export YAML contains the rules-for-AI header, the reference
  block with id + language + body_word_count + body_preview,
  and one entry per fillable field with description / example
  / current_value.
- Empty-template YAML carries no reference block and puts the
  language at root.
- Content-Disposition filename derives from the article slug
  with umlauts folded to ASCII.
- Import with ``force=false`` skips fields whose current value
  is non-empty; ``force=true`` overwrites them.
- AI-returned null / empty / whitespace-only always skips,
  regardless of force.
- Unknown schema_version, wrong type discriminator, malformed
  YAML, and empty body each return 400.
- Posting to a nonexistent article returns 404.
"""

from __future__ import annotations

import json
import textwrap

import pytest
import yaml
from fastapi.testclient import TestClient

from app.ai.template_schema import SCHEMA_VERSION
from app.main import app


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


def _create_article(
    client: TestClient,
    *,
    title: str = "Migrate a Maven project to Gradle",
    language: str = "en",
    content_json: str | None = None,
) -> dict:
    payload = {"title": title, "language": language}
    resp = client.post("/api/articles", json=payload)
    assert resp.status_code == 201, resp.text
    article = resp.json()
    if content_json:
        client.patch(
            f"/api/articles/{article['id']}",
            json={"content_json": content_json},
        )
        article = client.get(f"/api/articles/{article['id']}").json()
    return article


_TIPTAP_DOC = json.dumps(
    {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": "Hello world."}],
            },
            {
                "type": "paragraph",
                "content": [
                    {"type": "text", "text": "Maven is a Java build tool."}
                ],
            },
        ],
    }
)


# ---------------------------------------------------------------------------
# GET per-article export
# ---------------------------------------------------------------------------


def test_export_returns_yaml_with_header_and_reference(client):
    article = _create_article(client, content_json=_TIPTAP_DOC)

    resp = client.get(f"/api/articles/{article['id']}/ai-template")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/yaml")

    text = resp.text
    assert text.startswith("#")  # header block leads
    assert "Bibliogon Article Template" in text
    assert "RULES FOR AI ASSISTANTS" in text

    # Strip the header for clean YAML parsing.
    body = "\n".join(line for line in text.splitlines() if not line.startswith("#"))
    parsed = yaml.safe_load(body)
    assert parsed["type"] == "article"
    assert parsed["schema_version"] == SCHEMA_VERSION
    assert parsed["reference"]["id"] == article["id"]
    assert parsed["reference"]["language"] == "en"
    assert parsed["reference"]["body_word_count"] > 0
    assert "Hello world" in parsed["reference"]["body_preview"]
    assert parsed["title"]["current_value"] == "Migrate a Maven project to Gradle"


def test_export_content_disposition_carries_ascii_slug(client):
    article = _create_article(client, title="Schöne Tipps für Gradle")
    resp = client.get(f"/api/articles/{article['id']}/ai-template")
    cd = resp.headers["content-disposition"]
    assert "biblio.yaml" in cd
    # Umlauts folded to ASCII.
    assert "schone-tipps-fur-gradle" in cd.lower()


def test_export_returns_404_for_unknown_article(client):
    resp = client.get("/api/articles/doesnotexist/ai-template")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET empty new-idea template
# ---------------------------------------------------------------------------


def test_empty_template_has_no_reference_and_root_language(client):
    resp = client.get("/api/ai-templates/article?language=de")
    assert resp.status_code == 200
    text = resp.text
    body = "\n".join(line for line in text.splitlines() if not line.startswith("#"))
    parsed = yaml.safe_load(body)
    assert parsed["type"] == "article"
    assert "reference" not in parsed
    assert parsed["language"] == "de"
    # Every fillable field has the three-keys-per-field shape.
    for field in ("title", "seo_title", "tags", "inline_image_prompts"):
        assert "description" in parsed[field]
        assert "example" in parsed[field]
        assert "current_value" in parsed[field]


def test_empty_template_default_language_is_english(client):
    resp = client.get("/api/ai-templates/article")
    body = "\n".join(line for line in resp.text.splitlines() if not line.startswith("#"))
    parsed = yaml.safe_load(body)
    assert parsed["language"] == "en"


def test_empty_template_filename_uses_language_code(client):
    resp = client.get("/api/ai-templates/article?language=pt-br")
    cd = resp.headers["content-disposition"]
    assert "new-article-pt-br" in cd.lower()


# ---------------------------------------------------------------------------
# POST per-article import — happy path + force semantics
# ---------------------------------------------------------------------------


def _filled_template_for(
    article: dict,
    *,
    seo_title: str | None = "Maven to Gradle Migration",
    seo_description: str | None = "150-char practical migration guide.",
    excerpt: str | None = None,
    tags: list[str] | None = None,
    topic: str | None = None,
    featured_image_prompt: str | None = None,
    inline_image_prompts: list[dict] | None = None,
    title_override: str | None = None,
) -> str:
    """Build a minimal Article template YAML string for tests.
    Tags and inline_image_prompts default to empty lists so the
    AI-returned-empty branch is exercised by default."""
    body = {
        "type": "article",
        "schema_version": SCHEMA_VERSION,
        "reference": {
            "id": article["id"],
            "language": article["language"],
            "body_word_count": 10,
            "body_preview": "Stub preview.",
        },
        "title": {
            "description": "Title",
            "example": "X",
            "current_value": title_override or article["title"],
        },
        "seo_title": {
            "description": "SEO title",
            "example": "X",
            "current_value": seo_title,
        },
        "seo_description": {
            "description": "SEO description",
            "example": "X",
            "current_value": seo_description,
        },
        "excerpt": {
            "description": "Excerpt",
            "example": "X",
            "current_value": excerpt,
        },
        "tags": {
            "description": "Tags",
            "example": ["a"],
            "current_value": tags if tags is not None else [],
        },
        "topic": {
            "description": "Topic",
            "example": "X",
            "current_value": topic,
        },
        "featured_image_prompt": {
            "description": "Featured prompt",
            "example": "X",
            "current_value": featured_image_prompt,
        },
        "inline_image_prompts": {
            "description": "Inline prompts",
            "example": [{"section_hint": "x", "prompt": "y"}],
            "current_value": (
                inline_image_prompts if inline_image_prompts is not None else []
            ),
        },
    }
    return yaml.safe_dump(body, sort_keys=False, allow_unicode=True)


def test_import_applies_fields_to_empty_article(client):
    article = _create_article(client, content_json=_TIPTAP_DOC)
    yaml_text = _filled_template_for(
        article,
        seo_title="Maven to Gradle Migration",
        seo_description="Practical guide.",
        tags=["java", "build-tools"],
        topic="Build Tools",
        featured_image_prompt="Photoreal newsroom, no text",
        inline_image_prompts=[{"section_hint": "intro", "prompt": "city skyline"}],
    )
    resp = client.post(
        f"/api/articles/{article['id']}/ai-template",
        data=yaml_text,
        headers={"Content-Type": "text/yaml"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "seo_title" in body["updated_fields"]
    assert "seo_description" in body["updated_fields"]
    assert "tags" in body["updated_fields"]
    assert "topic" in body["updated_fields"]
    assert "featured_image_prompt" in body["updated_fields"]
    assert "inline_image_prompts" in body["updated_fields"]
    # Title was already populated -> skipped by default.
    assert "title" in body["skipped_fields"]
    assert body["skip_reasons"]["title"] == "field-already-populated"

    refreshed = client.get(f"/api/articles/{article['id']}").json()
    assert refreshed["seo_title"] == "Maven to Gradle Migration"
    assert refreshed["seo_description"] == "Practical guide."
    assert refreshed["tags"] == ["java", "build-tools"]
    assert refreshed["topic"] == "Build Tools"
    assert refreshed["featured_image_prompt"] == "Photoreal newsroom, no text"
    assert refreshed["inline_image_prompts"] == [
        {"section_hint": "intro", "prompt": "city skyline"}
    ]


def test_import_force_false_skips_populated_fields(client):
    article = _create_article(client)
    # Pre-populate seo_title via PATCH so it's a "field already
    # populated" case for the import.
    client.patch(
        f"/api/articles/{article['id']}",
        json={"seo_title": "Existing SEO Title"},
    )
    yaml_text = _filled_template_for(article, seo_title="New SEO Title")
    resp = client.post(
        f"/api/articles/{article['id']}/ai-template",
        data=yaml_text,
        headers={"Content-Type": "text/yaml"},
    )
    body = resp.json()
    assert "seo_title" in body["skipped_fields"]
    assert body["skip_reasons"]["seo_title"] == "field-already-populated"

    refreshed = client.get(f"/api/articles/{article['id']}").json()
    assert refreshed["seo_title"] == "Existing SEO Title"


def test_import_force_true_overwrites_populated_fields(client):
    article = _create_article(client)
    client.patch(
        f"/api/articles/{article['id']}",
        json={"seo_title": "Existing"},
    )
    yaml_text = _filled_template_for(article, seo_title="Forced Replacement")
    resp = client.post(
        f"/api/articles/{article['id']}/ai-template?force=true",
        data=yaml_text,
        headers={"Content-Type": "text/yaml"},
    )
    body = resp.json()
    assert "seo_title" in body["updated_fields"]
    assert body["force"] is True

    refreshed = client.get(f"/api/articles/{article['id']}").json()
    assert refreshed["seo_title"] == "Forced Replacement"


def test_import_ai_null_value_always_skipped_regardless_of_force(client):
    article = _create_article(client)
    yaml_text = _filled_template_for(article, seo_title=None, seo_description=None)
    resp = client.post(
        f"/api/articles/{article['id']}/ai-template?force=true",
        data=yaml_text,
        headers={"Content-Type": "text/yaml"},
    )
    body = resp.json()
    assert "seo_title" in body["skipped_fields"]
    assert body["skip_reasons"]["seo_title"] == "value-is-empty"
    assert body["skip_reasons"]["seo_description"] == "value-is-empty"


def test_import_ai_whitespace_only_value_is_empty(client):
    article = _create_article(client)
    yaml_text = _filled_template_for(article, seo_title="   ")
    resp = client.post(
        f"/api/articles/{article['id']}/ai-template?force=true",
        data=yaml_text,
        headers={"Content-Type": "text/yaml"},
    )
    body = resp.json()
    assert body["skip_reasons"]["seo_title"] == "value-is-empty"


def test_import_empty_list_value_is_empty(client):
    article = _create_article(client)
    yaml_text = _filled_template_for(article, tags=[])
    resp = client.post(
        f"/api/articles/{article['id']}/ai-template?force=true",
        data=yaml_text,
        headers={"Content-Type": "text/yaml"},
    )
    body = resp.json()
    assert body["skip_reasons"]["tags"] == "value-is-empty"


# ---------------------------------------------------------------------------
# POST per-article import — validation failures
# ---------------------------------------------------------------------------


def test_import_rejects_unknown_schema_version(client):
    article = _create_article(client)
    body = textwrap.dedent(
        """\
        type: article
        schema_version: 99
        """
    )
    resp = client.post(
        f"/api/articles/{article['id']}/ai-template",
        data=body,
        headers={"Content-Type": "text/yaml"},
    )
    assert resp.status_code == 400
    assert "schema_version" in resp.json()["detail"]


def test_import_rejects_book_template_on_article_endpoint(client):
    article = _create_article(client)
    yaml_text = _filled_template_for(article)
    # Convert article -> book in the body.
    body = yaml.safe_load(yaml_text)
    body["type"] = "book"
    # Strip the article-only image_prompts fields and add the
    # book-required ones so the body matches the BookTemplate
    # schema; otherwise we'd fail on missing fields instead of
    # the type-mismatch path.
    for f in ("seo_title", "seo_description", "excerpt", "topic"):
        body.pop(f, None)
    body["subtitle"] = {"description": "x", "example": "x", "current_value": None}
    body["description"] = {"description": "x", "example": "x", "current_value": None}
    body["genre"] = {"description": "x", "example": "x", "current_value": None}
    body["keywords"] = {"description": "x", "example": [], "current_value": []}
    body["html_description"] = {"description": "x", "example": "x", "current_value": None}
    body["backpage_description"] = {"description": "x", "example": "x", "current_value": None}
    body["backpage_author_bio"] = {"description": "x", "example": "x", "current_value": None}
    body["cover_image_prompt"] = {"description": "x", "example": "x", "current_value": None}
    body["chapter_summaries"] = {"description": "x", "example": [], "current_value": []}
    body.pop("featured_image_prompt", None)
    body.pop("inline_image_prompts", None)
    yaml_text = yaml.safe_dump(body, sort_keys=False)

    resp = client.post(
        f"/api/articles/{article['id']}/ai-template",
        data=yaml_text,
        headers={"Content-Type": "text/yaml"},
    )
    assert resp.status_code == 400
    assert "article" in resp.json()["detail"].lower()


def test_import_rejects_malformed_yaml(client):
    article = _create_article(client)
    resp = client.post(
        f"/api/articles/{article['id']}/ai-template",
        data="type: article\n  bad-indent: : :",
        headers={"Content-Type": "text/yaml"},
    )
    assert resp.status_code == 400


def test_import_rejects_empty_body(client):
    article = _create_article(client)
    resp = client.post(
        f"/api/articles/{article['id']}/ai-template",
        data="",
        headers={"Content-Type": "text/yaml"},
    )
    assert resp.status_code == 400
    assert "empty" in resp.json()["detail"].lower()


def test_import_returns_404_for_unknown_article(client):
    yaml_text = textwrap.dedent(
        f"""\
        type: article
        schema_version: {SCHEMA_VERSION}
        """
    )
    resp = client.post(
        "/api/articles/doesnotexist/ai-template",
        data=yaml_text,
        headers={"Content-Type": "text/yaml"},
    )
    assert resp.status_code == 404


def test_import_response_carries_force_flag(client):
    article = _create_article(client)
    yaml_text = _filled_template_for(article)
    resp = client.post(
        f"/api/articles/{article['id']}/ai-template?force=true",
        data=yaml_text,
        headers={"Content-Type": "text/yaml"},
    )
    assert resp.json()["force"] is True

    resp2 = client.post(
        f"/api/articles/{article['id']}/ai-template",
        data=yaml_text,
        headers={"Content-Type": "text/yaml"},
    )
    assert resp2.json()["force"] is False


# ---------------------------------------------------------------------------
# Round-trip: export -> import is idempotent
# ---------------------------------------------------------------------------


def test_export_then_import_is_a_no_op_with_default_force(client):
    """An article exported and then re-imported with force=false
    should land 0 updates - every current_value already matches
    the live record."""
    article = _create_article(
        client, content_json=_TIPTAP_DOC, title="Roundtrip Test"
    )
    client.patch(
        f"/api/articles/{article['id']}",
        json={"seo_title": "Already Set"},
    )

    export = client.get(f"/api/articles/{article['id']}/ai-template")
    yaml_text = export.text

    import_resp = client.post(
        f"/api/articles/{article['id']}/ai-template",
        data=yaml_text,
        headers={"Content-Type": "text/yaml"},
    )
    body = import_resp.json()
    # Every populated field is skipped because it's already there.
    # Empty fields (seo_description, excerpt, ...) are skipped
    # because the export's current_value is null.
    assert body["updated_fields"] == []
