"""The shell's reader of the published origin (#1102).

``scripts/public_origin.py`` is how the Makefile and ``deploy-pages.yml``
get the external-host gate's ``--origin``. It has to resolve a build's
``VITE_PUBLIC_*`` overrides exactly as ``resolveOriginConfig`` does for the
bundle, because the two answer the same question about the same artifact: a
build published to a second host must be scanned against ITS origin, or
every self-reference in it reads as a third-party fetch.

The four cases below are the ones the two readers have to agree on. The
TypeScript side's own pins live in
``frontend/src/lib/origin/originConfig.test.ts``.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[2]
_SCRIPT = _REPO_ROOT / "scripts" / "public_origin.py"


@pytest.fixture(scope="module")
def reader():
    spec = importlib.util.spec_from_file_location("public_origin", _SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def config(tmp_path: Path) -> Path:
    path = tmp_path / "public-origin.json"
    path.write_text(
        json.dumps(
            {
                "origin": "https://declared.test",
                "appPath": "/app/",
                "previewPath": "/app-preview/",
            }
        ),
        encoding="utf-8",
    )
    return path


class TestWithoutOverrides:
    def test_prints_the_declared_origin(self, reader, config):
        assert reader.read_field("origin", config, {}) == "https://declared.test"

    def test_derives_the_host_rather_than_storing_it(self, reader, config):
        assert reader.read_field("host", config, {}) == "declared.test"

    def test_prints_a_declared_path(self, reader, config):
        assert reader.read_field("appPath", config, {}) == "/app/"

    def test_an_unknown_field_is_an_error_rather_than_an_empty_line(self, reader, config):
        with pytest.raises(KeyError):
            reader.read_field("nope", config, {})

    def test_a_config_without_a_string_origin_says_so(self, reader, tmp_path):
        path = tmp_path / "public-origin.json"
        path.write_text(json.dumps({"appPath": "/app/"}), encoding="utf-8")
        with pytest.raises(KeyError):
            reader.read_field("origin", path, {})


class TestWithOverrides:
    """The second-host deploy: the same bundle, a different origin."""

    def test_the_override_origin_wins(self, reader, config):
        env = {"VITE_PUBLIC_ORIGIN": "https://bibliogon.app"}
        assert reader.read_field("origin", config, env) == "https://bibliogon.app"

    def test_the_host_follows_the_override(self, reader, config):
        env = {"VITE_PUBLIC_ORIGIN": "https://bibliogon.app"}
        assert reader.read_field("host", config, env) == "bibliogon.app"

    def test_a_trailing_slash_is_stripped_as_the_bundle_strips_it(self, reader, config):
        env = {"VITE_PUBLIC_ORIGIN": "https://bibliogon.app/"}
        assert reader.read_field("origin", config, env) == "https://bibliogon.app"

    def test_the_override_path_wins(self, reader, config):
        env = {"VITE_PUBLIC_APP_PATH": "/"}
        assert reader.read_field("appPath", config, env) == "/"

    def test_a_blank_override_is_not_an_override(self, reader, config):
        for blank in ("", "   ", "\t"):
            env = {"VITE_PUBLIC_ORIGIN": blank}
            assert reader.read_field("origin", config, env) == "https://declared.test"

    def test_one_override_leaves_the_other_field_declared(self, reader, config):
        env = {"VITE_PUBLIC_ORIGIN": "https://bibliogon.app"}
        assert reader.read_field("appPath", config, env) == "/app/"


class TestAgainstTheRealConfig:
    """The repo's own config, so a field rename here fails loudly."""

    def test_the_committed_config_resolves(self, reader):
        origin = reader.read_field("origin")
        assert origin.startswith("https://")
        assert not origin.endswith("/")
        assert reader.read_field("host") in origin
        assert reader.read_field("appPath").startswith("/")
