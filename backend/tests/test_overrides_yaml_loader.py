"""Unit tests for ``_allow_books_without_author_from_yaml``.

The function reads ``backend/config/app.yaml`` and returns the
``app.allow_books_without_author`` flag as a coerced bool, with a
fall-through ``False`` on any read failure. These tests pin every
branch so mutmut survivors mutmut_5..34 (per
``docs/audits/mutmut-2026-05-02-import.md``) get killed without
needing a full integration TestClient.

Path redirection: the function resolves the config path via
``Path(__file__).resolve().parent.parent.parent / "config" / "app.yaml"``.
We rebuild that exact shape inside ``tmp_path`` and monkeypatch the
module's ``__file__`` so the resolver lands inside the tmp tree.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.import_plugins import overrides
from app.import_plugins.overrides import _allow_books_without_author_from_yaml


@pytest.fixture
def fake_backend(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    backend = tmp_path / "backend"
    fake_module = backend / "app" / "import_plugins" / "overrides.py"
    fake_module.parent.mkdir(parents=True)
    fake_module.write_text("# fake module marker for path resolution")
    (backend / "config").mkdir()
    monkeypatch.setattr(overrides, "__file__", str(fake_module))
    return backend


def _write_yaml(fake_backend: Path, content: str) -> None:
    (fake_backend / "config" / "app.yaml").write_text(content, encoding="utf-8")


def test_returns_false_when_config_file_missing(fake_backend: Path) -> None:
    assert _allow_books_without_author_from_yaml() is False


def test_returns_false_when_yaml_empty(fake_backend: Path) -> None:
    _write_yaml(fake_backend, "")
    assert _allow_books_without_author_from_yaml() is False


def test_returns_false_when_app_section_missing(fake_backend: Path) -> None:
    _write_yaml(fake_backend, "other:\n  unrelated: true\n")
    assert _allow_books_without_author_from_yaml() is False


def test_returns_false_when_flag_key_missing(fake_backend: Path) -> None:
    _write_yaml(fake_backend, "app:\n  other_flag: true\n")
    assert _allow_books_without_author_from_yaml() is False


def test_returns_true_when_flag_true(fake_backend: Path) -> None:
    _write_yaml(fake_backend, "app:\n  allow_books_without_author: true\n")
    assert _allow_books_without_author_from_yaml() is True


def test_returns_false_when_flag_false(fake_backend: Path) -> None:
    _write_yaml(fake_backend, "app:\n  allow_books_without_author: false\n")
    assert _allow_books_without_author_from_yaml() is False


def test_returns_false_when_flag_null(fake_backend: Path) -> None:
    _write_yaml(fake_backend, "app:\n  allow_books_without_author: null\n")
    assert _allow_books_without_author_from_yaml() is False


def test_returns_true_when_flag_is_truthy_string(fake_backend: Path) -> None:
    _write_yaml(fake_backend, 'app:\n  allow_books_without_author: "yes"\n')
    assert _allow_books_without_author_from_yaml() is True


def test_returns_false_when_flag_is_empty_string(fake_backend: Path) -> None:
    _write_yaml(fake_backend, 'app:\n  allow_books_without_author: ""\n')
    assert _allow_books_without_author_from_yaml() is False


def test_returns_true_when_flag_is_nonzero_int(fake_backend: Path) -> None:
    _write_yaml(fake_backend, "app:\n  allow_books_without_author: 1\n")
    assert _allow_books_without_author_from_yaml() is True


def test_returns_false_when_flag_is_zero(fake_backend: Path) -> None:
    _write_yaml(fake_backend, "app:\n  allow_books_without_author: 0\n")
    assert _allow_books_without_author_from_yaml() is False


def test_returns_false_on_malformed_yaml(fake_backend: Path) -> None:
    _write_yaml(fake_backend, "app:\n  allow_books_without_author: [unclosed\n")
    assert _allow_books_without_author_from_yaml() is False


def test_returns_false_when_unreadable_path(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Top-level ``except Exception`` swallows an OSError raised by ``open``.

    Using a directory in place of the config file produces an
    ``IsADirectoryError`` on ``open(..., encoding=...)``, exercising
    the catch-all branch.
    """
    backend = tmp_path / "backend"
    fake_module = backend / "app" / "import_plugins" / "overrides.py"
    fake_module.parent.mkdir(parents=True)
    fake_module.write_text("# fake")
    (backend / "config" / "app.yaml").mkdir(parents=True)
    monkeypatch.setattr(overrides, "__file__", str(fake_module))
    assert _allow_books_without_author_from_yaml() is False
