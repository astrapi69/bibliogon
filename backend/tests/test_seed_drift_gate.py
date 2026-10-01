"""Self-checks for the offline-seed drift gate (#853).

Two footguns in `scripts/generate-seed-data.py`, both of which had already
shipped a wrong artifact:

1. Only the i18n catalogs were gated (#699). Every other mirror could go
   stale unnoticed, and #816's Portfolio-Board help page duly shipped
   missing from the offline help navigation.
2. `generate_settings()` read `backend/config/app.yaml`, which is
   GITIGNORED - so each regeneration overwrote the committed offline
   defaults with that developer's personal config. A personal theme and
   AI provider had already reached the shipped seed that way.

The gate's own logic is tested here against fixture directories rather
than by running the real generator: the comparison is what can regress,
and running it would make this a multi-second test for no added signal.
The one test that does import the generator checks it no longer produces
the settings seed at all - which is what makes footgun 2 structurally
impossible rather than merely discouraged.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
GATE = REPO_ROOT / "scripts" / "check_seed_drift.py"
GENERATOR = REPO_ROOT / "scripts" / "generate-seed-data.py"


def _load(path: Path, name: str) -> ModuleType:
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def gate(tmp_path: Path) -> ModuleType:
    module = _load(GATE, "check_seed_drift")
    module.SEED_DIR = tmp_path / "committed"
    module.SEED_DIR.mkdir()
    return module


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


class TestDiffGenerated:
    def test_identical_files_are_in_sync(self, gate: ModuleType, tmp_path: Path) -> None:
        fresh = tmp_path / "fresh"
        write(fresh / "seed-help.json", '{"a": 1}\n')
        write(gate.SEED_DIR / "seed-help.json", '{"a": 1}\n')

        assert gate.diff_generated(fresh) == []

    def test_a_stale_committed_mirror_is_reported(self, gate: ModuleType, tmp_path: Path) -> None:
        """The #816 shape: a source changed, nobody re-ran the generator."""
        fresh = tmp_path / "fresh"
        write(fresh / "seed-help.json", '{"a": 1, "b": 2}\n')
        write(gate.SEED_DIR / "seed-help.json", '{"a": 1}\n')

        problems = gate.diff_generated(fresh)

        assert len(problems) == 1
        assert "seed-help.json" in problems[0]

    def test_a_generated_file_that_was_never_committed_is_reported(
        self, gate: ModuleType, tmp_path: Path
    ) -> None:
        """A new mirror is covered the day the generator produces it."""
        fresh = tmp_path / "fresh"
        write(fresh / "seed-brand-new.json", "{}\n")

        problems = gate.diff_generated(fresh)

        assert any("seed-brand-new.json" in p for p in problems)

    def test_a_committed_file_nothing_generates_any_more_is_reported(
        self, gate: ModuleType, tmp_path: Path
    ) -> None:
        fresh = tmp_path / "fresh"
        write(fresh / "seed-help.json", "{}\n")
        write(gate.SEED_DIR / "seed-help.json", "{}\n")
        write(gate.SEED_DIR / "seed-orphan.json", "{}\n")

        problems = gate.diff_generated(fresh)

        assert any("seed-orphan.json" in p for p in problems)

    def test_the_hand_maintained_settings_seed_is_exempt(
        self, gate: ModuleType, tmp_path: Path
    ) -> None:
        """It is deliberately not generated, so its presence is not drift."""
        fresh = tmp_path / "fresh"
        write(fresh / "seed-help.json", "{}\n")
        write(gate.SEED_DIR / "seed-help.json", "{}\n")
        write(gate.SEED_DIR / "seed-settings.json", '{"ui": {}}\n')

        assert gate.diff_generated(fresh) == []

    def test_a_generator_that_produced_nothing_is_reported(
        self, gate: ModuleType, tmp_path: Path
    ) -> None:
        fresh = tmp_path / "fresh"
        fresh.mkdir()

        assert gate.diff_generated(fresh) != []


class TestGeneratorDoesNotTouchSettings:
    def test_no_generator_function_writes_the_settings_seed(self) -> None:
        """Footgun 2, closed structurally: there is nothing left to call.

        The file name still appears in the module docstring, explaining why
        it is hand-maintained - so this asserts on the write call, not on
        the mention.
        """
        source = GENERATOR.read_text(encoding="utf-8")

        assert "def generate_settings" not in source
        assert '_write_json("seed-settings.json"' not in source

    def test_the_generator_no_longer_reads_the_gitignored_config(self) -> None:
        """`app.yaml` is each developer's own file; a committed artifact
        must never be derived from it."""
        source = GENERATOR.read_text(encoding="utf-8")

        assert 'CONFIG_DIR / "app.yaml"' not in source
