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
        "title": "T", "author": "A", "language": "de", "description": "D",
        "keywords": json.dumps(["one", "two"]),
        "chapters": [{}],
    }
    result = check_metadata_completeness(book)
    assert any(i.field == "keywords" and "2 keyword" in i.message for i in result.issues)


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
