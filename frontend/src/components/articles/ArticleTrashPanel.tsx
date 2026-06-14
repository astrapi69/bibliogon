import { ChevronLeft, RotateCcw, Trash, Trash2 } from "lucide-react";

import { Article } from "../../api/client";
import { useI18n } from "../../hooks/useI18n";
import ViewToggle from "../ViewToggle";
import TrashCard from "../trash/TrashCard";
import layout from "../../pages/ArticleList.module.css";

/** Trash surface for the article list. Mirrors the books-trash chrome
 *  (ChevronLeft + Trash2 icon + title + count + empty-trash + ViewToggle)
 *  and renders grid (TrashCard) or list rows from the trashed set. */
export default function ArticleTrashPanel({
    trash,
    viewMode,
    setViewMode,
    onBack,
    onRestore,
    onPermanentDelete,
    onEmptyTrash,
}: {
    trash: Article[];
    viewMode: "grid" | "list";
    setViewMode: (mode: "grid" | "list") => void;
    onBack: () => void;
    onRestore: (a: Article) => void;
    onPermanentDelete: (a: Article) => void;
    onEmptyTrash: () => void;
}) {
    const { t } = useI18n();

    /** Header chrome shared between empty + populated trash. Mirrors
     *  Dashboard.tsx ``trash-view`` mainHeader: ChevronLeft + Trash2
     *  icon + h2 title + count span + spacer + (optional) empty
     *  action + ViewToggle. */
    const trashHeader = (
        <div className={layout.mainHeader}>
            <button
                type="button"
                className="btn-icon"
                onClick={onBack}
                data-testid="article-trash-back"
                title={t("ui.dashboard.back", "Zurück")}
            >
                <ChevronLeft size={18} />
            </button>
            <Trash2 size={20} className="muted" />
            <h2 className={layout.heading}>{t("ui.articles.trash_title", "Papierkorb")}</h2>
            <span className={layout.articleCount}>
                {trash.length}{" "}
                {trash.length === 1
                    ? t("ui.articles.count_singular", "Artikel")
                    : t("ui.articles.count_plural", "Artikel")}
            </span>
            <div style={{ flex: 1 }} />
            {trash.length > 0 && (
                <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={onEmptyTrash}
                    data-testid="article-trash-empty-all"
                >
                    <Trash2 size={14} />
                    {t("ui.articles.empty_trash", "Papierkorb leeren")}
                </button>
            )}
            <ViewToggle mode={viewMode} onChange={setViewMode} />
        </div>
    );

    if (trash.length === 0) {
        return (
            <div data-testid="article-trash-panel" style={{ marginBottom: 16 }}>
                {trashHeader}
                <div
                    data-testid="article-trash-empty"
                    className={layout.empty}
                    style={{ marginBottom: 16 }}
                >
                    <Trash size={28} className="muted" />
                    <p style={{ color: "var(--text-muted)", margin: 0 }}>
                        {t("ui.articles.trash_empty", "Keine gelöschten Artikel.")}
                    </p>
                </div>
            </div>
        );
    }
    return (
        <div data-testid="article-trash-panel" style={{ marginBottom: 16 }}>
            {trashHeader}
            {viewMode === "grid" ? (
                <div className={layout.grid} data-testid="article-trash-grid">
                    {trash.map((a) => (
                        <TrashCard
                            key={a.id}
                            title={a.title}
                            subtitle={a.author}
                            meta={
                                a.deleted_at
                                    ? `${t("ui.articles.trashed_at", "Gelöscht")}: ${new Date(a.deleted_at).toLocaleString()}`
                                    : null
                            }
                            onRestore={() => onRestore(a)}
                            onPermanentDelete={() => onPermanentDelete(a)}
                            restoreLabel={t("ui.articles.restore", "Wiederherstellen")}
                            deletePermanentLabel={t(
                                "ui.articles.delete_permanent",
                                "Endgültig löschen",
                            )}
                            cardTestId={`article-trash-card-${a.id}`}
                            restoreTestId={`article-trash-restore-${a.id}`}
                            permanentTestId={`article-trash-permanent-${a.id}`}
                        />
                    ))}
                </div>
            ) : (
                <ul className={layout.list} data-testid="article-trash-list">
                    {trash.map((a) => (
                        <li
                            key={a.id}
                            data-testid={`article-trash-row-${a.id}`}
                            className={layout.row}
                            style={{ position: "relative" }}
                        >
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div className={layout.rowTitle}>{a.title}</div>
                                <div className={layout.rowMeta}>
                                    {a.deleted_at ? (
                                        <span>
                                            {t("ui.articles.trashed_at", "Gelöscht")}:{" "}
                                            {new Date(a.deleted_at).toLocaleString()}
                                        </span>
                                    ) : null}
                                </div>
                            </div>
                            <button
                                type="button"
                                className="btn btn-sm btn-ghost"
                                onClick={() => onRestore(a)}
                                data-testid={`article-trash-restore-${a.id}`}
                                title={t("ui.articles.restore", "Wiederherstellen")}
                            >
                                <RotateCcw size={14} />
                                {t("ui.articles.restore", "Wiederherstellen")}
                            </button>
                            <button
                                type="button"
                                className="btn btn-sm btn-ghost"
                                onClick={() => onPermanentDelete(a)}
                                data-testid={`article-trash-permanent-${a.id}`}
                                title={t("ui.articles.delete_permanent", "Endgültig löschen")}
                                style={{ color: "var(--danger)" }}
                            >
                                <Trash2 size={14} />
                                {t("ui.articles.delete_permanent", "Endgültig löschen")}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
