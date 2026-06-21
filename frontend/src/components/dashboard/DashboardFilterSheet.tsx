/**
 * Responsive filter panel for the books dashboard. Renders the same
 * DashboardFilterBar in "stack" layout inside the shared FilterSheet
 * shell (Radix Dialog side panel). Focus trap, scroll lock and
 * overlay come from Radix via the shell.
 */

import { useI18n } from "../../hooks/useI18n";
import FilterSheet from "./FilterSheet";
import DashboardFilterBar from "./DashboardFilterBar";
import type { BookFilters } from "../../hooks/book/useBookFilters";

interface Props {
    filters: BookFilters;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

export default function DashboardFilterSheet({ filters, open = false, onOpenChange }: Props) {
    const { t } = useI18n();

    return (
        <FilterSheet
            title={t("ui.dashboard.filters", "Filter")}
            open={open}
            onOpenChange={onOpenChange ?? (() => {})}
        >
            <DashboardFilterBar filters={filters} layout="stack" />
        </FilterSheet>
    );
}
