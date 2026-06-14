"""Unit tests for the shared app.yaml settings readers.

Pins the behaviour extracted from routers/books.py + routers/articles.py
in God-file split #3: defaults when the file/key is absent, true values
when present, and the graceful fallback on a malformed days value.
"""

from pathlib import Path

import pytest

from app.services import app_settings


def _write_app_yaml(tmp_path: Path, body: str) -> Path:
    config_dir = tmp_path / "config"
    config_dir.mkdir()
    path = config_dir / "app.yaml"
    path.write_text(body, encoding="utf-8")
    return path


@pytest.fixture
def point_at(monkeypatch, tmp_path):
    """Return a helper that points the readers at a temp app.yaml body."""

    def _point(body: str | None) -> None:
        if body is None:
            target = tmp_path / "config" / "missing.yaml"
        else:
            target = _write_app_yaml(tmp_path, body)
        monkeypatch.setattr(app_settings, "_app_config_path", lambda: target)

    return _point


def test_is_permanent_delete_defaults_false_when_file_missing(point_at):
    point_at(None)
    assert app_settings.is_permanent_delete() is False


def test_is_permanent_delete_defaults_false_when_key_absent(point_at):
    point_at("app:\n  other: 1\n")
    assert app_settings.is_permanent_delete() is False


def test_is_permanent_delete_true_when_set(point_at):
    point_at("app:\n  delete_permanently: true\n")
    assert app_settings.is_permanent_delete() is True


def test_allow_books_without_author_defaults_false(point_at):
    point_at("app: {}\n")
    assert app_settings.allow_books_without_author() is False


def test_allow_books_without_author_true_when_set(point_at):
    point_at("app:\n  allow_books_without_author: true\n")
    assert app_settings.allow_books_without_author() is True


def test_trash_config_defaults_when_file_missing(point_at):
    point_at(None)
    assert app_settings.get_trash_auto_delete_config() == (False, 30)


def test_trash_config_reads_values(point_at):
    point_at("app:\n  trash_auto_delete_enabled: true\n  trash_auto_delete_days: 7\n")
    assert app_settings.get_trash_auto_delete_config() == (True, 7)


def test_trash_config_falls_back_on_malformed_days(point_at):
    point_at("app:\n  trash_auto_delete_enabled: true\n  trash_auto_delete_days: not-a-number\n")
    assert app_settings.get_trash_auto_delete_config() == (False, 30)
