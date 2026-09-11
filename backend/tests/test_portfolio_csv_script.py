"""Tests for the portfolio CSV seed importer (#782).

The script is transport only: parse the author's ``books-list.csv``,
hand the rows to the API, print the report. Matching and idempotency
live in the plugin service, where a database can be involved.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPT = REPO_ROOT / "scripts" / "import_portfolio_csv.py"

HEADER = (
    "Author,Language,Title,Status,GitHub_URL,GitHub_Branch,"
    "eBook,Paperback,Hardcover,Universal_Link\n"
)
ROW = (
    "Asterios Raptis,EN,AI for Everyone,Published,"
    "https://github.com/astrapi69/ai-for-everyone,main,"
    "https://www.amazon.com/dp/B0DWND11Y8,https://www.amazon.com/dp/B0DWSW5PB7,,"
    "https://mybook.to/ai-for-everyone\n"
)


def _load_module():
    spec = importlib.util.spec_from_file_location("import_portfolio_csv", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


importer = _load_module()


@pytest.fixture
def csv_file(tmp_path: Path) -> Path:
    path = tmp_path / "books-list.csv"
    path.write_text(HEADER + ROW, encoding="utf-8")
    return path


class TestLoadRows:
    def test_parses_a_row_into_the_api_payload_shape(self, csv_file: Path) -> None:
        rows = importer.load_rows(csv_file)
        assert len(rows) == 1
        row = rows[0]
        assert row["title"] == "AI for Everyone"
        assert row["github_branch"] == "main"
        assert row["links"]["ebook"].endswith("B0DWND11Y8")
        assert row["links"]["hardcover"] is None

    def test_a_missing_column_is_a_clear_error_not_a_key_error(self, tmp_path: Path) -> None:
        path = tmp_path / "broken.csv"
        path.write_text("Title,Language\nOnly,EN\n", encoding="utf-8")
        with pytest.raises(importer.CatalogError, match="GitHub_URL"):
            importer.load_rows(path)

    def test_rows_without_a_title_are_skipped_not_sent(self, tmp_path: Path) -> None:
        path = tmp_path / "blank.csv"
        path.write_text(HEADER + ROW + ",,,,,,,,,\n", encoding="utf-8")
        assert len(importer.load_rows(path)) == 1

    def test_an_empty_file_is_an_error(self, tmp_path: Path) -> None:
        path = tmp_path / "empty.csv"
        path.write_text("", encoding="utf-8")
        with pytest.raises(importer.CatalogError):
            importer.load_rows(path)


class TestReportAndExitCode:
    def test_report_names_every_unmatched_title(self) -> None:
        report = {
            "dry_run": True,
            "total_rows": 3,
            "matched": 2,
            "changed": 1,
            "unchanged": 1,
            "unmatched": ["Ghost Title"],
            "matched_by_repo": 2,
            "matched_by_title": 0,
        }
        rendered = importer.render_report(report)
        assert "Ghost Title" in rendered
        assert "dry run" in rendered.lower()

    def test_unmatched_rows_make_the_run_fail_so_csv_drift_is_visible(self) -> None:
        assert importer.exit_code({"unmatched": ["Ghost Title"]}) == 1

    def test_a_fully_matched_run_succeeds(self) -> None:
        assert importer.exit_code({"unmatched": []}) == 0


class TestMain:
    def test_dry_run_flag_reaches_the_request_body(self, csv_file: Path, capsys) -> None:
        sent: list[dict] = []

        def poster(url: str, payload: dict) -> dict:
            sent.append(payload)
            return {
                "dry_run": payload["dry_run"],
                "total_rows": 1,
                "matched": 1,
                "changed": 0,
                "unchanged": 1,
                "unmatched": [],
                "matched_by_repo": 1,
                "matched_by_title": 0,
            }

        exit_code = importer.main(["--csv", str(csv_file), "--dry-run"], poster=poster)
        assert exit_code == 0
        assert sent[0]["dry_run"] is True
        assert len(sent[0]["rows"]) == 1

    def test_without_the_flag_the_run_applies(self, csv_file: Path) -> None:
        sent: list[dict] = []

        def poster(url: str, payload: dict) -> dict:
            sent.append(payload)
            return {"dry_run": False, "total_rows": 1, "matched": 1, "changed": 1,
                    "unchanged": 0, "unmatched": [], "matched_by_repo": 1,
                    "matched_by_title": 0}

        importer.main(["--csv", str(csv_file)], poster=poster)
        assert sent[0]["dry_run"] is False
