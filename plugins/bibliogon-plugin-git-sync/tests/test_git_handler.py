"""Unit tests for ``bibliogon_git_sync.handlers.git_handler``.

GitPython's ``Repo.clone_from`` is monkey-patched so the suite
runs without network access.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from bibliogon_git_sync.handlers.git_handler import (
    GitImportHandler,
    _slug_from_url,
)


# --- can_handle ---


@pytest.mark.parametrize(
    "url",
    [
        "https://github.com/astrapi69/write-book-template",
        "https://github.com/astrapi69/write-book-template.git",
        "http://gitea.local/group/repo.git",
        "git@github.com:foo/bar.git",
        "ssh://git@github.com/foo/bar.git",
    ],
)
def test_can_handle_accepts_git_url_shapes(url: str) -> None:
    assert GitImportHandler().can_handle(url) is True


@pytest.mark.parametrize(
    "url",
    [
        "",
        "   ",
        "not a url",
        "ftp://example.com/repo.git",
        "/local/path/to/repo",
        "file:///tmp/repo",
    ],
)
def test_can_handle_rejects_non_git_inputs(url: str) -> None:
    assert GitImportHandler().can_handle(url) is False


def test_can_handle_tolerates_non_string() -> None:
    # Pydantic validates upstream but defensive coding: a non-string
    # slipping through must not crash the handler.
    assert GitImportHandler().can_handle(None) is False  # type: ignore[arg-type]


# --- slug extraction ---


@pytest.mark.parametrize(
    "url,expected",
    [
        ("https://github.com/foo/bar.git", "bar"),
        ("https://github.com/foo/bar", "bar"),
        ("https://gitlab.com/a/b/c.git", "c"),
        ("git@github.com:foo/bar.git", "bar"),
        ("ssh://git@host/foo/bar", "bar"),
        # Degenerate URL with no path segment falls back to the host;
        # the real URL regex in can_handle() still accepts it, so the
        # slug is a last-ditch safe-ascii transform, not a semantic one.
        ("https://example.invalid/", "example.invalid"),
        ("https://example.invalid/weird name with spaces.git", "weird-name-with-spaces"),
    ],
)
def test_slug_from_url(url: str, expected: str) -> None:
    assert _slug_from_url(url) == expected


# --- clone (mocked GitPython) ---


class _FakeRepo:
    """Drop-in for ``git.Repo``: records calls, materialises a
    stub WBT project where the real Repo.clone_from would have."""

    calls: list[tuple[str, str]] = []

    @classmethod
    def clone_from(cls, url: str, to_path: str, **_kwargs) -> None:
        cls.calls.append((url, to_path))
        dest = Path(to_path)
        (dest / "config").mkdir(parents=True)
        (dest / "manuscript" / "chapters").mkdir(parents=True)
        (dest / "config" / "metadata.yaml").write_text(
            "title: Fake\nauthor: T\nlang: en\n", encoding="utf-8"
        )
        (dest / "manuscript" / "chapters" / "01-ch.md").write_text(
            "# Chapter\n\nBody.\n", encoding="utf-8"
        )


@pytest.fixture(autouse=True)
def _reset_fake_repo():
    _FakeRepo.calls.clear()
    yield
    _FakeRepo.calls.clear()


def test_clone_invokes_gitpython_and_returns_project_root(
    tmp_path: Path, monkeypatch
) -> None:
    monkeypatch.setattr("git.Repo", _FakeRepo)
    handler = GitImportHandler()

    result = handler.clone(
        "https://github.com/astrapi69/write-book-template", tmp_path
    )
    assert result.is_dir()
    assert result.name == "write-book-template"
    assert (result / "config" / "metadata.yaml").exists()

    assert len(_FakeRepo.calls) == 1
    called_url, called_dest = _FakeRepo.calls[0]
    assert called_url == "https://github.com/astrapi69/write-book-template"
    assert called_dest == str(result)


def test_clone_strips_trailing_whitespace_in_url(
    tmp_path: Path, monkeypatch
) -> None:
    monkeypatch.setattr("git.Repo", _FakeRepo)
    GitImportHandler().clone(
        "  https://github.com/foo/bar.git  ", tmp_path
    )
    called_url, _ = _FakeRepo.calls[0]
    assert called_url == "https://github.com/foo/bar.git"


def test_clone_avoids_collision_on_existing_target(
    tmp_path: Path, monkeypatch
) -> None:
    """If the repo slug dir already exists (UUID collision in the
    parent temp_ref dir), clone picks a unique name instead of
    failing."""
    monkeypatch.setattr("git.Repo", _FakeRepo)
    (tmp_path / "repo").mkdir()

    handler = GitImportHandler()
    result = handler.clone("https://github.com/anyone/repo.git", tmp_path)

    assert result.name.startswith("repo-")
    assert result.name != "repo"
    assert result.is_dir()


def test_clone_propagates_gitpython_errors(
    tmp_path: Path, monkeypatch
) -> None:
    def _boom(*_args, **_kwargs):
        raise RuntimeError("network unreachable")

    class _FailingRepo:
        clone_from = staticmethod(_boom)

    monkeypatch.setattr("git.Repo", _FailingRepo)
    handler = GitImportHandler()

    with pytest.raises(RuntimeError, match="network unreachable"):
        handler.clone("https://github.com/foo/bar.git", tmp_path)
