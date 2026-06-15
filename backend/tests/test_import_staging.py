"""Unit tests for the import-staging path helpers (God-file split #6).

GC + lifecycle are covered end-to-end by test_import_staging_gc.py; this
pins the pure path-safety logic in isolation, including the
ValidationError the split swapped in for the inline HTTPException.
"""

import pytest

from app.exceptions import ValidationError
from app.services.import_staging import is_safe_rel_path, sanitise_rel_path


def test_sanitise_strips_dot_and_leading_slashes():
    assert sanitise_rel_path("/a//b/./c") == "a/b/c"
    assert sanitise_rel_path("book/chapter.md") == "book/chapter.md"


def test_sanitise_empty_falls_back_to_upload():
    assert sanitise_rel_path("") == "upload"
    assert sanitise_rel_path("///") == "upload"


def test_sanitise_rejects_traversal_with_validation_error():
    with pytest.raises(ValidationError):
        sanitise_rel_path("../etc/passwd")
    with pytest.raises(ValidationError):
        sanitise_rel_path("a/../../b")


def test_is_safe_rel_path():
    assert is_safe_rel_path("a/b/c") is True
    assert is_safe_rel_path("") is False
    assert is_safe_rel_path("/abs") is False
    assert is_safe_rel_path("a/../b") is False
    assert is_safe_rel_path("a\\..\\b") is False
