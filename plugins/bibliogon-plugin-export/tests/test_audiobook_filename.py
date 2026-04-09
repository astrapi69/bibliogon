"""Unit tests for the audiobook filename override helper."""

from bibliogon_export.routes import _audiobook_base_name


def test_falls_back_to_default_when_unset():
    assert _audiobook_base_name({}, "my-book-ebook") == "my-book-ebook"


def test_falls_back_when_explicit_none():
    assert _audiobook_base_name({"audiobook_filename": None}, "my-book-ebook") == "my-book-ebook"


def test_falls_back_when_empty_string():
    assert _audiobook_base_name({"audiobook_filename": "   "}, "my-book-ebook") == "my-book-ebook"


def test_uses_custom_name_when_set():
    assert _audiobook_base_name({"audiobook_filename": "my-special-cut"}, "fallback") == "my-special-cut"


def test_strips_user_supplied_extension():
    """Users often paste a full filename with extension; strip it."""
    assert _audiobook_base_name({"audiobook_filename": "audiobook.mp3"}, "fb") == "audiobook"
    assert _audiobook_base_name({"audiobook_filename": "MIX.ZIP"}, "fb") == "MIX"


def test_sanitizes_path_separators():
    """Path traversal characters get neutralized so the user can't escape the temp dir."""
    result = _audiobook_base_name({"audiobook_filename": "../escape/me"}, "fb")
    assert "/" not in result
    assert "\\" not in result


def test_pure_extension_collapses_to_default():
    """A name that is *only* an extension would otherwise become empty."""
    assert _audiobook_base_name({"audiobook_filename": ".mp3"}, "fallback") == "fallback"
