"""HTTP surface of the finance import, nested under ``/kdp/finance`` (#1129).

Thin by design: validate, delegate to the services, return. Services
raise ``BibliogonError`` subclasses; the global handler maps them.
Money crosses the API as decimal strings, never as JSON floats.
"""

from __future__ import annotations

import json
from datetime import date
from decimal import Decimal
from typing import Any, Literal

from fastapi import APIRouter, Depends, File, Form, Path, Query, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from bibliogon_kdp.finance import archive, payment_service, report_service, service

router = APIRouter(prefix="/finance", tags=["kdp-finance"])

ReportKind = Literal["kdp_royalty", "kdp_kenp", "amazon_ads", "kdp_payments"]
BookFormat = Literal["ebook", "paperback", "hardcover"]
MONTH = r"^\d{4}-(0[1-9]|1[0-2])$"
CURRENCY = r"^[A-Za-z]{3}$"


class KenpRateIn(BaseModel):
    rate: Decimal = Field(ge=0)
    currency: str = Field(pattern=CURRENCY)


class FxRateIn(BaseModel):
    rate: Decimal = Field(gt=0)
    base_currency: str = Field(pattern=CURRENCY)
    source: str | None = Field(default=None, max_length=200)
    replace: bool = False


class FxFromPaymentsIn(BaseModel):
    base_currency: str = Field(default="EUR", pattern=CURRENCY)


class CostIn(BaseModel):
    book_id: str
    cost_date: date
    amount: Decimal = Field(ge=0)
    currency: str = Field(pattern=CURRENCY)
    category: str = Field(default="other", max_length=50)
    note: str | None = None


def _cost_out(cost: Any) -> dict:
    return {
        "id": cost.id,
        "book_id": cost.book_id,
        "cost_date": cost.cost_date.isoformat(),
        "amount": str(cost.amount),
        "currency": cost.currency,
        "category": cost.category,
        "note": cost.note,
    }


@router.post("/imports")
async def import_report(
    file: UploadFile = File(...),
    kind: ReportKind = Form(...),
    book_format: BookFormat | None = Form(default=None),
    marketplace: str | None = Form(default=None, max_length=50),
    sheet: str | None = Form(default=None, max_length=100),
    dry_run: bool = Form(default=False),
    db: Session = Depends(get_db),
) -> dict:
    """Import one downloaded report (CSV or XLSX).

    ``kdp_payments`` goes to ``payment_service.import_payments``; every
    other kind to ``service.import_report``.
    """
    raw = await file.read()
    if kind == "kdp_payments":
        return payment_service.import_payments(
            db, raw=raw, filename=file.filename, sheet=sheet, dry_run=dry_run
        )
    return service.import_report(
        db,
        kind=kind,
        raw=raw,
        filename=file.filename,
        book_format=book_format,
        marketplace=marketplace,
        sheet=sheet,
        dry_run=dry_run,
    )


@router.get("/imports")
def list_imports(db: Session = Depends(get_db)) -> list[dict]:
    return [
        {
            "id": row.id,
            "kind": row.kind,
            "sales_channel": row.sales_channel,
            "book_format": row.book_format,
            "marketplace": row.marketplace,
            "filename": row.filename,
            "months": json.loads(row.months),
            "row_count": row.row_count,
            "imported_at": row.imported_at.isoformat() if row.imported_at else None,
        }
        for row in service.list_imports(db)
    ]


@router.put("/kenp-rates/{month}/{marketplace}")
def put_kenp_rate(
    payload: KenpRateIn,
    month: str = Path(pattern=MONTH),
    marketplace: str = Path(max_length=50),
    db: Session = Depends(get_db),
) -> dict:
    row = service.set_kenp_rate(db, month, marketplace, payload.rate, payload.currency)
    return {
        "month": row.month,
        "marketplace": row.marketplace,
        "rate": str(row.rate),
        "currency": row.currency,
    }


@router.put("/fx-rates/{month}/{currency}")
def put_fx_rate(
    payload: FxRateIn,
    month: str = Path(pattern=MONTH),
    currency: str = Path(pattern=CURRENCY),
    db: Session = Depends(get_db),
) -> dict:
    row = service.set_fx_rate(
        db,
        month,
        currency,
        payload.base_currency,
        payload.rate,
        source=payload.source,
        replace=payload.replace,
    )
    return {
        "month": row.month,
        "currency": row.currency,
        "base_currency": row.base_currency,
        "rate": str(row.rate),
        "source": row.source,
    }


@router.post("/fx-rates/from-payments")
def fx_rates_from_payments(payload: FxFromPaymentsIn, db: Session = Depends(get_db)) -> dict:
    """Amazon's applied rates from imported payments become monthly rates."""
    return payment_service.apply_payment_fx_rates(db, payload.base_currency)


@router.post("/costs", status_code=201)
def post_cost(payload: CostIn, db: Session = Depends(get_db)) -> dict:
    return _cost_out(service.add_cost(db, **payload.model_dump()))


@router.get("/costs")
def get_costs(
    book_id: str | None = Query(default=None), db: Session = Depends(get_db)
) -> list[dict]:
    return [_cost_out(cost) for cost in service.list_costs(db, book_id)]


@router.delete("/costs/{cost_id}", status_code=204)
def delete_cost(cost_id: str, db: Session = Depends(get_db)) -> Response:
    service.delete_cost(db, cost_id)
    return Response(status_code=204)


@router.get("/report")
def get_report(
    group_by: str = Query(default="title"),
    from_month: str | None = Query(default=None),
    to_month: str | None = Query(default=None),
    base_currency: str = Query(default="EUR", pattern=CURRENCY),
    db: Session = Depends(get_db),
) -> dict:
    """Contribution margin (or net revenue, when no costs) per group."""
    dims = tuple(part.strip() for part in group_by.split(",") if part.strip())
    return report_service.build_report(
        db, group_by=dims, base_currency=base_currency, from_month=from_month, to_month=to_month
    )


@router.get("/export")
def export_finance(db: Session = Depends(get_db)) -> dict:
    """All finance data - the explicit path, since ``.bgb`` excludes it."""
    return archive.export_bundle(db)


@router.post("/restore")
def restore_finance(bundle: dict[str, Any], db: Session = Depends(get_db)) -> dict:
    return {"restored": archive.restore_bundle(db, bundle)}
