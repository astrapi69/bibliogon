"""Finance fixtures stay synthetic (#1129).

Bibliogon is public; Aster's royalties are not. A real download dropped
into the fixture folder carries real ASINs and ISBNs, so the guard
pins every identifier to a range no real product uses.
"""

import re
from pathlib import Path

FIXTURES = Path(__file__).parent / "fixtures" / "finance"
SYNTHETIC_ASIN = re.compile(r"^B0000000\d\d$")
SYNTHETIC_ISBN = re.compile(r"^97800000000\d\d$")
ASIN_SHAPE = re.compile(r"\bB0[A-Z0-9]{8}\b")
ISBN_SHAPE = re.compile(r"\b97[89]\d{10}\b")


def test_the_fixture_folder_is_not_empty() -> None:
    assert sorted(FIXTURES.glob("*.csv")), FIXTURES


def test_every_identifier_in_a_fixture_is_synthetic() -> None:
    offenders = []
    for path in FIXTURES.glob("*.csv"):
        text = path.read_text(encoding="utf-8")
        offenders += [
            (path.name, a) for a in ASIN_SHAPE.findall(text) if not SYNTHETIC_ASIN.match(a)
        ]
        offenders += [
            (path.name, i) for i in ISBN_SHAPE.findall(text) if not SYNTHETIC_ISBN.match(i)
        ]
    assert offenders == []


def test_every_title_in_a_fixture_is_an_example_title() -> None:
    for path in FIXTURES.glob("*.csv"):
        header, *rows = path.read_text(encoding="utf-8").splitlines()
        if "Title" not in header.split(","):
            continue
        for line in rows:
            assert "Example Title" in line, (path.name, line)
