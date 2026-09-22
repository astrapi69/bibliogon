"""Drift guard: A+ module templates in the frontend vs the backend ruleset (#891).

The editor's template catalog (`frontend/src/lib/utils/aplus/aplusDocument.ts`)
carries the image size, aspect ratio and field limits the AI generator reads
from `bibliogon_aplus/rules/ruleset.yaml`. The two must agree, or a manual
module asks for a different image than the generated one.
"""

from __future__ import annotations

import re
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[2]
TS_FILE = REPO / "frontend" / "src" / "lib" / "utils" / "aplus" / "aplusDocument.ts"
RULESET = REPO / "plugins" / "bibliogon-plugin-aplus" / "bibliogon_aplus" / "rules" / "ruleset.yaml"

TEMPLATE_TO_RULESET_SLOT = {
    "image_header_text": "module_header",
    "three_images_text": "module_three_images",
}


def _ts_templates() -> dict[str, tuple[str, str]]:
    pattern = re.compile(
        r'\{\s*id:\s*"(?P<id>[a-z0-9_]+)",\s*slotCount:\s*\d+,\s*'
        r'size:\s*"(?P<size>[^"]+)",\s*aspectRatio:\s*"(?P<ratio>[^"]+)"\s*\}'
    )
    source = TS_FILE.read_text(encoding="utf-8")
    return {m["id"]: (m["size"], m["ratio"]) for m in pattern.finditer(source)}


def _ts_limits() -> dict[str, int]:
    source = TS_FILE.read_text(encoding="utf-8")
    block = re.search(r"APLUS_FIELD_LIMITS = \{(?P<body>[^}]*)\}", source)
    assert block, "APLUS_FIELD_LIMITS not found"
    return {k: int(v) for k, v in re.findall(r"(\w+):\s*(\d+)", block["body"])}


def _ruleset() -> dict:
    return yaml.safe_load(RULESET.read_text(encoding="utf-8"))


def test_every_ruleset_slot_has_a_matching_frontend_template() -> None:
    templates = _ts_templates()
    style = _ruleset()["image_style"]
    for template_id, slot in TEMPLATE_TO_RULESET_SLOT.items():
        assert template_id in templates, f"template {template_id} missing in {TS_FILE.name}"
        size, ratio = templates[template_id]
        assert size == style["target_pixel_sizes"][slot]
        assert ratio == style["aspect_ratios"][slot]


def test_field_limits_match_the_ruleset_schema_limits() -> None:
    assert _ts_limits() == _ruleset()["schema_limits"]
