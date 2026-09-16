"""Guard: every hand-maintained list of plugins matches ``plugins/`` on disk (#867).

Three hand-maintained lists drifted from the plugin directory within one
week: the Makefile test aggregates (#863), the CLAUDE.md plugin table
and the docs/API.md router table (#867). Each was fixed by adding the
missing rows, and each would have drifted again, because a list a human
edits is only as complete as the last human who remembered it.

This module is the ONE place that knows which files enumerate plugins
by hand. Every entry in ``HANDLISTS`` is checked both ways against the
directories under ``plugins/``: a plugin on disk that a list lacks
fails, and a listed name with no directory fails. Membership checks
that used to live next to their file-specific checks
(``test_makefile_plugin_targets.py``, ``test_ci_plugin_matrix.py``)
moved here; those modules keep only what is specific to their file
(recipes, ``--cov`` packages, ``.PHONY``, matrix package names).

Adding a new hand-maintained plugin list anywhere in the repo means
adding a ``HandList`` entry here - the developer guide says so
(docs/help/*/developers/plugins.md). Lists that are deliberately a
curated subset (the offline seed's visible plugins, the editor plugin
status in routes_admin, the developer guide's complexity examples) are
not registered: they are not claims of completeness.

Numeric claims ("13 first-party plugins") are the same drift in a
different shape, so the last test rejects any such number that does not
equal the on-disk count.
"""

from __future__ import annotations

import re
import tomllib
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import pytest
import yaml

_REPO_ROOT = Path(__file__).resolve().parents[2]
_PLUGINS_DIR = _REPO_ROOT / "plugins"


def plugins_on_disk() -> set[str]:
    """Plugin slugs (``kdp``, ``story-bible``) with a ``pyproject.toml``."""
    return {
        path.name.removeprefix("bibliogon-plugin-")
        for path in _PLUGINS_DIR.glob("bibliogon-plugin-*")
        if path.is_dir() and (path / "pyproject.toml").is_file()
    }


def _section(text: str, heading: str) -> str:
    """The body of the Markdown section that starts with ``heading``
    (a full ``## ...`` line), up to the next heading of the same or a
    higher level."""
    match = re.search(
        rf"^{re.escape(heading)}\s*$(.*?)(?=^##? |\Z)", text, re.MULTILINE | re.DOTALL
    )
    assert match, f"no section {heading!r} - was it renamed?"
    return match.group(1)


def _table_rows(text: str, heading: str, row_pattern: str) -> set[str]:
    return set(re.findall(row_pattern, _section(text, heading), re.MULTILINE))


def _makefile_prerequisites(text: str, target: str, prefix: str) -> set[str]:
    joined = text.replace("\\\n", " ")
    match = re.search(rf"^{re.escape(target)}:([^#\n]*)", joined, re.MULTILINE)
    assert match, f"Makefile has no '{target}' target (was it renamed?)"
    return {name.removeprefix(prefix) for name in match.group(1).split() if name.startswith(prefix)}


def _nightly_matrix(text: str, job_name: str) -> set[str]:
    jobs = yaml.safe_load(text)["jobs"]
    assert job_name in jobs, f"nightly.yml has no '{job_name}' job (was it renamed?)"
    matrix = jobs[job_name]["strategy"]["matrix"]
    entries = [e["plugin"] for e in matrix["include"]] if "include" in matrix else matrix["plugin"]
    return {name.removeprefix("bibliogon-plugin-") for name in entries}


def _pyproject_path_deps(text: str) -> set[str]:
    deps = tomllib.loads(text)["tool"]["poetry"]["dependencies"]
    return {
        name.removeprefix("bibliogon-plugin-")
        for name, spec in deps.items()
        if name.startswith("bibliogon-plugin-") and isinstance(spec, dict) and "path" in spec
    }


def _app_yaml_plugins(text: str) -> set[str]:
    plugins = yaml.safe_load(text)["plugins"]
    return set(plugins.get("enabled") or []) | set(plugins.get("disabled") or [])


def _config_plugin_yamls(_: str) -> set[str]:
    return {path.stem for path in (_REPO_ROOT / "backend" / "config" / "plugins").glob("*.yaml")}


@dataclass(frozen=True)
class HandList:
    """One file that enumerates plugins by hand and claims to be complete."""

    name: str
    path: str
    extract: Callable[[str], set[str]]
    why: str

    def listed(self) -> set[str]:
        target = _REPO_ROOT / self.path
        text = target.read_text(encoding="utf-8") if target.is_file() else ""
        return self.extract(text)


HANDLISTS: tuple[HandList, ...] = (
    HandList(
        "CLAUDE.md plugin table",
        "CLAUDE.md",
        lambda t: _table_rows(t, "## Plugins", r"^\| plugin-([a-z-]+)\s*\|"),
        "the table every session reads to learn which plugins exist",
    ),
    HandList(
        "README.md plugin table",
        "README.md",
        lambda t: _table_rows(t, "## Plugins", r"^\| ([a-z-]+) \| MIT \|"),
        "the public feature list",
    ),
    HandList(
        "README-de.md plugin table",
        "README-de.md",
        lambda t: _table_rows(t, "## Plugins", r"^\| ([a-z-]+) \| MIT \|"),
        "the public feature list, German",
    ),
    HandList(
        "docs/API.md plugin router table",
        "docs/API.md",
        lambda t: _table_rows(t, "## Plugin routers", r"^\| ([a-z-]+)\s+\| `/api"),
        "the only overview of which prefixes exist outside the running OpenAPI schema",
    ),
    HandList(
        "Makefile test-plugins",
        "Makefile",
        lambda t: _makefile_prerequisites(t, "test-plugins", "test-plugin-"),
        "make test runs exactly these suites (#863)",
    ),
    HandList(
        "Makefile test-coverage-plugins",
        "Makefile",
        lambda t: _makefile_prerequisites(t, "test-coverage-plugins", "test-coverage-plugin-"),
        "make test-coverage measures exactly these packages (#863)",
    ),
    HandList(
        "nightly.yml plugin-tests matrix",
        ".github/workflows/nightly.yml",
        lambda t: _nightly_matrix(t, "plugin-tests"),
        "the isolated-venv install path a plugin gets nowhere else (#838)",
    ),
    HandList(
        "nightly.yml plugin-coverage matrix",
        ".github/workflows/nightly.yml",
        lambda t: _nightly_matrix(t, "plugin-coverage"),
        "per-plugin coverage in CI (#838)",
    ),
    HandList(
        "backend/pyproject.toml path dependencies",
        "backend/pyproject.toml",
        _pyproject_path_deps,
        "entry-point discovery only sees installed packages; a plugin missing here is 404 in CI",
    ),
    HandList(
        "app.yaml.example plugins.enabled",
        "backend/config/app.yaml.example",
        _app_yaml_plugins,
        "the shipped default; the user-overlay migration appends from it",
    ),
    HandList(
        "backend/config/plugins/*.yaml",
        "backend/config/plugins",
        _config_plugin_yamls,
        "the canonical plugin metadata; the Settings UI falls back to the raw slug without it",
    ),
)

_COUNT_CLAIMS = (
    ("README.md", r"(\d+) first-party plugins"),
    ("README.md", r"(\d+)-plugin test matrix"),
    ("README-de.md", r"(\d+) First-Party-Plugins"),
    ("CONTRIBUTING.md", r"(\d+) first-party plugins"),
    ("CLAUDE.md", r"(\d+) first-party plugins"),
)


def _ids(handlist: HandList) -> str:
    return handlist.name


@pytest.mark.parametrize("handlist", HANDLISTS, ids=_ids)
def test_lists_every_plugin_on_disk(handlist: HandList) -> None:
    missing = sorted(plugins_on_disk() - handlist.listed())
    assert not missing, (
        f"{handlist.name} ({handlist.path}) is missing plugins that exist under plugins/: "
        f"{missing}. This list is {handlist.why}; add a row for each."
    )


@pytest.mark.parametrize("handlist", HANDLISTS, ids=_ids)
def test_lists_no_plugin_that_no_longer_exists(handlist: HandList) -> None:
    stale = sorted(handlist.listed() - plugins_on_disk())
    assert not stale, f"{handlist.name} ({handlist.path}) names plugins with no directory: {stale}"


@pytest.mark.parametrize("handlist", HANDLISTS, ids=_ids)
def test_the_extractor_actually_finds_rows(handlist: HandList) -> None:
    """A regex that silently matches nothing would make the two checks
    above pass vacuously on a renamed heading or a reformatted table."""
    assert len(handlist.listed()) >= 10, (
        f"{handlist.name}: extractor found {len(handlist.listed())} plugins - "
        "the section or row format probably changed; fix the extractor, not the test"
    )


def test_numeric_plugin_count_claims_match_disk() -> None:
    expected = len(plugins_on_disk())
    wrong: list[str] = []
    for relative, pattern in _COUNT_CLAIMS:
        text = (_REPO_ROOT / relative).read_text(encoding="utf-8")
        for number in re.findall(pattern, text):
            if int(number) != expected:
                wrong.append(f"{relative}: says {number}, plugins/ has {expected} ({pattern})")
    assert not wrong, "Stale plugin counts:\n  " + "\n  ".join(wrong)
