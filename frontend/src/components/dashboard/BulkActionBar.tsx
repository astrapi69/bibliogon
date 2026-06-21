/**
 * BulkActionBar — shared shell for sticky bulk-action bars.
 *
 * RECURRING-COMPONENT-AUDIT-01 Candidate #2 extraction (canonical
 * RCU 3-site application). Replaces the byte-identical sticky-top
 * container + count badge + clear button that previously appeared
 * in ArticleBulkActionBar / BookBulkActionBar / CommentBulkActionBar.
 *
 * The wrapper renders:
 *   1. The sticky-top container (`<div role="region" aria-label=...>`)
 *   2. The count badge (left-anchored)
 *   3. A children slot for site-specific actions (format / mode /
 *      AI / convert / delete dropdowns — varies per surface)
 *   4. The Clear-selection button (right-anchored)
 *
 * Site-specific differences are exposed as props (testid namespaces,
 * count + clear labels, aria-label) following the Tier1Section
 * RCU pattern (testidPrefix-style n-site reuse contract).
 */

import type {ReactNode} from "react";

import styles from "../BulkActionBar.module.css";

interface BulkActionBarProps {
    /** Number of items currently selected. */
    count: number;
    /** Pre-formatted count label (e.g. "5 selected"). Caller computes
     *  via i18n.t() so the wrapper stays language-agnostic. */
    countLabel: string;
    /** Accessible region label for the bar (e.g. "Format" or
     *  "Bulk-Aktionen"). */
    ariaLabel: string;
    /** Clear-selection button label. */
    clearLabel: string;
    /** Fires when the user clicks the Clear-selection button. */
    onClear: () => void;
    /** data-testid on the root region element. */
    barTestId: string;
    /** data-testid on the count badge span. */
    countTestId: string;
    /** data-testid on the Clear-selection button. */
    clearTestId: string;
    /** Site-specific action cluster (format dropdown / export
     *  button / AI menu / delete menu / spacer / warnings). Rendered
     *  between the count badge and the Clear button. */
    children: ReactNode;
}

export default function BulkActionBar({
    count: _count,
    countLabel,
    ariaLabel,
    clearLabel,
    onClear,
    barTestId,
    countTestId,
    clearTestId,
    children,
}: BulkActionBarProps) {
    return (
        <div
            className={styles.bar}
            data-testid={barTestId}
            role="region"
            aria-label={ariaLabel}
        >
            <span className={styles.count} data-testid={countTestId}>
                {countLabel}
            </span>
            {children}
            <button
                type="button"
                className="btn btn-sm btn-ghost"
                data-testid={clearTestId}
                onClick={onClear}
            >
                {clearLabel}
            </button>
        </div>
    );
}
