"""Declared column contracts of the supported report downloads (#1129).

Each contract lists every column the parser knows. ``required`` and
``optional`` columns are read into a typed field; ``ignored`` columns
are acknowledged and deliberately not used (Amazon's own derived
ratios, which the evaluation recomputes from the counts). A header
that appears in none of the three sets fails the import: when Amazon
renames or adds a column, the contract is updated by a person, not
skipped by the parser.

The header names follow the KDP royalty, KENP and Amazon Ads
advertised-product downloads as known when this was written. They are
the first thing to check against a real download.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ColumnContract:
    """The known header set of one report kind, mapped to field names."""

    kind: str
    required: dict[str, str]
    optional: dict[str, str]
    ignored: frozenset[str]

    def known(self) -> set[str]:
        return set(self.required) | set(self.optional) | set(self.ignored)


KDP_ROYALTY = ColumnContract(
    kind="kdp_royalty",
    required={
        "Royalty Date": "month",
        "Title": "title",
        "ASIN": "asin",
        "Marketplace": "marketplace",
        "Units Sold": "units_sold",
        "Units Refunded": "units_refunded",
        "Net Units Sold": "net_units",
        "Royalty": "royalty",
        "Currency": "currency",
    },
    optional={
        "Author Name": "author",
        "ISBN": "isbn",
        "Royalty Type": "royalty_type",
        "Transaction Type": "transaction_type",
    },
    ignored=frozenset(
        {
            "Avg. List Price without tax",
            "Avg. Offer Price without tax",
            "Avg. File Size (MB)",
            "Avg. Delivery Cost",
            "Avg. Manufacturing Cost",
        }
    ),
)

KDP_KENP = ColumnContract(
    kind="kdp_kenp",
    required={
        "Date": "month",
        "ASIN": "asin",
        "Marketplace": "marketplace",
        "Kindle Edition Normalized Pages (KENP) Read": "kenp_pages",
    },
    optional={"Title": "title", "Author Name": "author"},
    ignored=frozenset(),
)

AMAZON_ADS = ColumnContract(
    kind="amazon_ads",
    required={
        "Currency": "currency",
        "Campaign Name": "campaign",
        "Advertised ASIN": "asin",
        "Impressions": "impressions",
        "Clicks": "clicks",
        "Spend": "spend",
    },
    optional={
        "Date": "date",
        "Start Date": "start_date",
        "End Date": "end_date",
        "14 Day Total Orders (#)": "orders",
    },
    ignored=frozenset(
        {
            "Portfolio name",
            "Ad Group Name",
            "Advertised SKU",
            "Click-Thru Rate (CTR)",
            "Cost Per Click (CPC)",
            "Total Advertising Cost of Sales (ACOS)",
            "Total Return on Advertising Spend (ROAS)",
            "14 Day Total Sales",
            "14 Day Total Units (#)",
            "14 Day Conversion Rate",
        }
    ),
)

CONTRACTS: dict[str, ColumnContract] = {
    contract.kind: contract for contract in (KDP_ROYALTY, KDP_KENP, AMAZON_ADS)
}
