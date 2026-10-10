"""#739: the recorded Python cover verdicts the browser port is checked against.

``CoverValidation.tsx`` has validated client-side since the KDP wizard
shipped, but with its own inline copy of the thresholds and no tie to
``bibliogon_kdp.cover_validator``. Nothing noticed that the component's
``else if`` could only ever report ONE of "too small" / "too large"
while the Python validator reports both, and nothing would notice a
future rule the Python side grows.

So this file records what ``validate_cover`` ACTUALLY does for a set of
real images, and ``frontend/src/lib/kdp/coverValidation.parity.test.ts``
asserts the port reproduces it. Each half pins its own end:

- this file regenerates the verdicts from the live validator and fails
  when they differ from the record, so a rule change in
  ``bibliogon_kdp`` cannot pass silently,
- the Vitest fails when the port stops reproducing the record.

The checks a browser cannot run from a stored asset - DPI, PIL colour
mode, the ICC profile - are listed in ``BROWSER_BLIND`` and dropped from
the record. That list is an allowlist, not a filter: a finding matching
neither it nor ``MIRRORED`` fails the test by name, so a new mirrorable
rule surfaces here instead of silently living only on the desktop.

Regenerate with ``KDP_COVER_PARITY_WRITE=1 poetry run pytest
tests/test_cover_validator_parity.py`` after a deliberate rule change,
and read the diff before committing it: every line of it is a behaviour
change the port has to follow.
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path
from typing import Any

import pytest
from bibliogon_kdp.cover_validator import KDP_COVER_REQUIREMENTS, validate_cover

REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURE_PATH = (
    REPO_ROOT / "frontend" / "src" / "lib" / "kdp" / "coverValidation.parity.json"
)

#: Prose fragment -> finding code, for the checks the browser can run from
#: an already-stored asset: the filename extension, the byte length, the
#: decoded pixel dimensions, and the ratio between them.
MIRRORED: tuple[tuple[str, str], ...] = (
    ("Unsupported format", "format_unsupported"),
    ("is too small", "dimensions_too_small"),
    ("is too large", "dimensions_too_large"),
    ("Aspect ratio", "aspect_ratio_outside_range"),
    ("exceeds maximum", "file_size_exceeded"),
)

#: Findings deliberately absent from the port. The first three need
#: metadata that neither ``createImageBitmap`` nor ``<img>`` exposes; the
#: rest are states the port cannot be in, because it validates a probe
#: read from an asset rather than a path it has to open itself (the
#: component's ``onError`` branch covers an undecodable image).
BROWSER_BLIND: tuple[str, ...] = (
    "DPI ",
    "Color mode",
    "ICC color profile",
    "Color profile",
    "Pillow not installed",
    "File not found",
    "Failed to read image",
)

MEBIBYTE = 1024 * 1024

#: The record is read by TypeScript, so its keys are the port's names.
REQUIREMENT_KEYS: dict[str, str] = {
    "min_width": "minWidth",
    "min_height": "minHeight",
    "max_width": "maxWidth",
    "max_height": "maxHeight",
    "aspect_ratio_min": "aspectRatioMin",
    "aspect_ratio_max": "aspectRatioMax",
    "max_file_size_mb": "maxFileSizeMb",
    "allowed_formats": "allowedFormats",
}


def round2(value: float) -> float:
    """Round to two decimals, identically in Python and JS.

    ``round()`` is half-to-even, so a value landing on a tie would make
    the two sides disagree over a digit that carries no meaning.
    ``floor(x * 100 + 0.5) / 100`` is the same sequence of IEEE-754
    operations as JS ``Math.round(x * 100) / 100`` for the non-negative
    values here, so both produce the same double. That agreement is the
    guarantee, not decimal half-up: 1.005 is not representable and both
    sides land on 1.0.
    """
    return math.floor(value * 100 + 0.5) / 100


#: Each case writes one real image and runs the validator over it.
#:
#: ``requirements`` lowers a threshold for cases whose natural fixture
#: would be absurd to generate (a >50 MB image), which also pins that
#: both sides read their limits from the requirements rather than from a
#: hardcoded constant. ``bytes`` pads the written file to an exact
#: length, because how many bytes a PNG encoder spends on a blank image
#: is a property of the installed Pillow, not of this fixture - a bump
#: would otherwise rewrite the record. A case without ``bytes`` records
#: no ``fileSizeBytes``, which pins the other half of the rule: with the
#: byte length unknown (the online path, where the asset is behind a
#: URL) the size check abstains rather than guessing.
CASES: list[dict[str, Any]] = [
    {
        "name": "pass-minimum",
        "filename": "cover.jpg",
        "size": [625, 1000],
        "mode": "RGB",
    },
    {
        "name": "pass-typical",
        "filename": "cover.png",
        "size": [1600, 2560],
        "mode": "RGB",
    },
    {
        "name": "too-small",
        "filename": "cover.jpg",
        "size": [400, 640],
        "mode": "RGB",
    },
    {
        "name": "one-pixel-under-minimum-width",
        "filename": "cover.jpg",
        "size": [624, 1000],
        "mode": "RGB",
    },
    {
        "name": "one-pixel-under-minimum-height",
        "filename": "cover.jpg",
        "size": [625, 999],
        "mode": "RGB",
    },
    {
        "name": "too-small-and-too-large",
        "filename": "cover.png",
        "size": [400, 10001],
        "mode": "RGB",
    },
    {
        "name": "wrong-format",
        "filename": "cover.bmp",
        "size": [1600, 2560],
        "mode": "RGB",
    },
    {
        "name": "wrong-format-and-too-small",
        "filename": "cover.gif",
        "size": [300, 480],
        "mode": "P",
    },
    {
        "name": "no-extension",
        "filename": "cover",
        "format": "PNG",
        "size": [1600, 2560],
        "mode": "RGB",
    },
    {
        "name": "ratio-too-flat",
        "filename": "cover.jpg",
        "size": [2000, 2800],
        "mode": "RGB",
    },
    {
        "name": "ratio-too-tall",
        "filename": "cover.jpg",
        "size": [1000, 1900],
        "mode": "RGB",
    },
    {
        "name": "ratio-exactly-at-lower-bound",
        "filename": "cover.jpg",
        "size": [1000, 1500],
        "mode": "RGB",
    },
    {
        "name": "ratio-exactly-at-upper-bound",
        "filename": "cover.jpg",
        "size": [1000, 1800],
        "mode": "RGB",
    },
    {
        "name": "file-size-exceeded",
        "filename": "cover.png",
        "size": [1600, 2560],
        "mode": "RGB",
        "bytes": 1572864,
        "requirements": {"max_file_size_mb": 1},
    },
    {
        "name": "file-size-exactly-at-limit",
        "filename": "cover.png",
        "size": [625, 1000],
        "mode": "RGB",
        "bytes": MEBIBYTE,
        "requirements": {"max_file_size_mb": 1},
    },
]


def _write_image(case: dict[str, Any], directory: Path) -> Path:
    from PIL import Image

    width, height = case["size"]
    path = directory / case["filename"]
    image = Image.new(case["mode"], (width, height))
    image.save(path, format=case.get("format"))

    target = case.get("bytes")
    if target is not None:
        written = path.stat().st_size
        assert written <= target, (
            f"{case['name']}: the encoder wrote {written} bytes, more than the "
            f"{target} this case wants to test - pick a larger target"
        )
        with path.open("ab") as handle:
            handle.write(b"\0" * (target - written))
    return path


def _classify(message: str, case_name: str) -> str | None:
    for fragment, code in MIRRORED:
        if fragment in message:
            return code
    for fragment in BROWSER_BLIND:
        if fragment in message:
            return None
    pytest.fail(
        f"{case_name}: validate_cover produced a finding this parity record "
        f"does not classify: {message!r}. Either the browser port needs the "
        f"same rule (add it to MIRRORED and to lib/kdp/coverRequirements.ts), "
        f"or the rule is unreadable in a browser (add it to BROWSER_BLIND "
        f"with the reason)."
    )


def _params(code: str, path: Path, width: int, height: int) -> dict[str, Any]:
    """The substance of a finding, derived from what the browser also reads.

    Deliberately not parsed out of the prose: the message is rendered
    per-language on the frontend, so only the numbers behind it can be
    compared across the two runtimes.
    """
    if code == "format_unsupported":
        return {"format": path.suffix.lstrip(".").lower()}
    if code in ("dimensions_too_small", "dimensions_too_large"):
        return {"width": width, "height": height}
    if code == "aspect_ratio_outside_range":
        return {"ratio": round2(height / width)}
    if code == "file_size_exceeded":
        return {"fileSizeMb": round2(path.stat().st_size / MEBIBYTE)}
    raise AssertionError(f"no params defined for {code}")


def _record_case(case: dict[str, Any], directory: Path) -> dict[str, Any]:
    path = _write_image(case, directory)
    requirements = {**KDP_COVER_REQUIREMENTS, **case.get("requirements", {})}
    result = validate_cover(path, requirements)

    width = int(result.info["width"])
    height = int(result.info["height"])
    assert [width, height] == case["size"], (
        f"{case['name']}: the written image is {width}x{height}, not "
        f"{case['size']} - the fixture does not test what it says it does"
    )

    findings: list[dict[str, Any]] = []
    for severity, messages in (("error", result.errors), ("warning", result.warnings)):
        for message in messages:
            code = _classify(message, case["name"])
            if code is None:
                continue
            findings.append(
                {
                    "severity": severity,
                    "code": code,
                    "params": _params(code, path, width, height),
                }
            )

    probe: dict[str, Any] = {
        "width": width,
        "height": height,
        "format": path.suffix.lstrip(".").lower(),
    }
    if "bytes" in case:
        probe["fileSizeBytes"] = path.stat().st_size
    recorded: dict[str, Any] = {
        "name": case["name"],
        "filename": case["filename"],
        "probe": probe,
        "findings": findings,
    }
    if "requirements" in case:
        recorded["requirements"] = {
            REQUIREMENT_KEYS[key]: value for key, value in case["requirements"].items()
        }
    return recorded


def _compute_record(directory: Path) -> dict[str, Any]:
    return {
        "_comment": (
            "Generated by plugins/bibliogon-plugin-kdp/tests/"
            "test_cover_validator_parity.py. Do not hand-edit: regenerate "
            "with KDP_COVER_PARITY_WRITE=1 and read the diff."
        ),
        "requirements": {
            camel: list(value) if isinstance(value, list) else value
            for key, camel in REQUIREMENT_KEYS.items()
            for value in [KDP_COVER_REQUIREMENTS[key]]
        },
        "cases": [_record_case(case, directory / case["name"]) for case in CASES],
    }


def test_recorded_verdicts_match_the_live_validator(tmp_path: Path) -> None:
    for case in CASES:
        (tmp_path / case["name"]).mkdir()
    record = _compute_record(tmp_path)

    if os.environ.get("KDP_COVER_PARITY_WRITE"):
        FIXTURE_PATH.write_text(
            json.dumps(record, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        pytest.skip("record rewritten; re-run without KDP_COVER_PARITY_WRITE")

    assert FIXTURE_PATH.exists(), (
        f"{FIXTURE_PATH} is missing. Generate it with "
        f"KDP_COVER_PARITY_WRITE=1 poetry run pytest "
        f"tests/test_cover_validator_parity.py"
    )
    committed = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    assert committed == record, (
        "validate_cover no longer produces the recorded verdicts. If the "
        "rule change is intended, regenerate the record and carry the same "
        "change into frontend/src/lib/kdp/coverRequirements.ts."
    )


def test_every_mirrored_code_is_exercised(tmp_path: Path) -> None:
    """A code no case reaches is a rule the parity record does not cover."""
    for case in CASES:
        (tmp_path / case["name"]).mkdir()
    record = _compute_record(tmp_path)
    seen = {finding["code"] for case in record["cases"] for finding in case["findings"]}
    missing = {code for _, code in MIRRORED} - seen
    assert not missing, (
        f"no case in CASES produces {sorted(missing)}, so the port could "
        f"drop those rules without the parity test noticing"
    )


def test_a_pass_case_reports_nothing(tmp_path: Path) -> None:
    """The happy path has to be reachable, or every case is a failure case."""
    for case in CASES:
        (tmp_path / case["name"]).mkdir()
    record = _compute_record(tmp_path)
    passing = [case for case in record["cases"] if not case["findings"]]
    assert passing, "no case validates cleanly"
