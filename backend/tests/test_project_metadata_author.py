"""Author-shape normalization in the shared WBT metadata parser (#761).

Real-world metadata.yaml files carry ``author`` in three shapes:
a plain string, a Pandoc-style list of strings, or a list of
mappings with ``name`` (+ role/affiliation) keys. The raw pass-
through crashed DetectedProject validation on the list shapes
during the 42-book bulk import dry-run.
"""

from __future__ import annotations

from pathlib import Path

from app.services.backup.project_metadata_parser import _parse_project_metadata


def parse_author(author_value: object, tmp_path: Path) -> str:
    metadata = {"title": "T", "author": author_value}
    return _parse_project_metadata(metadata, tmp_path).author


def test_plain_string_passes_through(tmp_path: Path) -> None:
    assert parse_author("Asterios Raptis", tmp_path) == "Asterios Raptis"


def test_list_of_mappings_joins_names(tmp_path: Path) -> None:
    author_value = [
        {"name": "Asterios Raptis", "role": "author"},
        {"name": "Vicious Path Publishing", "role": "publisher"},
    ]
    assert parse_author(author_value, tmp_path) == "Asterios Raptis, Vicious Path Publishing"


def test_list_of_strings_joins(tmp_path: Path) -> None:
    assert parse_author(["A. One", "B. Two"], tmp_path) == "A. One, B. Two"


def test_single_mapping_uses_name(tmp_path: Path) -> None:
    assert parse_author({"name": "Solo Author"}, tmp_path) == "Solo Author"


def test_missing_or_unusable_falls_back_to_unknown(tmp_path: Path) -> None:
    assert _parse_project_metadata({"title": "T"}, tmp_path).author == "Unknown"
    assert parse_author([{}, {"role": "publisher"}], tmp_path) == "Unknown"
