/**
 * Responsive filter panel for the articles dashboard. Renders the
 * ArticleFilterBar inside the shared FilterSheet shell (Radix Dialog
 * side panel). Brings the Articles dashboard to parity with the Books
 * dashboard's mobile filter sheet (issue #273).
 *
 * The ArticleFilterBar's flex-wrap layout stacks its controls inside
 * the narrow (320px) sheet, so no separate "stack" layout variant is
 * needed.
 */

import { useI18n } from "../../hooks/useI18n";
import FilterSheet from "../dashboard/FilterSheet";
import { ArticleFilterBar } from "./ArticleFilterBar";
import type { useArticleFilters } from "../../hooks/article/useArticleFilters";

interface Props {
    filters: ReturnType<typeof useArticleFilters>;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

export default function ArticleFilterSheet({ filters, open = false, onOpenChange }: Props) {
    const { t } = useI18n();

    return (
        <FilterSheet
            title={t("ui.articles.filters", "Filter")}
            open={open}
            onOpenChange={onOpenChange ?? (() => {})}
        >
            <ArticleFilterBar filters={filters} />
        </FilterSheet>
    );
}
