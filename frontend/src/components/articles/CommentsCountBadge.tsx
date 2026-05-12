/**
 * Shared comments-count badge for article surfaces.
 *
 * Extracted from ``ArticleCard`` (MEDIUM-COMMENTS-UI-01
 * commit 4 / 87ab959) so the article list view can render the
 * same badge with the same visual treatment. Per
 * LIST-VIEW-COMMENTS-COUNT-PARITY-01.
 *
 * Always renders nothing when ``count <= 0`` so callers don't
 * have to guard the conditional themselves. Caller-supplied
 * ``testId`` lets parity tests target the badge at each
 * surface ("article-card-..." in the grid view,
 * "article-list-row-..." in the list view).
 */

import {MessageSquare} from "lucide-react";

import {useI18n} from "../../hooks/useI18n";

interface Props {
    count: number | null | undefined;
    /** ``data-testid`` for regression-pin tests. */
    testId: string;
    /** Optional extra className (the parent surface applies
     *  its own layout-specific styling — float-right in the
     *  card view, inline in the list view). */
    className?: string;
}

export default function CommentsCountBadge({count, testId, className}: Props) {
    const {t} = useI18n();
    const value = count ?? 0;
    if (value <= 0) return null;
    const tooltip = t(
        "ui.comments.dashboard.badge_tooltip",
        "{count} imported comments",
    ).replace("{count}", String(value));
    return (
        <span
            className={className}
            data-testid={testId}
            title={tooltip}
            style={{
                display: "inline-flex",
                alignItems: "center",
                color: "var(--text-muted, #6b7280)",
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
            }}
        >
            <MessageSquare
                size={12}
                aria-hidden
                style={{verticalAlign: -2, marginRight: 4}}
            />
            {value}
        </span>
    );
}
