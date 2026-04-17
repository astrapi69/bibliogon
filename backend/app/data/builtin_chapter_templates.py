"""Builtin chapter templates shipped with Bibliogon (TM-04).

Parallel to ``builtin_templates.py`` but for individual reusable
chapters. ``seed_builtin_chapter_templates`` is called once at
startup and is idempotent: if any ``is_builtin=True`` rows exist
it is a no-op. User-created templates are never touched.

Content strings are TipTap JSON documents. English-only in the
DB; the frontend displays them verbatim, matching the book-
template pattern.
"""
from __future__ import annotations

import json
import logging
from typing import TypedDict

from sqlalchemy.orm import Session

from app.models import ChapterTemplate

logger = logging.getLogger(__name__)


class _ChapterTemplateSpec(TypedDict):
    name: str
    description: str
    chapter_type: str
    content: str


def _doc(nodes: list[dict]) -> str:
    return json.dumps({"type": "doc", "content": nodes})


def _heading(level: int, text: str) -> dict:
    return {
        "type": "heading",
        "attrs": {"level": level},
        "content": [{"type": "text", "text": text}],
    }


def _paragraph(text: str) -> dict:
    return {
        "type": "paragraph",
        "content": [{"type": "text", "text": text}],
    }


def _empty_paragraph() -> dict:
    return {"type": "paragraph"}


def _ordered_list(items: list[str]) -> dict:
    return {
        "type": "orderedList",
        "attrs": {"start": 1},
        "content": [
            {
                "type": "listItem",
                "content": [{"type": "paragraph", "content": [{"type": "text", "text": item}]}],
            }
            for item in items
        ],
    }


def _bullet_list(items: list[str]) -> dict:
    return {
        "type": "bulletList",
        "content": [
            {
                "type": "listItem",
                "content": [{"type": "paragraph", "content": [{"type": "text", "text": item}]}],
            }
            for item in items
        ],
    }


# --- Template definitions ---


_INTERVIEW: _ChapterTemplateSpec = {
    "name": "Interview",
    "description": "Structured interview with intro, questions, and closing",
    "chapter_type": "chapter",
    "content": _doc([
        _heading(2, "Introduction"),
        _paragraph("Brief introduction of the interviewee and the context of the conversation."),
        _heading(2, "Questions"),
        _ordered_list([
            "First question...",
            "Second question...",
            "Third question...",
        ]),
        _heading(2, "Closing"),
        _paragraph("Closing thoughts and thanks."),
    ]),
}


_FAQ: _ChapterTemplateSpec = {
    "name": "FAQ",
    "description": "Frequently asked questions in Q&A format",
    "chapter_type": "chapter",
    "content": _doc([
        _heading(3, "Question 1?"),
        _paragraph("Answer to the first question."),
        _heading(3, "Question 2?"),
        _paragraph("Answer to the second question."),
        _heading(3, "Question 3?"),
        _paragraph("Answer to the third question."),
    ]),
}


_RECIPE: _ChapterTemplateSpec = {
    "name": "Recipe",
    "description": "Recipe with ingredients, preparation, and notes",
    "chapter_type": "chapter",
    "content": _doc([
        _heading(2, "Ingredients"),
        _bullet_list([
            "Ingredient 1",
            "Ingredient 2",
            "Ingredient 3",
        ]),
        _heading(2, "Preparation"),
        _ordered_list([
            "First step...",
            "Second step...",
            "Third step...",
        ]),
        _heading(2, "Notes"),
        _paragraph("Tips, variations, or serving suggestions."),
    ]),
}


_PHOTO_REPORT: _ChapterTemplateSpec = {
    "name": "Photo Report",
    "description": "Visual reportage with image placeholders and captions",
    "chapter_type": "chapter",
    "content": _doc([
        _heading(2, "Location"),
        _paragraph("Where and when this scene was captured."),
        _heading(2, "Impressions"),
        _empty_paragraph(),
        _paragraph("Describe the atmosphere, the people, the light."),
        _heading(2, "Reflection"),
        _paragraph("What you take away from this visit."),
    ]),
}


BUILTIN_CHAPTER_TEMPLATES: list[_ChapterTemplateSpec] = [
    _INTERVIEW,
    _FAQ,
    _RECIPE,
    _PHOTO_REPORT,
]


def seed_builtin_chapter_templates(db: Session) -> int:
    """Insert builtin chapter templates if none exist yet.

    Returns the number inserted. Idempotent.
    """
    existing = (
        db.query(ChapterTemplate)
        .filter(ChapterTemplate.is_builtin.is_(True))
        .count()
    )
    if existing > 0:
        return 0

    for spec in BUILTIN_CHAPTER_TEMPLATES:
        db.add(
            ChapterTemplate(
                name=spec["name"],
                description=spec["description"],
                chapter_type=spec["chapter_type"],
                content=spec["content"],
                language="en",
                is_builtin=True,
            )
        )

    db.commit()
    logger.info(
        "Seeded %d builtin chapter templates", len(BUILTIN_CHAPTER_TEMPLATES)
    )
    return len(BUILTIN_CHAPTER_TEMPLATES)
