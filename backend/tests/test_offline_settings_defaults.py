"""Guard: the offline build's defaults carry the same keys as the example (#946).

``frontend/src/storage/seed/seed-settings.json`` is what the backendless
PWA boots with. ``backend/config/app.yaml.example`` is what a developer
copies for a local install. #853 stopped deriving one from the other,
deliberately - the two consumers want different VALUES, and a source two
consumers must disagree about is a coupling rather than a source of truth.

Their KEY SETS are a different matter. A key in one and not the other
means a feature's default is missing for that consumer: the offline build
shipped without the confirm-skip toggle, the configurable create-defaults
and the picture-book PDF defaults, while a fresh local config lacked the
dashboard view and page-size defaults and the article-topic list.

So values are free and keys are checked, in both directions.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import yaml

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
_SEED = _REPO_ROOT / "frontend" / "src" / "storage" / "seed" / "seed-settings.json"
_EXAMPLE = _REPO_ROOT / "backend" / "config" / "app.yaml.example"

#: Computed by ``GET /settings/app`` rather than configured. The frontend
#: reads it (App.tsx, AiAssistantSettings), and in the backendless build the
#: seed is the only thing that can supply it - so it belongs in the seed and
#: must NOT appear in a file a developer copies as their own config.
_SEED_ONLY = frozenset({"_secrets_managed_externally"})


def _flatten(value: Any, prefix: str = "") -> set[str]:
    """Dotted leaf paths. A dict-valued key contributes its leaves, not itself."""
    keys: set[str] = set()
    for key, child in (value or {}).items():
        path = f"{prefix}.{key}" if prefix else key
        if isinstance(child, dict) and child:
            keys |= _flatten(child, path)
        else:
            keys.add(path)
    return keys


def _seed_keys() -> set[str]:
    return _flatten(json.loads(_SEED.read_text(encoding="utf-8")))


def _example_keys() -> set[str]:
    return _flatten(yaml.safe_load(_EXAMPLE.read_text(encoding="utf-8")))


def test_both_files_parse_and_carry_keys() -> None:
    """Guard the guard: an empty set would make the comparison vacuous."""
    assert len(_seed_keys()) > 20
    assert len(_example_keys()) > 20


def test_the_offline_build_carries_every_configured_default() -> None:
    missing = _example_keys() - _seed_keys()
    assert not missing, (
        "app.yaml.example configures defaults the backendless build ships "
        "without, so the offline user gets whatever the code falls back to: "
        + ", ".join(sorted(missing))
    )


def test_a_fresh_local_config_carries_every_offline_default() -> None:
    missing = _seed_keys() - _example_keys() - _SEED_ONLY
    assert not missing, (
        "the offline seed carries defaults app.yaml.example does not, so a "
        "developer copying it starts without them: " + ", ".join(sorted(missing))
    )


def test_the_computed_meta_flag_stays_out_of_the_example() -> None:
    leaked = _SEED_ONLY & _example_keys()
    assert not leaked, (
        "GET /settings/app computes these; a copied config must not pin them: "
        + ", ".join(sorted(leaked))
    )
