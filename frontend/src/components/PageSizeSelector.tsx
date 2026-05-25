/**
 * DASHBOARD-PAGINATION-LOAD-MORE-01 C4: page-size dropdown.
 *
 * Renders a native ``<select>`` for the 4 allowed page-size values
 * (10 / 25 / 50 / 100). Stateless: the parent owns the value and
 * receives an ``onChange`` callback with the typed ``PageSize``.
 *
 * Pairs with ``usePagedList`` (C3) which owns the persisted state.
 * Positioned by the consumer next to the "Load more" button OR at
 * the bottom of the list.
 */
import type { PageSize } from "../hooks/usePagedList";
import { ALLOWED_PAGE_SIZES } from "../hooks/usePagedList";
import { useI18n } from "../hooks/useI18n";

interface Props {
    value: PageSize;
    onChange: (value: PageSize) => void;
    /** Optional override; default is ``page-size-selector``. */
    "data-testid"?: string;
}

function isPageSize(value: number): value is PageSize {
    return value === 10 || value === 25 || value === 50 || value === 100;
}

export default function PageSizeSelector({
    value,
    onChange,
    "data-testid": testId,
}: Props) {
    const { t } = useI18n();
    const label = t("ui.dashboard.page_size_label", "Pro Seite:");
    return (
        <label
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: "0.875rem",
                color: "var(--text-muted)",
            }}
            data-testid={testId ?? "page-size-selector"}
        >
            {label}
            <select
                value={value}
                onChange={(e) => {
                    const next = Number(e.target.value);
                    if (isPageSize(next)) {
                        onChange(next);
                    }
                }}
                style={{
                    padding: "4px 8px",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--bg-card)",
                    color: "var(--text)",
                    cursor: "pointer",
                }}
                aria-label={label}
                data-testid={`${testId ?? "page-size-selector"}-select`}
            >
                {ALLOWED_PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>
                        {size}
                    </option>
                ))}
            </select>
        </label>
    );
}
