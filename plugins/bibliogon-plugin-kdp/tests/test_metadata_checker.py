"""Tests for KDP metadata completeness checker."""

from bibliogon_kdp.metadata_checker import check_metadata_completeness


def test_complete_book():
    """Book with all required fields should pass."""
    book = {
        "title": "My Book",
        "author": "Author Name",
        "language": "de",
        "description": "A great book about things.",
        "chapters": [{"title": "Ch1"}],
    }
    result = check_metadata_completeness(book)
    assert result.is_complete
    assert result.error_count == 0


def test_missing_title():
    book = {"author": "A", "language": "de", "description": "D", "chapters": [{}]}
    result = check_metadata_completeness(book)
    assert not result.is_complete
    assert any(i.field == "title" for i in result.issues)


def test_missing_author():
    book = {"title": "T", "language": "de", "description": "D", "chapters": [{}]}
    result = check_metadata_completeness(book)
    assert not result.is_complete
    assert any(i.field == "author" for i in result.issues)


def test_missing_description():
    book = {"title": "T", "author": "A", "language": "de", "chapters": [{}]}
    result = check_metadata_completeness(book)
    assert not result.is_complete
    assert any(i.field == "description" for i in result.issues)


def test_missing_chapters():
    book = {"title": "T", "author": "A", "language": "de", "description": "D", "chapters": []}
    result = check_metadata_completeness(book)
    assert not result.is_complete
    assert any(i.field == "chapters" for i in result.issues)


def test_no_keywords_warns():
    book = {"title": "T", "author": "A", "language": "de", "description": "D", "chapters": [{}]}
    result = check_metadata_completeness(book)
    assert any(i.field == "keywords" and i.severity == "warning" for i in result.issues)


def test_few_keywords_warns():
    import json

    book = {
        "title": "T",
        "author": "A",
        "language": "de",
        "description": "D",
        "keywords": json.dumps(["one", "two"]),
        "chapters": [{}],
    }
    result = check_metadata_completeness(book)
    assert any(i.field == "keywords" and "2 keyword" in i.message for i in result.issues)


def test_keywords_as_list_from_new_api():
    """The API now exposes keywords as list[str] directly; checker must accept it."""
    book = {
        "title": "T",
        "author": "A",
        "language": "de",
        "description": "D",
        "keywords": ["one", "two"],
        "chapters": [{}],
    }
    result = check_metadata_completeness(book)
    assert any(i.field == "keywords" and "2 keyword" in i.message for i in result.issues)


def test_enough_keywords_no_warning():
    book = {
        "title": "T",
        "author": "A",
        "language": "de",
        "description": "D",
        "keywords": ["a", "b", "c", "d"],
        "chapters": [{}],
    }
    result = check_metadata_completeness(book)
    assert not any(i.field == "keywords" for i in result.issues)


def test_no_cover_warns():
    book = {"title": "T", "author": "A", "language": "de", "description": "D", "chapters": [{}]}
    result = check_metadata_completeness(book)
    assert any(i.field == "cover_image" and i.severity == "warning" for i in result.issues)


def test_no_isbn_warns():
    book = {"title": "T", "author": "A", "language": "de", "description": "D", "chapters": [{}]}
    result = check_metadata_completeness(book)
    assert any(i.field == "isbn" and i.severity == "warning" for i in result.issues)


def test_complete_with_all_optional():
    import json

    book = {
        "title": "My Book",
        "subtitle": "A Subtitle",
        "author": "Author",
        "language": "en",
        "description": "Great book",
        "keywords": json.dumps(["a", "b", "c", "d", "e", "f", "g"]),
        "cover_image": "cover.jpg",
        "isbn_ebook": "978-1234567890",
        "publisher": "My Press",
        "backpage_description": "Back cover text",
        "chapters": [{"title": "Ch1"}],
        # Bug 9: Categories + BISAC are part of the "all optional"
        # set now. Supplying both keeps the warning_count at 0.
        "categories": ["Fiction"],
        "bisac_codes": ["FIC022020"],
    }
    result = check_metadata_completeness(book)
    assert result.is_complete
    assert result.error_count == 0
    assert result.warning_count == 0


def test_result_to_dict():
    book = {"title": "", "author": "", "language": "", "chapters": []}
    result = check_metadata_completeness(book)
    d = result.to_dict()
    assert "complete" in d
    assert "error_count" in d
    assert "warning_count" in d
    assert "issues" in d
    assert d["complete"] is False
    assert d["error_count"] > 0


# ---------------------------------------------------------------------------
# Bug 9: BISAC + Categories validation
# ---------------------------------------------------------------------------


def _base_book(**overrides):
    """Minimum valid book that satisfies the required-field checks
    so BISAC / Categories tests can pin warnings/errors independently."""
    book = {
        "title": "My Book",
        "author": "Author Name",
        "language": "de",
        "description": "A great book about things.",
        "chapters": [{"title": "Ch1"}],
    }
    book.update(overrides)
    return book


def test_no_categories_warns():
    result = check_metadata_completeness(_base_book())
    assert any(i.field == "categories" and i.severity == "warning" for i in result.issues)


def test_categories_present_no_warning():
    result = check_metadata_completeness(
        _base_book(categories=["Fiction"]),
    )
    assert not any(i.field == "categories" and i.severity == "warning" for i in result.issues)


def test_no_bisac_codes_warns():
    result = check_metadata_completeness(_base_book())
    assert any(i.field == "bisac_codes" and i.severity == "warning" for i in result.issues)


def test_valid_bisac_codes_no_warning_or_error():
    result = check_metadata_completeness(
        _base_book(bisac_codes=["FIC022020", "BIO000000"]),
    )
    assert not any(i.field == "bisac_codes" for i in result.issues)


def test_invalid_bisac_code_is_error():
    result = check_metadata_completeness(
        _base_book(bisac_codes=["BAD-FORMAT"]),
    )
    # The check produces an ERROR (KDP rejects malformed codes at
    # upload, so this is publication-blocking).
    bisac_errors = [i for i in result.issues if i.field == "bisac_codes" and i.severity == "error"]
    assert len(bisac_errors) == 1
    assert "BAD-FORMAT" in bisac_errors[0].message
    # And the book is no longer complete because of the error.
    assert not result.is_complete


def test_multiple_invalid_bisac_codes_produce_multiple_errors():
    """Per-row validation surfaces every offending code so the
    user can fix the whole list in one pass."""
    result = check_metadata_completeness(
        _base_book(
            bisac_codes=["FIC022020", "BAD-ONE", "BAD-TWO", "BIO000000"],
        ),
    )
    bisac_errors = [i for i in result.issues if i.field == "bisac_codes" and i.severity == "error"]
    assert len(bisac_errors) == 2
    error_msgs = " ".join(i.message for i in bisac_errors)
    assert "BAD-ONE" in error_msgs
    assert "BAD-TWO" in error_msgs


def test_too_many_bisac_codes_warns():
    """KDP best practice is ≤ 3 BISAC codes. Supplying more is a
    warning (KDP silently ignores the surplus)."""
    result = check_metadata_completeness(
        _base_book(
            bisac_codes=[
                "FIC022020",
                "BIO000000",
                "SCI000000",
                "BUS027020",  # the 4th — triggers the over-cap warning.
            ],
        ),
    )
    over_cap = [
        i
        for i in result.issues
        if i.field == "bisac_codes" and i.severity == "warning" and "best practice" in i.message
    ]
    assert len(over_cap) == 1
    # Book itself stays complete (it's a warning, not an error).
    assert result.is_complete


def test_exactly_three_bisac_codes_no_over_cap_warning():
    """The cap is at 3 — exactly 3 should NOT produce the over-cap
    warning. Pins the boundary."""
    result = check_metadata_completeness(
        _base_book(
            bisac_codes=["FIC022020", "BIO000000", "SCI000000"],
        ),
    )
    assert not any(
        i.field == "bisac_codes" and i.severity == "warning" and "best practice" in i.message
        for i in result.issues
    )


def test_bisac_codes_check_is_independent_of_categories_check():
    """A book with valid BISAC codes but no categories produces
    only the categories warning, not a BISAC warning."""
    result = check_metadata_completeness(
        _base_book(bisac_codes=["FIC022020"]),
    )
    bisac_issues = [i for i in result.issues if i.field == "bisac_codes"]
    cat_issues = [i for i in result.issues if i.field == "categories"]
    assert bisac_issues == []
    assert len(cat_issues) == 1
