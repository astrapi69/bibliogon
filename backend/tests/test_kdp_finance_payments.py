"""End-to-end: the KDP payments report through the real endpoints (#1147).

Synthetic amounts, the German header of a real download. Module-scoped
client for the usual reason (plugin routes accumulate per lifespan).
"""

from __future__ import annotations

import importlib.util
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models import (
    FinanceFxRate,
    FinanceImport,
    FinancePayment,
    FinancePaymentLine,
    FinanceRevenueLine,
)

KDP_TESTS = Path(__file__).resolve().parents[2] / "plugins" / "bibliogon-plugin-kdp" / "tests"


def _builder():
    spec = importlib.util.spec_from_file_location("kdp_xlsx_builder", KDP_TESTS / "xlsx_builder.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _headers() -> list[str]:
    from bibliogon_kdp.finance.payments import DE_HEADERS

    return list(DE_HEADERS)


def _payment(month, market, number, currency, net, rate, payout, tax=0.0):
    return [
        f"{month}-01",
        f"{month}-28",
        market,
        number,
        "",
        f"{month}-28",
        "EFT",
        currency,
        net + tax,
        tax,
        net,
        "",
        rate or "",
        "EUR",
        payout,
        "Bezahlt",
    ]


def _detail(month, currency, net, source, tax=0.0):
    return ["", "", "", "", month, "", "", currency, net + tax, tax, net, source, "", "", "", ""]


def _workbook(*rows) -> bytes:
    return _builder().build_xlsx({"Zahlungen": [_headers(), *rows]})


USD_JAN = (
    _payment("2026-01", "Amazon.com", 100000000000001.0, "USD", 30.0, "0.9000", 27.0),
    _detail("2026-01", "USD", 30.0, "Verkäufe"),
)
GBP_JAN = (
    _payment("2026-01", "Amazon.co.uk", 100000000000002.0, "GBP", 10.0, "1.1500", 11.5),
    _detail("2026-01", "GBP", 10.0, "Kindle+ Tantiemen"),
)
EUR_JAN_TAXED = (
    _payment("2026-01", "Amazon.de", 200000001.0, "EUR", 9.0, None, 9.0, tax=1.0),
    _detail("2026-01", "EUR", 9.0, "Taschenbuchverkäufe", tax=1.0),
)
MODELS = (FinancePaymentLine, FinancePayment, FinanceRevenueLine, FinanceImport, FinanceFxRate)


@pytest.fixture(scope="module")
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def _clean():
    session = SessionLocal()
    try:
        for model in MODELS:
            session.query(model).delete()
        session.commit()
        yield
    finally:
        session.close()


def _post(client: TestClient, raw: bytes, **form):
    return client.post(
        "/api/kdp/finance/imports",
        data={"kind": "kdp_payments", **form},
        files={"file": ("KDP_Payments.xlsx", raw, "application/octet-stream")},
    )


def _count(model) -> int:
    session = SessionLocal()
    try:
        return session.query(model).count()
    finally:
        session.close()


def test_a_payments_download_imports_payments_and_lines(client: TestClient) -> None:
    response = _post(client, _workbook(*USD_JAN, *GBP_JAN))
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["status"], body["rows"], body["months"], body["sheet"]) == (
        "imported",
        2,
        ["2026-01"],
        "Zahlungen",
    )
    assert (_count(FinancePayment), _count(FinancePaymentLine)) == (2, 2)


def test_the_same_download_twice_changes_nothing(client: TestClient) -> None:
    _post(client, _workbook(*USD_JAN))
    again = _post(client, _workbook(*USD_JAN))
    assert again.json()["status"] == "unchanged"
    assert _count(FinanceImport) == 1


def test_a_newer_download_replaces_a_payment_by_its_number(client: TestClient) -> None:
    _post(client, _workbook(*USD_JAN))
    changed = (
        _payment("2026-01", "Amazon.com", 100000000000001.0, "USD", 20.0, "0.9000", 18.0),
        _detail("2026-01", "USD", 20.0, "Verkäufe"),
    )
    response = _post(client, _workbook(*changed))
    assert (response.json()["status"], response.json()["replaced"]) == ("imported", 1)
    assert (_count(FinancePayment), _count(FinancePaymentLine)) == (1, 1)


def test_a_broken_invariant_is_a_400_and_writes_nothing(client: TestClient) -> None:
    broken = (
        _payment("2026-01", "Amazon.com", 100000000000001.0, "USD", 30.0, "0.9000", 99.0),
        _detail("2026-01", "USD", 30.0, "Verkäufe"),
    )
    response = _post(client, _workbook(*broken))
    assert response.status_code == 400
    assert "net x rate" in response.json()["detail"]
    assert _count(FinancePayment) == 0


def test_amazons_rates_fill_the_exchange_rate_table(client: TestClient) -> None:
    _post(client, _workbook(*USD_JAN, *GBP_JAN, *EUR_JAN_TAXED))
    response = client.post("/api/kdp/finance/fx-rates/from-payments", json={"base_currency": "EUR"})
    assert response.status_code == 200, response.text
    assert response.json() == {"written": 2, "unchanged": 0, "conflicts": []}
    session = SessionLocal()
    try:
        rates = {(r.month, r.currency): (r.rate, r.source) for r in session.query(FinanceFxRate)}
    finally:
        session.close()
    assert rates[("2026-01", "USD")] == (Decimal("0.9000"), "KDP payment 100000000000001")
    assert rates[("2026-01", "GBP")][0] == Decimal("1.1500")


def test_a_differing_stored_rate_is_reported_not_overwritten(client: TestClient) -> None:
    client.put(
        "/api/kdp/finance/fx-rates/2026-01/USD", json={"rate": "0.95", "base_currency": "EUR"}
    )
    _post(client, _workbook(*USD_JAN))
    first = client.post(
        "/api/kdp/finance/fx-rates/from-payments", json={"base_currency": "EUR"}
    ).json()
    assert first["written"] == 0
    assert first["conflicts"] == [
        {
            "month": "2026-01",
            "currency": "USD",
            "stored": "0.95",
            "payment": "0.9000",
            "payment_no": "100000000000001",
        }
    ]
    again = client.post(
        "/api/kdp/finance/fx-rates/from-payments", json={"base_currency": "EUR"}
    ).json()
    assert again["conflicts"] == first["conflicts"]


def test_an_equal_stored_rate_counts_as_unchanged(client: TestClient) -> None:
    _post(client, _workbook(*USD_JAN))
    client.post("/api/kdp/finance/fx-rates/from-payments", json={"base_currency": "EUR"})
    again = client.post(
        "/api/kdp/finance/fx-rates/from-payments", json={"base_currency": "EUR"}
    ).json()
    assert again == {"written": 0, "unchanged": 1, "conflicts": []}


def test_withheld_tax_appears_in_the_report_per_marketplace(client: TestClient) -> None:
    _post(client, _workbook(*EUR_JAN_TAXED))
    report = client.get("/api/kdp/finance/report", params={"group_by": "marketplace,month"}).json()
    group = next(g for g in report["groups"] if g["key"]["marketplace"] == "Amazon.de")
    assert Decimal(group["tax_withheld"]) == Decimal("1")
    by_title = client.get("/api/kdp/finance/report", params={"group_by": "title"}).json()
    assert Decimal(
        next(g for g in by_title["groups"] if g["key"]["title"] == "not_attributable")[
            "tax_withheld"
        ]
    ) == Decimal("1")


def test_the_explicit_export_carries_the_payments(client: TestClient) -> None:
    _post(client, _workbook(*USD_JAN))
    exported = client.get("/api/kdp/finance/export").json()
    assert len(exported["payments"]) == 1 and len(exported["payment_lines"]) == 1
    session = SessionLocal()
    for model in MODELS:
        session.query(model).delete()
    session.commit()
    session.close()
    assert client.post("/api/kdp/finance/restore", json=exported).status_code == 200
    assert client.get("/api/kdp/finance/export").json() == exported
