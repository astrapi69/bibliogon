/**
 * KDP Publishing Wizard — Step 3: Pricing.
 *
 * Fully-controlled component (state lives in the wizard's
 * ``kdpWizardMachine`` context). The user picks a royalty plan
 * (35% vs 70%) — the only required field per the
 * ``hasRequiredPricing`` guard. Per-region list prices +
 * paperback page count + KDP-Select / expanded-distribution
 * toggles are optional calculator inputs (A2: calculator-only,
 * not strategy-tool).
 *
 * Royalty math is centralized in ``pricing.ts``. KDP rule
 * changes propagate through the constants there.
 *
 * Book-type variations (per Pre-Inspection Track 3.D):
 *   - prose: ebook + paperback panels both shown
 *   - picture_book / comic_book: paperback only (WeasyPrint
 *     produces PDF only, not an ingestible ebook format for
 *     KDP)
 */

import {useEffect, useState} from "react"
import {AlertCircle, Banknote} from "lucide-react"

import {api, BookDetail} from "../../api/client"
import {useI18n} from "../../hooks/useI18n"
import {useBookTypes} from "../../hooks/useBookTypes"
import type {PricingState, RegionCode} from "./machines/types"
import {
    DEFAULT_EBOOK_FILE_SIZE_MB,
    KDP_REGIONS,
    REGION_CURRENCIES,
    REGION_LABELS,
    type PaperbackInkType,
    computeEbookRoyalty35,
    computeEbookRoyalty70,
    computePaperbackPrintCost,
    computePaperbackRoyalty,
    estimatePageCount,
    isEbookRoyalty70Eligible,
} from "./pricing"

const DEFAULT_MARKETPLACE: RegionCode = "US"

function isRegionCode(value: unknown): value is RegionCode {
    return (
        typeof value === "string" &&
        (KDP_REGIONS as readonly string[]).includes(value)
    )
}

interface Props {
    book: BookDetail
    pricing: PricingState
    onChange: (partial: Partial<PricingState>) => void
    /** Optional callback for parity with the other per-step
     *  components. Machine guard already gates Next based on
     *  ``hasRequiredPricing``; this is a no-op in C8. */
    onCanAdvanceChange?: (canAdvance: boolean) => void
}

const CURRENCY_SYMBOLS: Record<string, string> = {
    USD: "$",
    EUR: "€",
    GBP: "£",
    JPY: "¥",
    INR: "₹",
}

function formatMoney(amount: number, currency: string): string {
    const sym = CURRENCY_SYMBOLS[currency] ?? ""
    // Two decimals for fractional currencies, zero for JPY/INR
    // (where unit prices are integers in practice).
    const fractionDigits = currency === "JPY" || currency === "INR" ? 0 : 2
    return `${sym}${amount.toFixed(fractionDigits)}`
}

export default function PricingStep({book, pricing, onChange}: Props) {
    const {t} = useI18n()
    // BOOK-TYPES-SSOT-YAML-01 C7: ebook-eligibility now read from
    // the registry's capabilities.ebook_export flag (defaults to
    // false for new types — picture_book + comic_book opt out;
    // prose opts in). The hardcoded ``isEbookSupported(bookType)``
    // helper (which only knew about prose) is gone.
    const bookTypesSnapshot = useBookTypes()
    const ebookSupported =
        bookTypesSnapshot.types[book.book_type]?.capabilities
            .ebook_export ?? false

    // #30 from the Settings-Completeness audit close: read the
    // workspace default marketplace from app.yaml on mount so the
    // canonical row (page-count anchor + summary display) matches
    // the user's preferred region. Falls back to "US" when the
    // setting is missing or unreachable.
    const [defaultMarketplace, setDefaultMarketplace] =
        useState<RegionCode>(DEFAULT_MARKETPLACE)
    useEffect(() => {
        let cancelled = false
        api.settings
            .getApp()
            .then((config) => {
                if (cancelled) return
                const kdp =
                    (config.kdp as Record<string, unknown> | undefined) ?? {}
                if (isRegionCode(kdp.default_marketplace)) {
                    setDefaultMarketplace(kdp.default_marketplace)
                }
            })
            .catch(() => {
                // Keep US fallback when settings unreachable.
            })
        return () => {
            cancelled = true
        }
    }, [])

    const handlePriceChange = (region: RegionCode, value: string) => {
        const numeric = parseFloat(value)
        const currency = REGION_CURRENCIES[region]
        if (Number.isNaN(numeric) || numeric < 0) {
            // Remove the per-region entry on empty / invalid input.
            const next = {...pricing.prices}
            delete next[region]
            onChange({prices: next})
            return
        }
        onChange({
            prices: {
                ...pricing.prices,
                [region]: {currency, list_price: numeric},
            },
        })
    }

    const handlePageCountChange = (value: string) => {
        // Page count stored on the canonical-marketplace entry
        // (workspace default from app.yaml; falls back to US).
        // Future polish can carry per-region page counts.
        const pages = parseInt(value, 10)
        if (Number.isNaN(pages) || pages < 1) return
        const anchor = pricing.prices[defaultMarketplace]
        const anchorCurrency = REGION_CURRENCIES[defaultMarketplace]
        onChange({
            prices: {
                ...pricing.prices,
                [defaultMarketplace]: {
                    currency: anchorCurrency,
                    list_price: anchor?.list_price ?? 0,
                    page_count: pages,
                },
            },
        })
    }

    const paperbackPageCount =
        pricing.prices[defaultMarketplace]?.page_count ??
        estimatePageCount(book.chapters.length)

    return (
        <div
            style={styles.stepContent}
            data-testid="kdp-publishing-wizard-step-2-pricing"
        >
            <p style={styles.hint}>
                {t(
                    "ui.kdp_publishing_wizard.pricing_hint",
                    "Wähle den Royalty-Plan und gib optionale Preise pro Region ein. Bibliogon berechnet die Royalty-Höhe; KDP behält die endgültige Preishoheit.",
                )}
            </p>

            {/* Royalty plan radio — the only REQUIRED field. */}
            <fieldset style={styles.fieldset}>
                <legend style={styles.legend}>
                    {t(
                        "ui.kdp_publishing_wizard.pricing_royalty_plan",
                        "Royalty-Plan",
                    )}
                </legend>
                <div style={styles.radioRow}>
                    <label style={styles.radioLabel}>
                        <input
                            type="radio"
                            name="royalty_plan"
                            value="35"
                            checked={pricing.royalty_plan === "35"}
                            onChange={() => onChange({royalty_plan: "35"})}
                            data-testid="kdp-publishing-wizard-step-2-royalty-35"
                        />
                        <span>
                            <strong>35%</strong>{" "}
                            {t(
                                "ui.kdp_publishing_wizard.pricing_royalty_35_hint",
                                "(jeder Preis $0.99–$200; keine Lieferkosten)",
                            )}
                        </span>
                    </label>
                    <label style={styles.radioLabel}>
                        <input
                            type="radio"
                            name="royalty_plan"
                            value="70"
                            checked={pricing.royalty_plan === "70"}
                            onChange={() => onChange({royalty_plan: "70"})}
                            data-testid="kdp-publishing-wizard-step-2-royalty-70"
                        />
                        <span>
                            <strong>70%</strong>{" "}
                            {t(
                                "ui.kdp_publishing_wizard.pricing_royalty_70_hint",
                                "($2.99–$9.99 in US; abzgl. Lieferkosten)",
                            )}
                        </span>
                    </label>
                </div>
            </fieldset>

            {/* KDP-Select + expanded distribution toggles. */}
            <fieldset style={styles.fieldset}>
                <legend style={styles.legend}>
                    {t(
                        "ui.kdp_publishing_wizard.pricing_options",
                        "Optionen",
                    )}
                </legend>
                <label style={styles.checkboxLabel}>
                    <input
                        type="checkbox"
                        checked={pricing.kdp_select_enrolled}
                        onChange={(e) =>
                            onChange({kdp_select_enrolled: e.target.checked})
                        }
                        data-testid="kdp-publishing-wizard-step-2-kdp-select"
                    />
                    {t(
                        "ui.kdp_publishing_wizard.pricing_kdp_select",
                        "KDP-Select (90 Tage exklusiv bei Amazon)",
                    )}
                </label>
                {pricing.royalty_plan === "35" && (
                    <label style={styles.checkboxLabel}>
                        <input
                            type="checkbox"
                            checked={pricing.expanded_distribution}
                            onChange={(e) =>
                                onChange({
                                    expanded_distribution: e.target.checked,
                                })
                            }
                            data-testid="kdp-publishing-wizard-step-2-expanded-distribution"
                        />
                        {t(
                            "ui.kdp_publishing_wizard.pricing_expanded_distribution",
                            "Expanded Distribution (zusätzliche Vertriebskanäle)",
                        )}
                    </label>
                )}
            </fieldset>

            {/* Per-region pricing + royalty estimate. */}
            {ebookSupported && (
                <fieldset
                    style={styles.fieldset}
                    data-testid="kdp-publishing-wizard-step-2-ebook-section"
                >
                    <legend style={styles.legend}>
                        {t(
                            "ui.kdp_publishing_wizard.pricing_ebook_prices",
                            "E-Book-Preise (optional)",
                        )}
                    </legend>
                    <table style={styles.table}>
                        <thead>
                            <tr>
                                <th style={styles.th}>
                                    {t(
                                        "ui.kdp_publishing_wizard.pricing_region",
                                        "Region",
                                    )}
                                </th>
                                <th style={styles.th}>
                                    {t(
                                        "ui.kdp_publishing_wizard.pricing_list_price",
                                        "Listenpreis",
                                    )}
                                </th>
                                <th style={styles.th}>
                                    {t(
                                        "ui.kdp_publishing_wizard.pricing_royalty",
                                        "Royalty/Stück",
                                    )}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {KDP_REGIONS.map((region) => {
                                const entry = pricing.prices[region]
                                const price = entry?.list_price ?? 0
                                const currency = REGION_CURRENCIES[region]
                                const plan = pricing.royalty_plan
                                let royalty = 0
                                let eligible = true
                                if (price > 0 && plan === "70") {
                                    royalty = computeEbookRoyalty70(
                                        price,
                                        DEFAULT_EBOOK_FILE_SIZE_MB,
                                        region,
                                    )
                                    eligible = isEbookRoyalty70Eligible(
                                        price,
                                        region,
                                    )
                                } else if (price > 0 && plan === "35") {
                                    royalty = computeEbookRoyalty35(
                                        price,
                                        region,
                                    )
                                }
                                return (
                                    <tr
                                        key={region}
                                        data-testid={`kdp-publishing-wizard-step-2-region-${region}`}
                                    >
                                        <td style={styles.td}>
                                            {REGION_LABELS[region]} (
                                            {currency})
                                        </td>
                                        <td style={styles.td}>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                value={entry?.list_price ?? ""}
                                                onChange={(e) =>
                                                    handlePriceChange(
                                                        region,
                                                        e.target.value,
                                                    )
                                                }
                                                style={styles.priceInput}
                                                data-testid={`kdp-publishing-wizard-step-2-price-${region}`}
                                            />
                                        </td>
                                        <td style={styles.td}>
                                            {price > 0 && plan ? (
                                                eligible ? (
                                                    <span
                                                        style={styles.royalty}
                                                        data-testid={`kdp-publishing-wizard-step-2-royalty-${region}`}
                                                    >
                                                        {formatMoney(
                                                            royalty,
                                                            currency,
                                                        )}
                                                    </span>
                                                ) : (
                                                    <span
                                                        style={styles.ineligible}
                                                        data-testid={`kdp-publishing-wizard-step-2-ineligible-${region}`}
                                                    >
                                                        <AlertCircle size={12} />{" "}
                                                        {t(
                                                            "ui.kdp_publishing_wizard.pricing_70_ineligible",
                                                            "70% nicht möglich",
                                                        )}
                                                    </span>
                                                )
                                            ) : (
                                                <span
                                                    style={styles.muted}
                                                >
                                                    —
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </fieldset>
            )}

            {/* Paperback section. */}
            <fieldset
                style={styles.fieldset}
                data-testid="kdp-publishing-wizard-step-2-paperback-section"
            >
                <legend style={styles.legend}>
                    <Banknote size={14} />{" "}
                    {t(
                        "ui.kdp_publishing_wizard.pricing_paperback",
                        "Paperback (USD, B&W Standard)",
                    )}
                </legend>
                <div style={styles.paperbackRow}>
                    <label style={styles.inputLabel}>
                        {t(
                            "ui.kdp_publishing_wizard.pricing_page_count",
                            "Seitenzahl",
                        )}
                        <input
                            type="number"
                            min="24"
                            value={paperbackPageCount}
                            onChange={(e) =>
                                handlePageCountChange(e.target.value)
                            }
                            style={styles.priceInput}
                            data-testid="kdp-publishing-wizard-step-2-page-count"
                        />
                    </label>
                    <span style={styles.paperbackStat}>
                        {t(
                            "ui.kdp_publishing_wizard.pricing_print_cost",
                            "Druckkosten",
                        )}
                        :{" "}
                        <strong
                            data-testid="kdp-publishing-wizard-step-2-print-cost"
                        >
                            {formatMoney(
                                computePaperbackPrintCost(
                                    paperbackPageCount,
                                    "bw" as PaperbackInkType,
                                ),
                                "USD",
                            )}
                        </strong>
                    </span>
                    {pricing.prices[defaultMarketplace]?.list_price && (
                        <span style={styles.paperbackStat}>
                            {t(
                                "ui.kdp_publishing_wizard.pricing_paperback_royalty",
                                "Paperback-Royalty",
                            )}
                            :{" "}
                            <strong
                                data-testid="kdp-publishing-wizard-step-2-paperback-royalty"
                            >
                                {formatMoney(
                                    computePaperbackRoyalty(
                                        pricing.prices[defaultMarketplace]!
                                            .list_price,
                                        paperbackPageCount,
                                        "bw",
                                    ),
                                    REGION_CURRENCIES[defaultMarketplace],
                                )}
                            </strong>
                        </span>
                    )}
                </div>
            </fieldset>
        </div>
    )
}

const styles: Record<string, React.CSSProperties> = {
    stepContent: {
        minHeight: 280,
    },
    hint: {
        fontSize: "0.875rem",
        color: "var(--text-muted)",
        marginBottom: 16,
        lineHeight: 1.5,
    },
    fieldset: {
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm, 4px)",
        padding: 12,
        marginBottom: 12,
    },
    legend: {
        fontSize: "0.8125rem",
        fontWeight: 600,
        padding: "0 6px",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
    },
    radioRow: {
        display: "flex",
        flexDirection: "column",
        gap: 6,
    },
    radioLabel: {
        display: "flex",
        alignItems: "baseline",
        gap: 8,
        fontSize: "0.875rem",
        cursor: "pointer",
    },
    checkboxLabel: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: "0.875rem",
        cursor: "pointer",
        marginBottom: 4,
    },
    table: {
        width: "100%",
        borderCollapse: "collapse",
        fontSize: "0.8125rem",
    },
    th: {
        textAlign: "left",
        padding: "4px 6px",
        color: "var(--text-muted)",
        fontWeight: 500,
        borderBottom: "1px solid var(--border)",
    },
    td: {
        padding: "4px 6px",
        verticalAlign: "middle",
    },
    priceInput: {
        width: "5em",
        padding: "2px 6px",
        fontSize: "0.8125rem",
        background: "var(--bg-input, var(--bg-card))",
        color: "var(--text-primary)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm, 4px)",
    },
    royalty: {
        fontWeight: 600,
        color: "var(--success, #15803d)",
    },
    ineligible: {
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: "0.75rem",
        color: "var(--warning, #b45309)",
    },
    muted: {
        color: "var(--text-muted)",
    },
    paperbackRow: {
        display: "flex",
        gap: 16,
        flexWrap: "wrap",
        alignItems: "center",
        fontSize: "0.875rem",
    },
    inputLabel: {
        display: "inline-flex",
        flexDirection: "column",
        gap: 4,
        fontSize: "0.8125rem",
    },
    paperbackStat: {
        color: "var(--text-primary)",
    },
}
