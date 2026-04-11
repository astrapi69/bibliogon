"""Tests for ms-tools plugin hook implementations."""

from bibliogon_ms_tools.plugin import MsToolsPlugin


def _make_plugin(auto_sanitize: bool | None = True) -> MsToolsPlugin:
    plugin = MsToolsPlugin()
    if auto_sanitize is None:
        plugin.config = {}
    else:
        plugin.config = {"settings": {"auto_sanitize_on_import": auto_sanitize}}
    return plugin


def test_content_pre_import_strips_invisible_chars():
    plugin = _make_plugin()
    dirty = "Hallo\u00a0Welt\u200b!"  # NBSP + ZWSP
    result = plugin.content_pre_import(content=dirty, language="de")
    assert result is not None
    assert "\u00a0" not in result
    assert "\u200b" not in result


def test_content_pre_import_fixes_german_quotes():
    plugin = _make_plugin()
    result = plugin.content_pre_import(content='Er sagte "hallo".', language="de")
    assert result is not None
    assert "\u201e" in result  # „


def test_content_pre_import_returns_none_when_disabled():
    plugin = _make_plugin(auto_sanitize=False)
    dirty = "Hallo\u00a0Welt"
    assert plugin.content_pre_import(content=dirty, language="de") is None


def test_content_pre_import_returns_none_for_clean_content():
    plugin = _make_plugin()
    clean = "Hallo Welt"
    assert plugin.content_pre_import(content=clean, language="en") is None


def test_content_pre_import_returns_none_for_empty_content():
    plugin = _make_plugin()
    assert plugin.content_pre_import(content="", language="de") is None


def test_content_pre_import_defaults_enabled_without_settings():
    plugin = _make_plugin(auto_sanitize=None)
    dirty = "Hallo\u00a0Welt"
    result = plugin.content_pre_import(content=dirty, language="de")
    assert result is not None
    assert "\u00a0" not in result
