"""Unit tests for the ``_body_text_excerpt`` helper.

MEDIUM-IMPORT-EXCERPT-AUTOFILL-01: pins the length-capping +
sentence-boundary behavior independent of the full import flow.
End-to-end tests in ``backend/tests/test_medium_import_endpoint.py``
cover the subtitle→excerpt and body-fallback paths through the live
import endpoint; the unit tests here cover the helper's edge cases
without the import scaffolding.
"""

from __future__ import annotations

from bibliogon_medium_import.importer import _body_text_excerpt


def _doc(*paragraphs: str) -> dict:
    """Build a TipTap doc with one paragraph node per string."""
    return {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": p}],
            }
            for p in paragraphs
        ],
    }


def test_short_text_returned_as_is() -> None:
    excerpt = _body_text_excerpt(_doc("A short body that easily fits."))
    assert excerpt == "A short body that easily fits."


def test_long_text_cut_at_sentence_boundary() -> None:
    # Each sentence ~80 chars; full text well over 300.
    long = (
        "This is the first sentence that runs a fair distance "
        "with extra padding words to clear seventy characters. "
        "Here is a second sentence adding more weight to the body "
        "again with deliberate padding for length budgeting purposes. "
        "Now comes a third sentence which keeps padding the text "
        "with another long-winded clause for testing wrap budgets. "
        "Followed by a fourth which keeps us past the cap entirely "
        "with even more text added on for safety of the assertion."
    )
    excerpt = _body_text_excerpt(_doc(long))
    assert excerpt is not None
    assert len(excerpt) <= 300
    # Cut at a sentence terminator, not mid-word.
    assert excerpt.endswith(".")
    # The first sentence fits comfortably.
    assert "first sentence" in excerpt
    # The fourth sentence is beyond the 300-char budget.
    assert "fourth which keeps us past the cap" not in excerpt


def test_hard_truncate_with_ellipsis_when_no_sentence_boundary() -> None:
    # No `. ` / `! ` / `? ` markers within 300 chars => hard-truncate.
    no_terminators = (
        "a " * 200  # 400 chars of "a " repeating; no sentence terminator
    )
    excerpt = _body_text_excerpt(_doc(no_terminators))
    assert excerpt is not None
    assert excerpt.endswith("...")
    assert len(excerpt) <= 300


def test_empty_doc_returns_none() -> None:
    assert _body_text_excerpt({"type": "doc", "content": []}) is None
    assert _body_text_excerpt({}) is None


def test_whitespace_only_doc_returns_none() -> None:
    excerpt = _body_text_excerpt(_doc("   ", "\n", "\t  "))
    assert excerpt is None


def test_text_across_multiple_paragraphs_is_concatenated() -> None:
    excerpt = _body_text_excerpt(
        _doc("First short paragraph.", "Second short paragraph.")
    )
    # Paragraphs joined with a space (matches _flatten_body_text).
    assert excerpt == "First short paragraph. Second short paragraph."


def test_sentence_boundary_below_min_slice_triggers_hard_truncate() -> None:
    """If the only sentence boundary appears below _EXCERPT_MIN_SLICE
    (200), we hard-truncate at the cap rather than cutting at the
    early boundary. Otherwise a single short sentence at the start
    would orphan the rest of the excerpt budget."""
    # Sentence boundary at char ~10, then a long no-terminator tail.
    text = "Short. " + ("x" * 400)
    excerpt = _body_text_excerpt(_doc(text))
    assert excerpt is not None
    # Should NOT collapse to "Short." — that boundary is below 200.
    assert excerpt != "Short."
    assert excerpt.endswith("...")
    assert len(excerpt) <= 300


def test_respects_custom_max_chars() -> None:
    long = "First sentence. " + ("x " * 100)
    excerpt = _body_text_excerpt(_doc(long), max_chars=20)
    assert excerpt is not None
    assert len(excerpt) <= 20
