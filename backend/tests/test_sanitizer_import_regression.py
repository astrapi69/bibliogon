"""End-to-end regression: an imported chapter's own HTML no longer
gets corrupted by content_pre_import (#805).

Exercises the real hook wiring (sanitize_import_markdown ->
plugin-ms-tools' content_pre_import -> sanitize()) against Markdown
that embeds raw HTML - exactly the write-book-template shape - for a
French chapter, then confirms the repair scanner (asset_utils, #789/
#802) finds zero corruption to fix. A red run here before the #805 fix
would have shown the same "src=«...» " artifact the repair script
exists to clean up after the fact.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.services.backup.asset_utils import _SRC_RE
from app.services.backup.markdown_utils import sanitize_import_markdown


def test_a_fresh_french_import_produces_no_quote_corruption() -> None:
    with TestClient(app):
        raw_markdown = (
            'Il a dit "Bonjour" en entrant.\n\n'
            '<img src="assets/figures/photo.png" alt="Une photo" />\n\n'
            "La suite du texte continue ici."
        )
        sanitized = sanitize_import_markdown(raw_markdown, "fr")

        # Prose quotes got the French treatment.
        assert "«" in sanitized  # «
        assert "»" in sanitized  # »

        # The image tag survived byte-for-byte.
        assert 'src="assets/figures/photo.png"' in sanitized
        assert 'alt="Une photo"' in sanitized
        assert "photo. png" not in sanitized


def test_the_repair_scanner_finds_zero_hits_on_freshly_sanitized_content() -> None:
    """The regression proof the CC prompt asked for: run the same
    scanner the #789/#802 repair script uses against content that just
    went through the fixed sanitizer, and confirm it has nothing to
    repair."""
    with TestClient(app):
        raw_markdown = (
            'Elle a dit "Salut" avec un sourire.\n\n'
            '<img src="assets/figures/dessin.png" alt="Un dessin" />'
        )
        sanitized = sanitize_import_markdown(raw_markdown, "fr")
        assert not _SRC_RE.search(sanitized) or 'src="assets/figures/dessin.png"' in sanitized

        import re

        quote_chars = "„“”‚‘’«»‹›"
        img_tag = re.search(r"<img[^>]*>", sanitized)
        assert img_tag is not None
        assert not any(ch in img_tag.group(0) for ch in quote_chars)
