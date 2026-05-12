"""Prompts for the Book AI-template fill workflow.

UNIVERSAL-AI-TEMPLATE-01 Session 1, commit 3/10. One builder
per Book field-class. Same ``(system_prompt, user_prompt)``
shape as ``article_template_prompts.py``; see that module's
docstring for the rationale.

Book field-classes per S5:

- ``marketing_copy``: backpage_description + backpage_author_bio
  + html_description
- ``tags``: keywords (book's tags column is named keywords)
- ``description_genre``: description + genre
- ``cover_prompt``: cover_image_prompt
- ``chapter_summaries``: one summary per chapter, matched by
  chapter_id

Books and Articles share only ``tags`` and an image-prompt
field-class structurally; the rest diverge because Book's
fillable surface (marketing copy, chapter summaries) has no
Article equivalent.
"""

from __future__ import annotations

from typing import Any

_BODY_EXCERPT_LIMIT = 1500
_CHAPTER_EXCERPT_LIMIT = 600


def _format_book_header(book: Any) -> str:
    """Stable metadata header for the Book prompts. Skips
    empty optional fields so the prompt stays compact."""
    lines = [f"Book title: {book.title}"]
    if getattr(book, "subtitle", None):
        lines.append(f"Subtitle: {book.subtitle}")
    if getattr(book, "author", None):
        lines.append(f"Author: {book.author}")
    if getattr(book, "genre", None):
        lines.append(f"Genre: {book.genre}")
    if getattr(book, "series", None):
        lines.append(f"Series: {book.series}")
    lines.append(f"Language: {book.language}")
    return "\n".join(lines)


def _excerpt(body: str) -> str:
    return body[:_BODY_EXCERPT_LIMIT]


def _system_prompt(book: Any) -> str:
    """Shared system prompt. Same invariants as the article
    side; the book-specific note about chapter_summaries is
    layered in the per-builder user prompt."""
    return f"""You are filling metadata fields for a book in a Bibliogon \
AI template. Follow these rules:

1. Respond with a YAML fragment ONLY. No prose, no markdown
   fences, no commentary outside the YAML.
2. Respond in the book's language: {book.language}. All
   generated marketing copy must be in that language. The
   cover_image_prompt can stay in English (image generators
   are most reliable with English prompts).
3. Use real UTF-8 characters (umlauts, accents, CJK
   characters). Do NOT escape them and do NOT substitute
   ASCII transliterations.
4. If you cannot generate a field with high confidence,
   return it as null. Do not invent.
5. Output ONLY the fields requested in the user message; do
   not echo unrelated fields."""


# ---------------------------------------------------------------------------
# Field-class builders
# ---------------------------------------------------------------------------


def build_marketing_copy_prompt(book: Any, body: str) -> tuple[str, str]:
    """Field-class ``marketing_copy``: fills
    ``backpage_description``, ``backpage_author_bio``,
    ``html_description``."""
    user = f"""{_format_book_header(book)}

Book content (excerpt across chapters):
{_excerpt(body)}

Generate marketing copy for this book. Output exactly this \
YAML shape:

backpage_description: |
  <100-200 words, back-cover blurb. Hook -> conflict -> stakes.
  No spoilers.>
backpage_author_bio: |
  <50-100 words, third person. Credentials + personal note.
  Leave null if the author is unknown.>
html_description: |
  <200-300 word Amazon-style HTML description. Allowed tags:
  b, i, br, p, h2, ul, li. Hook in the first paragraph;
  benefits as a list; soft call-to-action at the end.>
"""
    return _system_prompt(book), user


def build_tags_prompt(book: Any, body: str) -> tuple[str, str]:
    """Field-class ``tags``: fills the book's ``keywords``
    column (5-10 single-word or hyphenated lowercase strings)."""
    user = f"""{_format_book_header(book)}

Book content (excerpt):
{_excerpt(body)}

Generate 5-10 keywords for this book. Each keyword is \
single-word or hyphenated, lowercase, in the book's language. \
Optimised for both SEO and Amazon marketplace search. Output \
exactly this YAML shape:

keywords:
  - "keyword-1"
  - "keyword-2"
"""
    return _system_prompt(book), user


def build_description_genre_prompt(book: Any, body: str) -> tuple[str, str]:
    """Field-class ``description_genre``: fills ``description``
    and ``genre``."""
    user = f"""{_format_book_header(book)}

Book content (excerpt):
{_excerpt(body)}

Generate a short plain-text book description and identify the \
primary genre. Output exactly this YAML shape:

description: |
  <1-2 paragraph plain-text description. Used internally;
  separate from the Amazon HTML description.>
genre: "..."   # single word or short phrase, e.g. "Non-Fiction / Reference"
"""
    return _system_prompt(book), user


def build_cover_prompt(book: Any, body: str) -> tuple[str, str]:
    """Field-class ``cover_prompt``: fills ``cover_image_prompt``."""
    user = f"""{_format_book_header(book)}

Book content (excerpt):
{_excerpt(body)}

Generate a Stable-Diffusion-style prompt for the book cover. \
The prompt can stay in English even if the book language \
differs - image generators are most reliable with English \
prompts. Include:

- style (photorealistic, illustration, hand-drawn, ...)
- mood and color palette
- dominant subject and composition
- portrait orientation (book covers are usually 6x9 inches)
- "no text in image" since title and author overlay separately

Output exactly this YAML shape:

cover_image_prompt: |
  <prompt body>
"""
    return _system_prompt(book), user


def build_chapter_summaries_prompt(book: Any, chapters: list[dict[str, str]]) -> tuple[str, str]:
    """Field-class ``chapter_summaries``: one summary per
    chapter, matched by chapter_id.

    ``chapters`` is a list of ``{chapter_id, title, excerpt}``
    dicts. The endpoint (commit 7) prepares this list from the
    book's Chapter rows; the prompt expects the AI to return
    one entry per chapter, keyed by chapter_id."""
    chapter_blocks: list[str] = []
    for ch in chapters:
        excerpt = (ch.get("excerpt") or "")[:_CHAPTER_EXCERPT_LIMIT]
        chapter_blocks.append(
            f"chapter_id: {ch['chapter_id']}\ntitle: {ch['title']}\nexcerpt: {excerpt}"
        )
    chapters_text = "\n\n---\n\n".join(chapter_blocks)

    user = f"""{_format_book_header(book)}

Chapters (one block per chapter):
{chapters_text}

Generate a one-sentence summary for EACH chapter listed \
above. Match each summary to its chapter by chapter_id - do \
NOT invent new chapter_ids and do NOT skip chapters. Output \
exactly this YAML shape (one entry per chapter, same order \
as above):

chapter_summaries:
  - chapter_id: "<id from above>"
    title: "<title from above>"
    summary: "<one-sentence summary>"
"""
    return _system_prompt(book), user


__all__ = [
    "build_marketing_copy_prompt",
    "build_tags_prompt",
    "build_description_genre_prompt",
    "build_cover_prompt",
    "build_chapter_summaries_prompt",
]
