"""Shared ASCII-safe filename-slug helper.

A single slug used for download filenames and ``Content-Disposition``
headers, which must be ASCII per RFC 6266. Folds Unicode to its ASCII
equivalent (NFKD), drops non-word characters, and collapses
whitespace / underscores / hyphens to single hyphens.

This is deliberately ONLY the filename variant. It does not replace, and
must not be conflated with, the slugs that carry different semantics:

- ``toc_validation._slugify`` - GitHub-anchor matching (must mirror
  rendered anchors).
- ``git_sync_markdown_utils._slugify`` - chapter-identity matching in the
  three-way git-sync diff (changing it would re-key existing chapters).
- ``authors._slugify`` - author URL slug with collision-suffixing.
- ``git_book_serializer._slugify`` - German ``ae/oe/ue/ss`` transliteration
  + timestamp fallback for the write-book-template stem.
- ``review_store.slugify`` - length-capped filesystem report name.

Consolidates the two byte-identical NFKD filename slugs that previously
lived in ``routers/article_export.py`` and ``routers/book_ai_template.py``
(the latter's docstring already noted it "mirrors the article-side
helper").
"""

from __future__ import annotations

import re
import unicodedata

_NON_WORD = re.compile(r"[^\w\s-]")
_SEPARATORS = re.compile(r"[\s_-]+")


def ascii_filename_slug(text: str, *, fallback: str = "file") -> str:
    """Return an ASCII-safe, lowercase, hyphen-separated filename slug.

    Folds Unicode to ASCII (NFKD), strips characters that are neither word
    characters, whitespace, nor hyphens, then collapses runs of
    whitespace / underscores / hyphens to a single hyphen.

    Args:
        text: Source text, e.g. a book or article title.
        fallback: Returned when ``text`` slugifies to an empty string
            (all-symbol or all-non-ASCII input).

    Returns:
        The lowercase hyphen-separated slug, or ``fallback`` when empty.

    Example:
        >>> ascii_filename_slug("Cafe Deja Vu!", fallback="article")
        'cafe-deja-vu'
    """
    folded = unicodedata.normalize("NFKD", text)
    ascii_only = folded.encode("ascii", "ignore").decode("ascii")
    cleaned = _NON_WORD.sub("", ascii_only).strip()
    cleaned = _SEPARATORS.sub("-", cleaned)
    return cleaned.lower() or fallback
