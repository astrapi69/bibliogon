/**
 * Source + orphans-only filters for the comments-admin active view.
 * Extracted from CommentsAdminSection.tsx (#683); data-testids
 * unchanged.
 */

import {RadixSelect} from "../../shared/RadixSelect";
import type {CommentFilters, T} from "./types";

export function CommentsFilters({
    t,
    filters,
    onUpdateFilter,
}: {
    t: T;
    filters: CommentFilters;
    onUpdateFilter: (patch: Partial<CommentFilters>) => void;
}) {
    return (
        <div
            data-testid="comments-admin-filters"
            style={{
                display: "flex",
                gap: 16,
                alignItems: "center",
                flexWrap: "wrap",
                marginTop: 16,
                padding: 12,
                background: "var(--surface-2, #f5f5f5)",
                borderRadius: 6,
            }}
        >
            <label style={{display: "flex", alignItems: "center", gap: 6}}>
                {t("ui.comments.admin.filter_source", "Source:")}
                <RadixSelect
                    testId="comments-admin-filter-source"
                    value={filters.importedFrom}
                    onValueChange={(next) => onUpdateFilter({importedFrom: next})}
                    className="is-narrow"
                    ariaLabel={t("ui.comments.admin.filter_source", "Source:")}
                    allOption={{
                        label: t("ui.comments.admin.filter_source_any", "Any"),
                    }}
                    options={[
                        {value: "medium", label: "Medium"},
                        {value: "wordpress", label: "WordPress"},
                        {value: "hashnode", label: "Hashnode"},
                    ]}
                />
            </label>

            <label style={{display: "flex", alignItems: "center", gap: 6}}>
                <input
                    type="checkbox"
                    data-testid="comments-admin-filter-orphans"
                    checked={filters.orphansOnly}
                    onChange={(e) => onUpdateFilter({orphansOnly: e.target.checked})}
                />
                {t(
                    "ui.comments.admin.filter_orphans",
                    "Orphans only (no parent article)",
                )}
            </label>
        </div>
    );
}
