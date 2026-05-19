"""Regression test for PLUGINFORGE-V060-ADOPTION-01 C3.

Pins the β2 migration of ``min_app_version`` from
``backend/config/plugins/<name>.yaml`` (the canonical UI-metadata
source) to the ``BasePlugin`` class attribute (the canonical
identity-and-contract source per pluginforge v0.7.0 design doc
Decision #3 + Bibliogon's 3-source plugin-metadata pattern).

Before C3, comics.yaml + kinderbuch.yaml declared
``plugin.min_app_version`` but the value was 100% decorative:

- PluginForge's ``_check_app_version`` reads
  ``plugin.min_app_version`` from the CLASS attribute.
- Bibliogon's YAML keys at ``plugin.min_app_version`` are not
  consumed by any code path (verified by grep at audit time).

C3 moves the values to class attributes so they become the
load-bearing source (still unenforced today because Bibliogon
does not pass ``app_version`` to ``PluginManager(...)``; gating
enable is filed as PLUGIN-VERSION-GATING-ENABLE-01 P3).

This test pins:

- The class attribute exists at the expected value on both
  affected plugins.
- The YAML declaration was removed (the per-plugin YAML must
  NOT carry ``min_app_version`` post-C3 — the 3-source pattern
  separates UI-display metadata from identity-and-contract).
- The 10 other plugins remain undeclared (``None``) — no
  drive-by additions.
"""

from __future__ import annotations

from pathlib import Path

import yaml

from bibliogon_comics.plugin import ComicsPlugin
from bibliogon_kinderbuch.plugin import KinderbuchPlugin


_CONFIG_DIR = Path(__file__).resolve().parents[1] / "config" / "plugins"


def test_comics_declares_min_app_version_class_attribute() -> None:
    """The comics plugin gates against host >= 0.35.0 via its
    class attribute (the load-bearing source per pluginforge)."""
    assert ComicsPlugin.min_app_version == "0.35.0"


def test_kinderbuch_declares_min_app_version_class_attribute() -> None:
    """The kinderbuch plugin gates against host >= 0.9.0 via its
    class attribute (the load-bearing source per pluginforge)."""
    assert KinderbuchPlugin.min_app_version == "0.9.0"


def test_comics_yaml_does_not_declare_min_app_version() -> None:
    """The β2 migration removed the decorative YAML key. Per
    Bibliogon's 3-source pattern, identity-and-contract lives on
    the class; the YAML carries UI metadata only."""
    with (_CONFIG_DIR / "comics.yaml").open() as f:
        cfg = yaml.safe_load(f)
    assert "min_app_version" not in cfg["plugin"], (
        "comics.yaml must NOT declare min_app_version after C3; the value "
        "lives on the ComicsPlugin class attribute."
    )


def test_kinderbuch_yaml_does_not_declare_min_app_version() -> None:
    """Mirror of comics: kinderbuch.yaml must not carry the
    decorative key after β2 migration."""
    with (_CONFIG_DIR / "kinderbuch.yaml").open() as f:
        cfg = yaml.safe_load(f)
    assert "min_app_version" not in cfg["plugin"], (
        "kinderbuch.yaml must NOT declare min_app_version after C3; the "
        "value lives on the KinderbuchPlugin class attribute."
    )
