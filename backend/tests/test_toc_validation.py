"""Unit tests for the TOC validation extracted in God-file split #5.

Exercises validate_book_toc + the slug logic in isolation with
lightweight chapter stand-ins (no DB, no TestClient) - the point of
moving the logic out of the router.
"""

from types import SimpleNamespace

from app.services.toc_validation import _slugify, validate_book_toc


def _ch(chapter_type, title, content="", cid="c1"):
    return SimpleNamespace(id=cid, chapter_type=chapter_type, title=title, content=content)


def test_no_toc_chapter_reports_not_found():
    result = validate_book_toc([_ch("chapter", "Intro")])
    assert result["toc_found"] is False
    assert result["valid"] is True
    assert result["links"] == []


def test_valid_link_to_chapter_title_slug():
    toc = _ch("toc", "Contents", "[Go](#the-first-chapter)", cid="toc1")
    target = _ch("chapter", "The First Chapter", cid="c2")
    result = validate_book_toc([toc, target])
    assert result["toc_found"] is True
    assert result["valid"] is True
    assert result["broken"] == []
    assert result["total_links"] == 1


def test_broken_link_to_missing_anchor():
    toc = _ch("toc", "Contents", "[Gone](#does-not-exist)", cid="toc1")
    target = _ch("chapter", "Real Chapter", cid="c2")
    result = validate_book_toc([toc, target])
    assert result["valid"] is False
    assert result["broken_count"] == 1
    assert result["broken"][0]["anchor"] == "does-not-exist"


def test_html_anchor_links_are_extracted():
    toc = _ch("toc", "Contents", '<a href="#real-chapter">Real</a>', cid="toc1")
    target = _ch("chapter", "Real Chapter", cid="c2")
    result = validate_book_toc([toc, target])
    assert result["valid"] is True
    assert result["total_links"] == 1


def test_slugify_basic_and_unicode():
    assert _slugify("The First Chapter") == "the-first-chapter"
    assert _slugify("We've Arrived") == "we-ve-arrived"
    assert _slugify("Chapter 1: Begin!") == "chapter-1-begin"
    assert _slugify("A  --  B") == "a-b"
    # NFD normalisation strips combining marks (umlaut -> base letter)
    assert _slugify("Über") == "uber"
    # HTML entities are decoded before slugging
    assert _slugify("Tom &amp; Jerry") == "tom-jerry"
