"""Report downloads and finance exports cannot be committed (#1129).

Bibliogon is public, the author's royalties are not. The guard asks git
itself, so a pattern that is removed or narrowed turns this red.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
SENSITIVE = [
    "KDP_Prior_Month_Royalties-2026-01-01.xlsx",
    "KDP_Orders-2026-01.csv",
    "KENP_Read-2026-01.xlsx",
    "Royalties-January.csv",
    "Sponsored_Products_Advertised_product_report.xlsx",
    "Sponsored_Products_Advertised_product_report.csv",
    "bibliogon-finance-export-2026-10-27.json",
    "backend/KDP_Prior_Month_Royalties.csv",
]
FIXTURE = "plugins/bibliogon-plugin-kdp/tests/fixtures/finance/royalty-ebook-2026-01.csv"

pytestmark = pytest.mark.skipif(shutil.which("git") is None, reason="git not installed")


def _ignored(path: str) -> bool:
    result = subprocess.run(
        ["git", "check-ignore", "--no-index", "-q", path],
        cwd=REPO,
        check=False,
    )
    return result.returncode == 0


@pytest.mark.parametrize("path", SENSITIVE)
def test_a_report_download_is_ignored(path: str) -> None:
    assert _ignored(path), f"{path} could be committed - check the #1129 block in .gitignore"


def test_the_synthetic_fixtures_stay_committable() -> None:
    assert not _ignored(FIXTURE)
