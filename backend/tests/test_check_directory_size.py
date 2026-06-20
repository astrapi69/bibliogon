"""Unit tests for the god-folder ratchet guard (#466 Phase 5).

Covers scripts/check_directory_size.py's pure ``evaluate`` (growth ->
ERROR, shrink -> ratchet, new-god-folder limit, allowlist WARNING) and
the generator's ``count_files``. scripts/ is added to sys.path the same
way test_sync_versions.py does.
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPTS_DIR = REPO_ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import check_directory_size as cds  # noqa: E402
import generate_directory_baseline as gen  # noqa: E402


def test_growth_over_baseline_is_error():
    errors, warnings, _ = cds.evaluate({"d": 10}, {}, {"d": 12})
    assert any("grew" in e for e in errors)
    assert warnings == []


def test_shrink_ratchets_baseline_down_no_error():
    errors, _, ratcheted = cds.evaluate({"d": 10}, {}, {"d": 7})
    assert errors == []
    assert ratcheted["d"] == 7


def test_equal_count_is_ok():
    errors, _, ratcheted = cds.evaluate({"d": 10}, {}, {"d": 10})
    assert errors == []
    assert ratcheted == {"d": 10}


def test_new_godfolder_over_limit_is_error():
    errors, _, _ = cds.evaluate({}, {}, {"new": 16})
    assert any("new god-folder" in e for e in errors)


def test_new_dir_at_or_below_limit_is_ok():
    errors, _, _ = cds.evaluate({}, {}, {"new": 15})
    assert errors == []


def test_allowlisted_dir_over_target_warns_not_errors():
    errors, warnings, _ = cds.evaluate(
        {"d": 229},
        {"d": {"target": 15, "deadline": "v0.58.0"}},
        {"d": 229},
    )
    assert errors == []
    assert any("d" in w and "target 15" in w for w in warnings)


def test_empty_baseline_yields_no_baseline_errors():
    errors, _, _ = cds.evaluate({}, {}, {"d": 5})
    assert errors == []


def test_count_files_counts_only_source_suffixes_non_recursive(tmp_path):
    (tmp_path / "a.ts").write_text("")
    (tmp_path / "b.tsx").write_text("")
    (tmp_path / "c.py").write_text("")
    (tmp_path / "readme.md").write_text("")
    sub = tmp_path / "sub"
    sub.mkdir()
    (sub / "d.ts").write_text("")  # nested -> not counted
    assert gen.count_files(tmp_path) == 3
