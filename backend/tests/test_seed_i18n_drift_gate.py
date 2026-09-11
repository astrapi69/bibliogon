"""Self-check tests for the offline i18n seed-drift gate (#699).

The backendless PWA seeds its i18n from the generated
``seed-i18n-<lang>.json`` mirrors, and regenerating them is a manual step.
#699 found whole key groups that shipped in the YAML and were never
mirrored, so they fell back to raw keys offline only - invisible on desktop.

These tests drive the gate against synthetic catalog/seed pairs, so each
failure mode it claims to catch is actually exercised, plus the real tree
(which must stay in sync).
"""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
GATE = REPO_ROOT / "scripts" / "check_seed_i18n_drift.py"


def load_gate(tmp_path: Path | None = None, languages: tuple[str, ...] = ("de",)):
    spec = importlib.util.spec_from_file_location("check_seed_i18n_drift", GATE)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    if tmp_path is not None:
        module.CATALOG_DIR = tmp_path / "i18n"
        module.SEED_DIR = tmp_path / "seed"
        module.CATALOG_DIR.mkdir(parents=True, exist_ok=True)
        module.SEED_DIR.mkdir(parents=True, exist_ok=True)
        module.LANGUAGES = languages
    return module


def write_pair(module, lang: str, catalog_yaml: str, seed_obj: object) -> None:
    (module.CATALOG_DIR / f"{lang}.yaml").write_text(catalog_yaml, encoding="utf-8")
    (module.SEED_DIR / f"seed-i18n-{lang}.json").write_text(
        json.dumps(seed_obj), encoding="utf-8"
    )


IN_SYNC_YAML = """ui:
  settings:
    title: Einstellungen
    save: Speichern
"""
IN_SYNC_SEED = {"ui": {"settings": {"title": "Einstellungen", "save": "Speichern"}}}


class TestInSync:
    def test_identical_catalog_and_seed_report_nothing(self, tmp_path):
        gate = load_gate(tmp_path)
        write_pair(gate, "de", IN_SYNC_YAML, IN_SYNC_SEED)
        assert gate.check() == []


class TestDrift:
    def test_key_missing_from_the_seed_is_reported(self, tmp_path):
        gate = load_gate(tmp_path)
        write_pair(
            gate,
            "de",
            IN_SYNC_YAML + "    reset: Zuruecksetzen\n",
            IN_SYNC_SEED,
        )
        problems = gate.check()
        assert len(problems) == 1
        assert "not mirrored" in problems[0]
        assert "ui.settings.reset" in problems[0]

    def test_key_only_in_the_seed_is_reported(self, tmp_path):
        gate = load_gate(tmp_path)
        stale = {"ui": {"settings": dict(IN_SYNC_SEED["ui"]["settings"], gone="Weg")}}
        write_pair(gate, "de", IN_SYNC_YAML, stale)
        problems = gate.check()
        assert len(problems) == 1
        assert "no longer exist" in problems[0]
        assert "ui.settings.gone" in problems[0]

    def test_changed_value_is_reported(self, tmp_path):
        gate = load_gate(tmp_path)
        edited = {"ui": {"settings": {"title": "Optionen", "save": "Speichern"}}}
        write_pair(gate, "de", IN_SYNC_YAML, edited)
        problems = gate.check()
        assert len(problems) == 1
        assert "different value" in problems[0]
        assert "ui.settings.title" in problems[0]

    def test_missing_seed_file_is_reported(self, tmp_path):
        gate = load_gate(tmp_path)
        (gate.CATALOG_DIR / "de.yaml").write_text(IN_SYNC_YAML, encoding="utf-8")
        problems = gate.check()
        assert len(problems) == 1
        assert "seed mirror missing" in problems[0]


class TestDuplicateMappingKeys:
    def test_duplicate_namespace_block_is_reported(self, tmp_path):
        """The footgun: a key inserted under a second `settings:` block.

        YAML keeps only the last block, so the earlier insertion is silently
        discarded. The seed matches the parsed dict, so a key-set diff can
        never see it.
        """
        gate = load_gate(tmp_path)
        catalog = """ui:
  settings:
    title: Einstellungen
  other:
    x: y
  settings:
    save: Speichern
"""
        # The seed mirrors what PyYAML actually parsed (last block wins), so
        # only the duplicate check can flag this.
        seed = {"ui": {"other": {"x": "y"}, "settings": {"save": "Speichern"}}}
        write_pair(gate, "de", catalog, seed)

        problems = gate.check()
        assert len(problems) == 1
        assert "duplicate mapping key" in problems[0]
        assert "settings" in problems[0]

    def test_no_duplicate_reported_for_a_single_block(self, tmp_path):
        gate = load_gate(tmp_path)
        write_pair(gate, "de", IN_SYNC_YAML, IN_SYNC_SEED)
        assert gate.check() == []


class TestCli:
    def test_real_tree_is_in_sync(self):
        result = subprocess.run(
            [sys.executable, str(GATE), "--enforce"],
            capture_output=True,
            text=True,
            cwd=REPO_ROOT,
        )
        assert result.returncode == 0, result.stdout + result.stderr

    def test_enforce_flag_controls_the_exit_code(self, tmp_path, monkeypatch, capsys):
        gate = load_gate(tmp_path)
        write_pair(gate, "de", IN_SYNC_YAML + "    reset: Zuruecksetzen\n", IN_SYNC_SEED)

        monkeypatch.setattr(sys, "argv", ["check_seed_i18n_drift.py"])
        assert gate.main() == 0

        monkeypatch.setattr(sys, "argv", ["check_seed_i18n_drift.py", "--enforce"])
        assert gate.main() == 1
        assert "generate-seed-data" in capsys.readouterr().out
