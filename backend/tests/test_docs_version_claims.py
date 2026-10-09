"""Guard: every document that claims a current version or release date is right (#982).

The same shape as the plugin hand-lists in #867 - a value a human maintains
in prose, with nothing checking it against what it describes. When this was
filed, three of eight claims were wrong at the same moment, including
``docs/ROADMAP.md`` saying ``main`` held v0.57.0 while it held v0.60.0, and
``docs/backlog.md`` carrying v0.59.0's date beside v0.60.0's number.

The source is in-repo, so this needs no network: ``docs/CHANGELOG.md``'s
newest released heading gives the version AND its date, and
``backend/pyproject.toml`` must agree with it - which also catches a release
bump that stopped half way.

Adding a document that names the current version means adding a ``Claim``
here. A version named as HISTORY ("shipped in v0.42.0", a CHANGELOG entry,
an archived roadmap) is not a claim of currency and is not registered.
"""

from __future__ import annotations

import re
import tomllib
from dataclasses import dataclass
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]

#: ``## [0.60.0] - 2026-08-15``; ``[Unreleased]`` is deliberately not matched.
_RELEASE_HEADING = re.compile(
    r"^## \[(?P<version>\d+\.\d+\.\d+)\] - (?P<date>\d{4}-\d{2}-\d{2})\s*$"
)


def latest_release() -> tuple[str, str]:
    """``(version, date)`` of the newest released CHANGELOG entry."""
    text = (REPO_ROOT / "docs" / "CHANGELOG.md").read_text(encoding="utf-8")
    for line in text.splitlines():
        match = _RELEASE_HEADING.match(line)
        if match:
            return match["version"], match["date"]
    raise AssertionError("docs/CHANGELOG.md has no released '## [X.Y.Z] - DATE' heading")


def packaged_version() -> str:
    """The canonical version: the one hand-edited at release time."""
    data = tomllib.loads((REPO_ROOT / "backend" / "pyproject.toml").read_text(encoding="utf-8"))
    return data["tool"]["poetry"]["version"]


@dataclass(frozen=True)
class Claim:
    """One place that states the current version or its release date."""

    path: str
    pattern: str
    #: Which capture groups to compare: "version", "date", or both.
    expects: tuple[str, ...]
    why: str


CLAIMS = (
    Claim(
        "README.md",
        r"Current version: \*\*v(?P<version>\d+\.\d+\.\d+)\*\*",
        ("version",),
        "the first line a reader sees",
    ),
    Claim(
        "README-de.md",
        r"Aktuelle Version: \*\*v(?P<version>\d+\.\d+\.\d+)\*\*",
        ("version",),
        "the German README's header line",
    ),
    Claim(
        "CLAUDE.md",
        r"\*\*Version:\*\* (?P<version>\d+\.\d+\.\d+)",
        ("version",),
        "loaded on every prompt, so a stale value misleads every session",
    ),
    Claim(
        "docs/ROADMAP.md",
        r"Latest release: v(?P<version>\d+\.\d+\.\d+) \((?P<date>\d{4}-\d{2}-\d{2})\)",
        ("version", "date"),
        "the roadmap's own statement of where the project is",
    ),
    Claim(
        "docs/ROADMAP.md",
        r"`main` holds v(?P<version>\d+\.\d+\.\d+)",
        ("version",),
        "gitflow state; was wrong by three releases when #982 was filed",
    ),
    Claim(
        "docs/backlog.md",
        r"Latest release: v(?P<version>\d+\.\d+\.\d+) \((?P<date>\d{4}-\d{2}-\d{2})\)",
        ("version", "date"),
        "carried v0.59.0's date beside v0.60.0's number when #982 was filed",
    ),
)


def _match(claim: Claim) -> re.Match[str]:
    text = (REPO_ROOT / claim.path).read_text(encoding="utf-8")
    found = re.search(claim.pattern, text)
    assert found, (
        f"{claim.path}: no match for {claim.pattern!r}. The claim exists to be checked - "
        f"if the wording changed, update the pattern; if the claim is gone, drop the Claim "
        f"entry. It is there because: {claim.why}."
    )
    return found


def test_the_changelog_and_the_package_agree_on_the_version() -> None:
    """A release bump that stopped half way leaves these two disagreeing."""
    version, _ = latest_release()
    assert packaged_version() == version, (
        "backend/pyproject.toml and the newest docs/CHANGELOG.md release heading "
        "name different versions. One of them was not updated."
    )


@pytest.mark.parametrize("claim", CLAIMS, ids=lambda c: f"{c.path}:{c.expects}")
def test_every_claimed_version_and_date_is_the_current_one(claim: Claim) -> None:
    version, date = latest_release()
    expected = {"version": version, "date": date}
    found = _match(claim)
    for field in claim.expects:
        assert found[field] == expected[field], (
            f"{claim.path} claims {field} {found[field]!r}, "
            f"the current release is {expected[field]!r} ({claim.why})."
        )


def test_no_document_claims_currency_with_an_unregistered_version() -> None:
    """A "current/latest/aktuell" line naming a version that is not the
    current one, in a file this module does not already cover."""
    version, _ = latest_release()
    registered = {claim.path for claim in CLAIMS}
    pattern = re.compile(
        r"^.*\b(?:current|latest|aktuell\w*)\b.*?v?(\d+\.\d+\.\d+).*$",
        re.IGNORECASE | re.MULTILINE,
    )
    offenders: list[str] = []
    for path in ("docs/CONCEPT.md", "docs/API.md", "CONTRIBUTING.md"):
        file = REPO_ROOT / path
        if path in registered or not file.is_file():
            continue
        for line in pattern.findall(file.read_text(encoding="utf-8")):
            if line != version:
                offenders.append(f"{path}: claims v{line}, current is v{version}")
    assert not offenders, (
        "A document states a current version that is not the current one:\n  "
        + "\n  ".join(offenders)
        + "\nEither register it in CLAIMS so it is kept right, or dereference it "
        "(name the source instead of the number) per the single-source-of-truth rule."
    )
