"""Tests for KDP publication changelog."""

import json

from bibliogon_kdp.changelog import (
    PublicationEntry,
    add_entry,
    export_changelog_markdown,
    get_changelog,
    _CHANGELOG_DIR,
)


def test_publication_entry_to_dict():
    entry = PublicationEntry(version="1.0", format="epub", book_type="ebook", notes="First release")
    d = entry.to_dict()
    assert d["version"] == "1.0"
    assert d["format"] == "epub"
    assert d["notes"] == "First release"
    assert d["timestamp"]  # auto-generated


def test_publication_entry_from_dict():
    data = {"version": "2.0", "format": "pdf", "timestamp": "2026-01-01T00:00:00", "book_type": "paperback", "notes": ""}
    entry = PublicationEntry.from_dict(data)
    assert entry.version == "2.0"
    assert entry.book_type == "paperback"


def test_get_changelog_empty(tmp_path, monkeypatch):
    import bibliogon_kdp.changelog as mod
    monkeypatch.setattr(mod, "_CHANGELOG_DIR", tmp_path / "changelogs")
    assert get_changelog("nonexistent") == []


def test_add_and_get_entry(tmp_path, monkeypatch):
    import bibliogon_kdp.changelog as mod
    monkeypatch.setattr(mod, "_CHANGELOG_DIR", tmp_path / "changelogs")

    entry = add_entry("book1", version="1.0", format="epub")
    assert entry["version"] == "1.0"

    entries = get_changelog("book1")
    assert len(entries) == 1
    assert entries[0]["version"] == "1.0"


def test_multiple_entries_newest_first(tmp_path, monkeypatch):
    import bibliogon_kdp.changelog as mod
    monkeypatch.setattr(mod, "_CHANGELOG_DIR", tmp_path / "changelogs")

    add_entry("book1", version="1.0", format="epub")
    add_entry("book1", version="1.1", format="pdf", notes="Updated cover")

    entries = get_changelog("book1")
    assert len(entries) == 2
    assert entries[0]["version"] == "1.1"  # newest first
    assert entries[1]["version"] == "1.0"


def test_export_markdown_empty(tmp_path, monkeypatch):
    import bibliogon_kdp.changelog as mod
    monkeypatch.setattr(mod, "_CHANGELOG_DIR", tmp_path / "changelogs")

    md = export_changelog_markdown("nonexistent", "My Book")
    assert "No publications" in md
    assert "My Book" in md


def test_export_markdown_with_entries(tmp_path, monkeypatch):
    import bibliogon_kdp.changelog as mod
    monkeypatch.setattr(mod, "_CHANGELOG_DIR", tmp_path / "changelogs")

    add_entry("book1", version="1.0", format="epub", notes="Initial release")
    add_entry("book1", version="1.1", format="pdf", book_type="paperback")

    md = export_changelog_markdown("book1", "Test Book")
    assert "# Changelog: Test Book" in md
    assert "**1.0**" in md
    assert "**1.1**" in md
    assert "EPUB" in md
    assert "PDF" in md
    assert "paperback" in md.lower()
    assert "Initial release" in md
