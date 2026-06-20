import PageSizeSelector from "../PageSizeSelector";
import type { PageSize } from "../../hooks/usePagedList";

type Translate = (key: string, fallback: string) => string;

/** Shared "Load more" + page-size row for the paginated dashboard
 *  lists (Books + Articles). Renders the load-more button only when
 *  more rows remain; the page-size selector is always shown. Testids
 *  are caller-supplied so each surface keeps its existing selectors. */
export default function ListPaginationControls({
    visibleCount,
    totalCount,
    hasMore,
    onLoadMore,
    pageSize,
    onPageSizeChange,
    t,
    paginationTestId,
    loadMoreTestId,
    pageSizeTestId,
}: {
    visibleCount: number;
    totalCount: number;
    hasMore: boolean;
    onLoadMore: () => void;
    pageSize: PageSize;
    onPageSizeChange: (size: PageSize) => void;
    t: Translate;
    paginationTestId: string;
    loadMoreTestId: string;
    pageSizeTestId: string;
}) {
    return (
        <div
            data-testid={paginationTestId}
            style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: 16,
                marginTop: 16,
                paddingBottom: 8,
                flexWrap: "wrap",
            }}
        >
            {hasMore && (
                <button
                    type="button"
                    className="btn btn-secondary"
                    data-testid={loadMoreTestId}
                    onClick={onLoadMore}
                >
                    {t("ui.dashboard.load_more", "Mehr laden")} ({visibleCount} / {totalCount})
                </button>
            )}
            <PageSizeSelector
                value={pageSize}
                onChange={onPageSizeChange}
                data-testid={pageSizeTestId}
            />
        </div>
    );
}
