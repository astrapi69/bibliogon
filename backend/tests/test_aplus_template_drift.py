"""Drift guard: A+ module templates in the frontend vs the backend ruleset (#891).

The editor's module catalog (`frontend/src/lib/utils/aplus/moduleTemplates.ts`)
and its field limits (`aplusDocument.ts`) repeat the image sizes, aspect
ratios and limits the AI generator reads from
`bibliogon_aplus/rules/ruleset.yaml`. The two must agree, or a manual module
asks for a different image than the generated one.
"""

from __future__ import annotations

import re
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[2]
TS_DIR = REPO / "frontend" / "src" / "lib" / "utils" / "aplus"
TS_FILE = TS_DIR / "aplusDocument.ts"
TEMPLATES_FILE = TS_DIR / "moduleTemplates.ts"
RULESET = REPO / "plugins" / "bibliogon-plugin-aplus" / "bibliogon_aplus" / "rules" / "ruleset.yaml"

TEMPLATE_TO_RULESET_SLOT = {
    "image_header_text": "module_header",
    "three_images_text": "module_three_images",
}


def _ts_template_slot(template_id: str) -> tuple[str, str]:
    """Size and aspect ratio of the first image slot of a catalog template."""
    source = TEMPLATES_FILE.read_text(encoding="utf-8")
    start = source.index(f'id: "{template_id}"')
    match = re.compile(r'slot\("(?P<size>[0-9x]+)", "(?P<ratio>[0-9:]+)"').search(source, start)
    assert match, f"no image slot for {template_id} in {TEMPLATES_FILE.name}"
    return match["size"], match["ratio"]


def _ts_limits() -> dict[str, int]:
    source = TS_FILE.read_text(encoding="utf-8")
    block = re.search(r"APLUS_FIELD_LIMITS = \{(?P<body>[^}]*)\}", source)
    assert block, "APLUS_FIELD_LIMITS not found"
    return {k: int(v) for k, v in re.findall(r"(\w+):\s*(\d+)", block["body"])}


def _ruleset() -> dict:
    return yaml.safe_load(RULESET.read_text(encoding="utf-8"))


def test_every_ruleset_slot_has_a_matching_frontend_template() -> None:
    style = _ruleset()["image_style"]
    for template_id, slot in TEMPLATE_TO_RULESET_SLOT.items():
        size, ratio = _ts_template_slot(template_id)
        assert size == style["target_pixel_sizes"][slot]
        assert ratio == style["aspect_ratios"][slot]


def test_field_limits_match_the_ruleset_schema_limits() -> None:
    assert _ts_limits() == _ruleset()["schema_limits"]
