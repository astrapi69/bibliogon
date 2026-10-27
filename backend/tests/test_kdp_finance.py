"""End-to-end tests for the KDP finance import (#1129).

Real endpoint, real DB, synthetic fixtures from the plugin's test
folder. Module-scoped client for the usual reason: the FastAPI
singleton accumulates plugin-route state across per-test lifespans.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models import (
    FinanceAdLine,
    FinanceFxRate,
    FinanceImport,
    FinanceKenpRate,
    FinanceRevenueLine,
    FinanceTitleCost,
)

FIXTURES = (
    Path(__file__).resolve().parents[2]
    / "plugins"
    / "bibliogon-plugin-kdp"
    / "tests"
    / "fixtures"
    / "finance"
)
FINANCE_MODELS = (
    FinanceTitleCost,
    FinanceRevenueLine,
    FinanceAdLine,
    FinanceImport,
    FinanceKenpRate,
    FinanceFxRate,
)


@pytest.fixture(scope="module")
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def _clean_finance_tables():
    session = SessionLocal()
    try:
        for model in FINANCE_MODELS:
            session.query(model).delete()
        session.commit()
        yield
    finally:
        session.close()


@pytest.fixture
def book(client: TestClient) -> dict:
    created = client.post(
        "/api/books", json={"title": "Alpha", "author": "Pen A", "language": "de"}
    )
    assert created.status_code in (200, 201), created.text
    book_id = created.json()["id"]
    patched = client.patch(
        f"/api/books/{book_id}",
        json={
            "asin_ebook": "B000000001",
            "asin_paperback": "B000000011",
            "isbn_paperback": "978-0-00-000000-2",
        },
    )
    assert patched.status_code == 200, patched.text
    yield patched.json()
    client.delete(f"/api/books/{book_id}")
    client.delete(f"/api/books/trash/{book_id}")


def _import(client: TestClient, name: str, kind: str, **form: str):
    raw = (FIXTURES / name).read_bytes()
    return client.post(
        "/api/kdp/finance/imports",
        data={"kind": kind, **form},
        files={"file": (name, raw, "text/csv")},
    )


def _report(client: TestClient, group_by: str = "title", **params: str) -> dict:
    response = client.get("/api/kdp/finance/report", params={"group_by": group_by, **params})
    assert response.status_code == 200, response.text
    return response.json()


def _group(report: dict, **key: str) -> dict:
    matches = [g for g in report["groups"] if all(g["key"].get(k) == v for k, v in key.items())]
    assert len(matches) == 1, report["groups"]
    return matches[0]


def _count(model) -> int:
    session = SessionLocal()
    try:
        return session.query(model).count()
    finally:
        session.close()


class TestImport:
    def test_the_same_report_twice_leaves_the_state_unchanged(
        self, client: TestClient, book: dict
    ) -> None:
        first = _import(client, "royalty-ebook-2026-01.csv", "kdp_royalty", book_format="ebook")
        assert first.status_code == 200, first.text
        assert first.json()["status"] == "imported"
        before = _report(client)

        second = _import(client, "royalty-ebook-2026-01.csv", "kdp_royalty", book_format="ebook")
        assert second.json()["status"] == "unchanged"
        assert _count(FinanceRevenueLine) == 3
        assert _count(FinanceImport) == 1
        assert _report(client) == before

    def test_an_unknown_column_is_an_error_and_writes_nothing(self, client: TestClient) -> None:
        raw = (FIXTURES / "royalty-ebook-2026-01.csv").read_bytes()
        raw = raw.replace(b"Currency\n", b"Currency,Promo Code\n", 1)
        response = client.post(
            "/api/kdp/finance/imports",
            data={"kind": "kdp_royalty", "book_format": "ebook"},
            files={"file": ("r.csv", raw, "text/csv")},
        )
        assert response.status_code == 400
        assert "Promo Code" in response.json()["detail"]
        assert _count(FinanceRevenueLine) == 0
        assert _count(FinanceImport) == 0

    def test_dry_run_reports_but_writes_nothing(self, client: TestClient, book: dict) -> None:
        response = _import(
            client, "royalty-ebook-2026-01.csv", "kdp_royalty", book_format="ebook", dry_run="true"
        )
        assert response.json()["status"] == "dry_run"
        assert response.json()["rows"] == 3
        assert _count(FinanceRevenueLine) == 0

    def test_a_later_download_with_a_refund_corrects_the_month(
        self, client: TestClient, book: dict
    ) -> None:
        _import(client, "royalty-ebook-2026-01.csv", "kdp_royalty", book_format="ebook")
        corrected = _import(
            client, "royalty-ebook-2026-01-with-refund.csv", "kdp_royalty", book_format="ebook"
        )
        assert corrected.json()["status"] == "imported"
        assert corrected.json()["replaced"] == 3
        client.put(
            "/api/kdp/finance/fx-rates/2026-01/USD", json={"rate": "0.92", "base_currency": "EUR"}
        )
        group = _group(
            _report(client, "title,marketplace"), title=book["id"], marketplace="Amazon.de"
        )
        assert group["units_refunded"] == 2
        assert Decimal(group["net_revenue"]) == Decimal("26.40")
        assert _count(FinanceRevenueLine) == 3

    def test_rows_without_a_matching_book_stay_visible(self, client: TestClient) -> None:
        response = _import(client, "royalty-ebook-2026-01.csv", "kdp_royalty", book_format="ebook")
        assert "B000000002" in response.json()["unmatched"]
        report = _report(client)
        assert Decimal(_group(report, title="unassigned:B000000002")["net_revenue"]) == Decimal(
            "2.10"
        )

    def test_paperback_rows_match_by_asin_or_isbn(self, client: TestClient, book: dict) -> None:
        response = _import(
            client, "royalty-paperback-2026-01.csv", "kdp_royalty", book_format="paperback"
        )
        assert response.json()["unmatched"] == []
        group = _group(_report(client, "title,format"), title=book["id"], format="paperback")
        assert Decimal(group["net_revenue"]) == Decimal("13.98")


class TestKenpAndCurrency:
    def test_kenp_is_valued_month_by_month(self, client: TestClient, book: dict) -> None:
        _import(client, "kenp-2026-01-02.csv", "kdp_kenp")
        for month, rate in (("2026-01", "0.0040"), ("2026-02", "0.0050")):
            response = client.put(
                f"/api/kdp/finance/kenp-rates/{month}/Amazon.de",
                json={"rate": rate, "currency": "EUR"},
            )
            assert response.status_code == 200, response.text
        group = _group(_report(client), title=book["id"])
        assert Decimal(group["kenp_royalty"]) == Decimal("14")
        assert group["kenp_pages"] == 3000

    def test_two_currencies_are_summed_with_the_stored_rate(
        self, client: TestClient, book: dict
    ) -> None:
        _import(client, "royalty-ebook-2026-01.csv", "kdp_royalty", book_format="ebook")
        client.put(
            "/api/kdp/finance/fx-rates/2026-01/USD", json={"rate": "0.92", "base_currency": "EUR"}
        )
        group = _group(_report(client), title=book["id"])
        assert Decimal(group["net_revenue"]) == Decimal("47.72")
        assert group["fx_rates_used"] == [{"month": "2026-01", "currency": "USD", "rate": "0.92"}]

    def test_a_missing_rate_is_reported_not_assumed(self, client: TestClient, book: dict) -> None:
        _import(client, "royalty-ebook-2026-01.csv", "kdp_royalty", book_format="ebook")
        report = _report(client)
        assert report["missing_fx"] == [{"month": "2026-01", "currency": "USD"}]
        assert _group(report, title=book["id"])["incomplete"] is True

    def test_an_exchange_rate_is_not_overwritten_by_accident(self, client: TestClient) -> None:
        url = "/api/kdp/finance/fx-rates/2026-01/USD"
        assert client.put(url, json={"rate": "0.92", "base_currency": "EUR"}).status_code == 200
        assert client.put(url, json={"rate": "0.92", "base_currency": "EUR"}).status_code == 200
        assert client.put(url, json={"rate": "0.95", "base_currency": "EUR"}).status_code == 409
        replaced = client.put(url, json={"rate": "0.95", "base_currency": "EUR", "replace": True})
        assert replaced.status_code == 200


class TestCostsAndMargin:
    def test_without_costs_the_result_is_net_revenue(self, client: TestClient, book: dict) -> None:
        _import(client, "royalty-paperback-2026-01.csv", "kdp_royalty", book_format="paperback")
        group = _group(_report(client), title=book["id"])
        assert group["margin_label"] == "net_revenue"
        assert group["contribution_margin"] is None
        assert "net_revenue_without_costs" in _report(client)["notes"]

    def test_costs_and_ads_turn_it_into_a_contribution_margin(
        self, client: TestClient, book: dict
    ) -> None:
        _import(client, "royalty-paperback-2026-01.csv", "kdp_royalty", book_format="paperback")
        ads = _import(
            client, "ads-advertised-product-2026-01.csv", "amazon_ads", marketplace="Amazon.de"
        )
        assert ads.status_code == 200, ads.text
        cost = client.post(
            "/api/kdp/finance/costs",
            json={
                "book_id": book["id"],
                "cost_date": "2026-01-10",
                "amount": "1.98",
                "currency": "EUR",
                "category": "cover",
            },
        )
        assert cost.status_code == 201, cost.text
        report = _report(client)
        group = _group(report, title=book["id"])
        assert group["margin_label"] == "contribution_margin"
        assert Decimal(group["ad_spend"]) == Decimal("15.00")
        assert Decimal(group["contribution_margin"]) == Decimal("-3.00")
        assert group["paid_click_to_order_rate"] is not None
        assert "ads_attribution_window" in report["notes"]

    def test_a_cost_can_be_deleted(self, client: TestClient, book: dict) -> None:
        created = client.post(
            "/api/kdp/finance/costs",
            json={
                "book_id": book["id"],
                "cost_date": "2026-01-10",
                "amount": "5",
                "currency": "EUR",
            },
        ).json()
        assert (
            client.get("/api/kdp/finance/costs", params={"book_id": book["id"]}).json()[0]["id"]
            == created["id"]
        )
        assert client.delete(f"/api/kdp/finance/costs/{created['id']}").status_code == 204
        assert client.get("/api/kdp/finance/costs").json() == []


class TestPeriodAndStatus:
    def test_recent_months_are_flagged_provisional(self, client: TestClient, book: dict) -> None:
        recent = (date.today().replace(day=1) - timedelta(days=1)).strftime("%Y-%m")
        raw = (FIXTURES / "royalty-paperback-2026-01.csv").read_text().replace("2026-01", recent)
        client.post(
            "/api/kdp/finance/imports",
            data={"kind": "kdp_royalty", "book_format": "paperback"},
            files={"file": ("p.csv", raw.encode(), "text/csv")},
        )
        _import(client, "royalty-paperback-2026-01.csv", "kdp_royalty", book_format="paperback")
        report = _report(client, "month")
        assert report["provisional_months"] == [recent]
        assert _group(report, month=recent)["provisional"] is True
        assert _group(report, month="2026-01")["provisional"] is False

    def test_the_period_filter_limits_the_months(self, client: TestClient, book: dict) -> None:
        _import(client, "kenp-2026-01-02.csv", "kdp_kenp")
        report = _report(client, "month", from_month="2026-02", to_month="2026-02")
        assert [g["key"]["month"] for g in report["groups"]] == ["2026-02"]


class TestPrivacy:
    def test_finance_data_is_not_in_the_bgb_backup(self, client: TestClient, book: dict) -> None:
        _import(client, "royalty-paperback-2026-01.csv", "kdp_royalty", book_format="paperback")
        client.post(
            "/api/kdp/finance/costs",
            json={
                "book_id": book["id"],
                "cost_date": "2026-01-10",
                "amount": "5",
                "currency": "EUR",
            },
        )
        response = client.get("/api/backup/export")
        assert response.status_code == 200
        import io
        import zipfile

        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            names = archive.namelist()
            blob = b"".join(archive.read(n) for n in names if not n.endswith("/"))
        assert not any("finance" in name for name in names)
        assert b"13.98" not in blob

    def test_the_explicit_export_round_trips(self, client: TestClient, book: dict) -> None:
        _import(client, "royalty-paperback-2026-01.csv", "kdp_royalty", book_format="paperback")
        client.put(
            "/api/kdp/finance/kenp-rates/2026-01/Amazon.de",
            json={"rate": "0.004", "currency": "EUR"},
        )
        client.post(
            "/api/kdp/finance/costs",
            json={
                "book_id": book["id"],
                "cost_date": "2026-01-10",
                "amount": "5",
                "currency": "EUR",
            },
        )
        exported = client.get("/api/kdp/finance/export")
        assert exported.status_code == 200
        before = _report(client)

        for model in FINANCE_MODELS:
            session = SessionLocal()
            session.query(model).delete()
            session.commit()
            session.close()
        restored = client.post("/api/kdp/finance/restore", json=exported.json())
        assert restored.status_code == 200, restored.text
        assert _report(client) == before
        assert client.get("/api/kdp/finance/export").json() == exported.json()


def _xlsx_builder():
    import importlib.util

    path = FIXTURES.parents[1] / "xlsx_builder.py"
    spec = importlib.util.spec_from_file_location("kdp_xlsx_builder", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TestXlsx:
    def _workbook(self, *sheets: str) -> bytes:
        builder = _xlsx_builder()
        rows = builder.rows_from_csv((FIXTURES / "royalty-ebook-2026-01.csv").read_text())
        return builder.build_xlsx({name: rows for name in sheets})

    def _post(self, client: TestClient, raw: bytes, **form: str):
        return client.post(
            "/api/kdp/finance/imports",
            data={"kind": "kdp_royalty", "book_format": "ebook", **form},
            files={"file": ("royalties.xlsx", raw, "application/octet-stream")},
        )

    def test_an_xlsx_download_imports_and_reports_its_sheet(
        self, client: TestClient, book: dict
    ) -> None:
        response = self._post(client, self._workbook("eBook Royalty"))
        assert response.status_code == 200, response.text
        body = response.json()
        assert (body["status"], body["sheet"], body["header_row"]) == (
            "imported",
            "eBook Royalty",
            1,
        )
        assert _count(FinanceRevenueLine) == 3

    def test_the_same_data_as_csv_then_xlsx_is_unchanged(
        self, client: TestClient, book: dict
    ) -> None:
        _import(client, "royalty-ebook-2026-01.csv", "kdp_royalty", book_format="ebook")
        response = self._post(client, self._workbook("eBook Royalty"))
        assert response.json()["status"] == "unchanged"
        assert _count(FinanceImport) == 1

    def test_several_sheets_without_a_choice_is_a_400_naming_them(self, client: TestClient) -> None:
        response = self._post(client, self._workbook("Summary", "eBook Royalty"))
        assert response.status_code == 400
        assert "Summary, eBook Royalty" in response.json()["detail"]
        chosen = self._post(
            client, self._workbook("Summary", "eBook Royalty"), sheet="eBook Royalty"
        )
        assert chosen.json()["status"] == "imported"
