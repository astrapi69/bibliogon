"""Tests for app/logging_config.py.

Covers the JSON production formatter and both branches of
``setup_logging`` (human-readable DEBUG vs single-line JSON). Pure
unit tests - no DB, no FastAPI app.
"""

import json
import logging

import pytest

from app.logging_config import JsonFormatter, setup_logging


@pytest.fixture
def restore_root_logger():
    """Save and restore the root logger so ``setup_logging`` calls here
    do not leak handler/level state into other test modules."""
    root = logging.getLogger()
    saved_handlers = root.handlers[:]
    saved_level = root.level
    yield
    root.handlers = saved_handlers
    root.setLevel(saved_level)


def _make_record(**extra) -> logging.LogRecord:
    record = logging.LogRecord(
        name="test.logger",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="hello %s",
        args=("world",),
        exc_info=None,
    )
    for key, value in extra.items():
        setattr(record, key, value)
    return record


def test_json_formatter_emits_single_line_json_with_core_fields():
    formatted = JsonFormatter().format(_make_record())

    assert "\n" not in formatted
    payload = json.loads(formatted)
    assert payload["level"] == "INFO"
    assert payload["logger"] == "test.logger"
    assert payload["message"] == "hello world"
    assert "timestamp" in payload


def test_json_formatter_includes_known_extra_fields():
    record = _make_record(book_id="abc123", plugin="export", count=7)

    payload = json.loads(JsonFormatter().format(record))

    assert payload["book_id"] == "abc123"
    assert payload["plugin"] == "export"
    assert payload["count"] == 7
    assert "format" not in payload


def test_json_formatter_serializes_exception_when_present():
    import sys

    try:
        raise ValueError("boom")
    except ValueError:
        record = logging.LogRecord(
            name="test.logger",
            level=logging.ERROR,
            pathname=__file__,
            lineno=1,
            msg="failed",
            args=(),
            exc_info=sys.exc_info(),
        )

    payload = json.loads(JsonFormatter().format(record))

    assert "exception" in payload
    assert "ValueError" in payload["exception"]


def test_setup_logging_debug_uses_human_formatter_and_debug_level(monkeypatch, restore_root_logger):
    monkeypatch.setenv("BIBLIOGON_DEBUG", "true")

    setup_logging()

    root = logging.getLogger()
    assert root.level == logging.DEBUG
    assert len(root.handlers) == 1
    assert not isinstance(root.handlers[0].formatter, JsonFormatter)


def test_setup_logging_production_uses_json_formatter_and_info_level(
    monkeypatch, restore_root_logger
):
    monkeypatch.setenv("BIBLIOGON_DEBUG", "false")

    setup_logging()

    root = logging.getLogger()
    assert root.level == logging.INFO
    assert len(root.handlers) == 1
    assert isinstance(root.handlers[0].formatter, JsonFormatter)
