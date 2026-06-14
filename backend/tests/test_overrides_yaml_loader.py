"""Branch-coverage tests for ``app_settings.allow_books_without_author``.

The reader returns the ``app.allow_books_without_author`` flag from
``backend/config/app.yaml`` as a coerced bool, with a fall-through
``False`` on any read failure. These tests pin every branch so mutmut
survivors mutmut_5..34 (per ``docs/audits/mutmut-2026-05-02-import.md``)
stay killed.

History: the flag used to have a third private copy in
``import_plugins/overrides.py`` (``_allow_books_without_author_from_yaml``).
That copy was unified into the canonical ``services/app_settings``
reader (#160); this file was repointed to pin the canonical function so
the thorough branch coverage is preserved rather than lost in the merge.

Path redirection: ``allow_books_without_author`` resolves the config
path via ``_app_config_path()``. We monkeypatch that seam to land on a
temp file, mirroring the ``point_at`` fixture in ``test_app_settings.py``.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.services import app_settings
from app.services.app_settings import allow_books_without_author


@pytest.fixture
def fake_backend(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    config_dir = tmp_path / "config"
    config_dir.mkdir()
    config_path = config_dir / "app.yaml"
    monkeypatch.setattr(app_settings, "_app_config_path", lambda: config_path)
    return tmp_path


def _write_yaml(fake_backend: Path, content: str) -> None:
    (fake_backend / "config" / "app.yaml").write_text(content, encoding="utf-8")


def test_returns_false_when_config_file_missing(fake_backend: Path) -> None:
    assert allow_books_without_author() is False


def test_returns_false_when_yaml_empty(fake_backend: Path) -> None:
    _write_yaml(fake_backend, "")
    assert allow_books_without_author() is False


def test_returns_false_when_app_section_missing(fake_backend: Path) -> None:
    _write_yaml(fake_backend, "other:\n  unrelated: true\n")
    assert allow_books_without_author() is False


def test_returns_false_when_flag_key_missing(fake_backend: Path) -> None:
    _write_yaml(fake_backend, "app:\n  other_flag: true\n")
    assert allow_books_without_author() is False


def test_returns_true_when_flag_true(fake_backend: Path) -> None:
    _write_yaml(fake_backend, "app:\n  allow_books_without_author: true\n")
    assert allow_books_without_author() is True


def test_returns_false_when_flag_false(fake_backend: Path) -> None:
    _write_yaml(fake_backend, "app:\n  allow_books_without_author: false\n")
    assert allow_books_without_author() is False


def test_returns_false_when_flag_null(fake_backend: Path) -> None:
    _write_yaml(fake_backend, "app:\n  allow_books_without_author: null\n")
    assert allow_books_without_author() is False


def test_returns_true_when_flag_is_truthy_string(fake_backend: Path) -> None:
    _write_yaml(fake_backend, 'app:\n  allow_books_without_author: "yes"\n')
    assert allow_books_without_author() is True


def test_returns_false_when_flag_is_empty_string(fake_backend: Path) -> None:
    _write_yaml(fake_backend, 'app:\n  allow_books_without_author: ""\n')
    assert allow_books_without_author() is False


def test_returns_true_when_flag_is_nonzero_int(fake_backend: Path) -> None:
    _write_yaml(fake_backend, "app:\n  allow_books_without_author: 1\n")
    assert allow_books_without_author() is True


def test_returns_false_when_flag_is_zero(fake_backend: Path) -> None:
    _write_yaml(fake_backend, "app:\n  allow_books_without_author: 0\n")
    assert allow_books_without_author() is False


def test_returns_false_on_malformed_yaml(fake_backend: Path) -> None:
    _write_yaml(fake_backend, "app:\n  allow_books_without_author: [unclosed\n")
    assert allow_books_without_author() is False


def test_returns_false_when_unreadable_path(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Top-level ``except Exception`` swallows an OSError raised by ``open``.

    Using a directory in place of the config file produces an
    ``IsADirectoryError`` on ``open(..., encoding=...)``, exercising
    the catch-all branch.
    """
    config_path = tmp_path / "config" / "app.yaml"
    config_path.mkdir(parents=True)
    monkeypatch.setattr(app_settings, "_app_config_path", lambda: config_path)
    assert allow_books_without_author() is False
