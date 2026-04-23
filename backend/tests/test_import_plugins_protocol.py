"""Tests for the ImportPlugin protocol and registry.

The protocol lives in ``app.import_plugins.protocol``; the registry
in ``app.import_plugins.registry``. Core handlers and external
plugins register against the same registry; these tests only
exercise the skeleton shipped in commit 1.
"""

from __future__ import annotations

import pytest

from app.import_plugins import (
    DetectedAsset,
    DetectedChapter,
    DetectedProject,
    find_handler,
    list_plugins,
    register,
)
from app.import_plugins.registry import _reset_for_tests


def _rebuild_core_handlers() -> None:
    """Re-import handlers/__init__.py so its side-effect
    ``register(...)`` calls run again after ``_reset_for_tests``."""
    import importlib

    import app.import_plugins.handlers

    importlib.reload(app.import_plugins.handlers)


@pytest.fixture(autouse=True)
def clean_registry() -> None:
    _reset_for_tests()
    yield
    # Restore the core handler registration so downstream tests that
    # expect bgb/markdown/wbt/office/markdown-folder to dispatch still
    # work. Without this the registry stays empty after this file
    # finishes and everything that hits /api/import/detect gets a
    # 415 "registered_formats=[]".
    _reset_for_tests()
    _rebuild_core_handlers()


def test_detected_project_defaults_are_empty() -> None:
    project = DetectedProject(format_name="bgb", source_identifier="sha256:abc")
    assert project.chapters == []
    assert project.assets == []
    assert project.warnings == []
    assert project.plugin_specific_data == {}
    assert project.title is None


def test_detected_project_round_trips_through_json() -> None:
    project = DetectedProject(
        format_name="markdown",
        source_identifier="signature:Book/Alice/5",
        title="My Book",
        author="Alice",
        language="en",
        chapters=[
            DetectedChapter(
                title="Chapter 1", position=0, word_count=1200, content_preview="Once"
            )
        ],
        assets=[
            DetectedAsset(
                filename="cover.png",
                path="assets/covers/cover.png",
                size_bytes=4096,
                mime_type="image/png",
                purpose="cover",
            )
        ],
        warnings=["No author specified"],
        plugin_specific_data={"extra": "value"},
    )
    blob = project.model_dump()
    rebuilt = DetectedProject.model_validate(blob)
    assert rebuilt == project


def test_registry_starts_empty() -> None:
    assert list_plugins() == []
    assert find_handler("anything.bgb") is None


def test_register_adds_plugin_and_dispatch_picks_it() -> None:
    class FakeBgb:
        format_name = "bgb"

        def can_handle(self, path: str) -> bool:
            return path.endswith(".bgb")

        def detect(self, path: str) -> DetectedProject:
            return DetectedProject(format_name="bgb", source_identifier="fake")

        def execute(self, path, detected, overrides, duplicate_action="create", existing_book_id=None) -> str:
            return "book-1"

    plugin = FakeBgb()
    register(plugin)
    assert list_plugins() == [plugin]
    assert find_handler("x.bgb") is plugin
    assert find_handler("x.md") is None


def test_first_registered_wins_on_dispatch() -> None:
    class AlwaysTrueA:
        format_name = "a"

        def can_handle(self, path: str) -> bool:
            return True

        def detect(self, path):
            return DetectedProject(format_name="a", source_identifier="a")

        def execute(self, *args, **kwargs):
            return "a"

    class AlwaysTrueB(AlwaysTrueA):
        format_name = "b"

    first, second = AlwaysTrueA(), AlwaysTrueB()
    register(first)
    register(second)
    assert find_handler("whatever") is first
