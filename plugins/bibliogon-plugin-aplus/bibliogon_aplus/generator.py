"""AI-orchestrated A+ Content generation (#825).

Prompt -> AI call -> YAML-fragment parse -> deterministic validation
-> up to ``rules.max_regeneration_retries`` regenerations when hard
errors survive. Total attempts = 1 initial generation +
``rules.max_regeneration_retries`` retries (see
``_INITIAL_GENERATION_ATTEMPT``, #829). After the last attempt the
package is returned WITH its remaining errors rather than silently
swallowed - the caller (route) decides what to do with a package
that still has errors.

Needs ``app.ai`` (core), so - like ``book_context.py`` - this module
is not exercised by the plugin's own isolated test venv; its tests
live in backend/tests/ where the AI client can be mocked with the
real import chain in place.
"""

from __future__ import annotations

import hashlib
from datetime import UTC, date, datetime
from typing import Any, Protocol

import yaml

from bibliogon_aplus.book_context import BookContext
from bibliogon_aplus.image_prompts import AplusImageStyleContext, build_style_context
from bibliogon_aplus.prompts import build_system_prompt, build_user_prompt
from bibliogon_aplus.rules import Ruleset
from bibliogon_aplus.schema import (
    AplusMeta,
    AplusPackage,
    Bullet,
    ModuleHeader,
    ThreeImageEntry,
    ValidationFinding,
)
from bibliogon_aplus.validation import validate_package

#: The generation loop always runs one initial attempt, then retries
#: up to ``rules.max_regeneration_retries`` more times on hard
#: errors - so the total call count is this constant PLUS the
#: configured retry budget, never the retry budget alone (#829).
_INITIAL_GENERATION_ATTEMPT = 1


class ChatClient(Protocol):
    """Structural type for the object generator.py needs from
    ``app.ai.llm_client.LLMClient`` - kept narrow so tests can pass a
    trivial fake without importing the real client."""

    async def chat(
        self, messages: list[dict[str, str]], temperature: float | None = None
    ) -> dict[str, Any]: ...


def compute_source_hash(context: BookContext, ruleset_version: str) -> str:
    """Fingerprint of everything that feeds the prompt, plus the
    ruleset version. A change to either invalidates the cache -
    same shape as the audiobook content-hash sidecar pattern."""
    parts = [
        context.title,
        context.subtitle or "",
        context.author or "",
        context.language,
        context.description_text,
        context.genre_key or "",
        ",".join(context.bisac_codes),
        ",".join(context.categories),
        ",".join(context.keywords),
        ruleset_version,
    ]
    digest = hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()
    return digest


def _parse_ai_yaml_fragment(text: str) -> dict[str, Any]:
    """Parse a (possibly fenced) YAML fragment from an AI response.

    Same shape as ``app.routers.book_ai_fill._parse_ai_yaml_fragment`` -
    every existing AI-fill/template consumer asks the model to reply
    in YAML rather than relying on provider-specific JSON mode.
    """
    if not text:
        return {}
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()
    try:
        parsed = yaml.safe_load(cleaned)
    except yaml.YAMLError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _text(raw: Any) -> str:
    """One of the model's string fields, as a clean string.

    Implements :func:`app.yaml.projection.as_text` with ``absent=""``, because
    this model declares ``str`` where ``ProjectMetadata`` declares
    ``str | None``: a bare ``alt_text`` has to reach the validator as empty,
    which is the error the ruleset already wanted to report.

    IMPLEMENTS rather than CALLS, deliberately. This plugin's standalone test
    matrix installs only the plugin's own lockfile - no backend - and
    ``generator`` is one of the modules those tests import, so an
    ``app.yaml.projection`` import here would turn that matrix red (the "two
    installation paths diverge" lesson). The backend owns the contract and
    ``backend/tests/test_yaml_projection.py`` asserts this function agrees
    with it across every input kind, so drift cannot merge.

    The rule started here for ``image_prompt`` alone (#1086 - a bare YAML key
    rendered as the literal word "None") and the import parser grew its own
    copy of the same rule for the same reason; #1108 made that agreement a
    gate instead of a coincidence.
    """
    if raw is None:
        return ""
    # datetime subclasses date, so one check covers both and each renders
    # with its own isoformat.
    if isinstance(raw, date):
        return raw.isoformat()
    if isinstance(raw, (list, tuple, set, frozenset, dict)):
        return ""
    return str(raw).strip()


def _build_draft_package(
    parsed: dict[str, Any], meta: AplusMeta, styles: AplusImageStyleContext
) -> AplusPackage:
    """Tolerant construction: any missing key becomes an empty
    string/list rather than raising, so a partially-broken AI
    response still produces a draft the validator can report on.
    A key present with no value is the same as absent - see
    :func:`_text`.

    The model supplies only the keyword prompt per image
    (``image_prompt`` in its YAML); aspect ratio, size and style flags
    come from ``styles`` - the ruleset resolved for the book's genre -
    so the same prompt gets the Kinderbuch illustration style on a
    children's book and the default style elsewhere (#865)."""
    bullets_raw = parsed.get("bullets")
    bullets = (
        [
            Bullet(heading=_text(entry.get("heading")), body=_text(entry.get("body")))
            for entry in bullets_raw
            if isinstance(entry, dict)
        ]
        if isinstance(bullets_raw, list)
        else []
    )

    header_raw = parsed.get("module_header") or {}
    header = ModuleHeader(
        title=_text(header_raw.get("title")),
        text=_text(header_raw.get("text")),
        image=styles.header.image(_text(header_raw.get("image_prompt"))),
        alt_text=_text(header_raw.get("alt_text")),
    )

    images_raw = parsed.get("module_three_images")
    three_images = (
        [
            ThreeImageEntry(
                title=_text(entry.get("title")),
                text=_text(entry.get("text")),
                image=styles.three_images.image(_text(entry.get("image_prompt"))),
                alt_text=_text(entry.get("alt_text")),
            )
            for entry in images_raw
            if isinstance(entry, dict)
        ]
        if isinstance(images_raw, list)
        else []
    )

    return AplusPackage(
        short_description=_text(parsed.get("short_description")),
        bullets=bullets,
        module_header=header,
        module_three_images=three_images,
        meta=meta,
    )


async def generate_package(
    context: BookContext,
    *,
    language: str,
    rules: Ruleset,
    client: ChatClient,
) -> AplusPackage:
    """Run the generate -> validate -> regenerate loop.

    Args:
        context: The book's normalised metadata.
        language: Target language for the generated copy.
        rules: The parsed ruleset.
        client: An object with an async ``chat(messages)`` method -
            in production, ``app.ai.llm_factory._get_client()``.

    Returns:
        The best package produced, with its validation findings
        attached - even after the retry budget is exhausted with
        hard errors still present. Never raises on a bad AI
        response; only network/auth/timeout failures from the
        client itself propagate (as ``app.ai.llm_client.LLMError``,
        which the route maps to ``ExternalServiceError``).
    """
    genre_key = context.genre_key
    styles = build_style_context(genre_key=genre_key, rules=rules)
    prior_findings: list[ValidationFinding] | None = None
    draft = AplusPackage(
        meta=AplusMeta(
            book_id=context.book_id,
            language=language,
            ruleset_version=rules.version,
            generated_at=datetime.now(UTC).isoformat(),
        )
    )
    model_used = ""

    max_attempts = _INITIAL_GENERATION_ATTEMPT + rules.max_regeneration_retries
    for _attempt in range(max_attempts):
        system_prompt = build_system_prompt(language)
        user_prompt = build_user_prompt(context, rules=rules, prior_findings=prior_findings)
        result = await client.chat(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.6,
        )
        model_used = result.get("model", "") or model_used
        parsed = _parse_ai_yaml_fragment(result.get("content", ""))
        meta = AplusMeta(
            book_id=context.book_id,
            language=language,
            model=model_used,
            ruleset_version=rules.version,
            generated_at=datetime.now(UTC).isoformat(),
        )
        draft = _build_draft_package(parsed, meta, styles)
        findings = validate_package(draft, language=language, genre_key=genre_key, rules=rules)
        draft.validation.extend(findings)

        if not draft.has_errors:
            return draft
        prior_findings = [f for f in findings if f.severity == "error"]

    return draft
