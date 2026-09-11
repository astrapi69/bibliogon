"""Pure-logic tests for the portfolio board (#782).

Everything here runs without a database: link parsing, format/status
normalisation, gap detection and CSV row shaping. The DB-backed
endpoint behaviour is covered by ``backend/tests/test_promotion_portfolio.py``.
"""

from __future__ import annotations

import pytest
from bibliogon_promotion.portfolio import (
    FORMATS,
    FormatEntry,
    asin_from_url,
    gaps_of,
    normalize_format,
    normalize_status,
    row_from_csv_mapping,
    status_for_link,
)


class TestAsinFromUrl:
    def test_reads_the_asin_from_a_dp_link(self) -> None:
        assert asin_from_url("https://www.amazon.com/dp/B0DWND11Y8") == "B0DWND11Y8"

    def test_reads_the_asin_from_a_gp_product_link(self) -> None:
        assert asin_from_url("https://www.amazon.de/gp/product/B0GSG1CNWF") == "B0GSG1CNWF"

    def test_ignores_query_and_trailing_path(self) -> None:
        url = "https://www.amazon.com/dp/B0DWSW5PB7/ref=tmm_kin?_encoding=UTF8"
        assert asin_from_url(url) == "B0DWSW5PB7"

    def test_returns_none_for_an_empty_or_unparseable_link(self) -> None:
        assert asin_from_url("") is None
        assert asin_from_url(None) is None
        assert asin_from_url("https://mybook.to/ai-for-everyone") is None


class TestStatusForLink:
    def test_a_link_means_live(self) -> None:
        assert status_for_link("https://www.amazon.com/dp/B0DWND11Y8") == "live"

    def test_no_link_means_missing(self) -> None:
        assert status_for_link("") == "missing"
        assert status_for_link(None) == "missing"
        assert status_for_link("   ") == "missing"


class TestNormalisation:
    def test_format_is_case_insensitive(self) -> None:
        assert normalize_format("eBook") == "ebook"
        assert normalize_format("HARDCOVER") == "hardcover"

    def test_unknown_format_is_rejected(self) -> None:
        with pytest.raises(ValueError, match="audiobook"):
            normalize_format("audiobook")

    def test_status_is_case_insensitive(self) -> None:
        assert normalize_status("Live") == "live"

    def test_unknown_status_is_rejected(self) -> None:
        with pytest.raises(ValueError, match="published"):
            normalize_status("published")


class TestGaps:
    def _entries(self, **statuses: str) -> list[FormatEntry]:
        return [
            FormatEntry(
                book_format=book_format,
                status=statuses.get(book_format, "live"),
                store_url=None,
                asin=None,
            )
            for book_format in FORMATS
        ]

    def test_a_fully_published_book_has_no_gaps(self) -> None:
        assert gaps_of(self._entries()) == []

    def test_a_missing_format_is_a_gap(self) -> None:
        assert gaps_of(self._entries(hardcover="missing")) == ["hardcover"]

    def test_a_draft_format_is_a_gap_too(self) -> None:
        """A draft is not on sale, so it belongs on the same worklist."""
        assert gaps_of(self._entries(paperback="draft")) == ["paperback"]

    def test_gaps_keep_the_canonical_format_order(self) -> None:
        entries = self._entries(ebook="missing", hardcover="missing")
        assert gaps_of(entries) == ["ebook", "hardcover"]


class TestCsvRow:
    MAPPING = {
        "Author": "Asterios Raptis",
        "Language": "EN",
        "Title": "AI for Everyone",
        "Status": "Published",
        "GitHub_URL": "https://github.com/astrapi69/ai-for-everyone",
        "GitHub_Branch": "main",
        "eBook": "https://www.amazon.com/dp/B0DWND11Y8",
        "Paperback": "https://www.amazon.com/dp/B0DWSW5PB7",
        "Hardcover": "",
        "Universal_Link": "https://mybook.to/ai-for-everyone",
    }

    def test_maps_every_column(self) -> None:
        row = row_from_csv_mapping(self.MAPPING)
        assert row.title == "AI for Everyone"
        assert row.language == "EN"
        assert row.github_branch == "main"
        assert row.universal_link == "https://mybook.to/ai-for-everyone"

    def test_links_are_keyed_by_canonical_format(self) -> None:
        row = row_from_csv_mapping(self.MAPPING)
        assert set(row.links) == set(FORMATS)
        assert row.links["ebook"].endswith("B0DWND11Y8")
        assert row.links["hardcover"] is None

    def test_whitespace_is_stripped(self) -> None:
        row = row_from_csv_mapping({**self.MAPPING, "Title": "  Spaced  ", "GitHub_Branch": " main "})
        assert row.title == "Spaced"
        assert row.github_branch == "main"

    def test_a_missing_branch_falls_back_to_none_not_an_empty_string(self) -> None:
        row = row_from_csv_mapping({**self.MAPPING, "GitHub_Branch": ""})
        assert row.github_branch is None
