import { ChevronLeft, LayoutGrid, List as ListIcon, Trash, Trash2 } from "lucide-react";
import {
    EntityTrashView,
    EntityTileView,
    EntityViewSwitcher,
    EntityEmptyState,
    type EntityDescriptor,
} from "@astrapi69/entity-kit";

import { Book } from "../api/client";
import { EmptyState } from "./EmptyState";
import styles from "../pages/Dashboard.module.css";

type Translate = (key: string, fallback: string) => string;

/** Books trash surface for the Dashboard: header chrome (back + count +
 *  empty-trash + view switcher) plus the entity-kit tile / list trash
 *  views. Renders from props with no page-state coupling. */
export default function DashboardTrashView({
    trash,
    trashViewMode,
    setTrashViewMode,
    trashDescriptor,
    onBack,
    onEmptyTrash,
    onTrashAction,
    t,
}: {
    trash: Book[];
    trashViewMode: "grid" | "list";
    setTrashViewMode: (mode: "grid" | "list") => void;
    trashDescriptor: EntityDescriptor<Book>;
    onBack: () => void;
    onEmptyTrash: () => void;
    onTrashAction: (actionId: string, book: Book) => void;
    t: Translate;
}) {
    return (
        <div data-testid="trash-view">
            <div className={styles.mainHeader}>
                <button
                    className="btn-icon"
                    onClick={onBack}
                    title={t("ui.dashboard.back", "Zurück")}
                >
                    <ChevronLeft size={18} />
                </button>
                <Trash2 size={20} className="muted" />
                <h2 className={styles.mainTitle}>{t("ui.dashboard.trash", "Papierkorb")}</h2>
                <span className={styles.bookCount}>
                    {trash.length}{" "}
                    {trash.length === 1
                        ? t("ui.dashboard.book_singular", "Buch")
                        : t("ui.dashboard.book_plural", "Bücher")}
                </span>
                <div style={{ flex: 1 }} />
                {trash.length > 0 && (
                    <button
                        className="btn btn-danger btn-sm"
                        data-testid="trash-empty"
                        onClick={onEmptyTrash}
                    >
                        <Trash size={14} /> {t("ui.dashboard.empty_trash", "Papierkorb leeren")}
                    </button>
                )}
                <EntityViewSwitcher
                    mode={trashViewMode === "grid" ? "tile" : "list"}
                    onChange={(m) => setTrashViewMode(m === "tile" ? "grid" : "list")}
                    options={[
                        {
                            mode: "list",
                            label: t("ui.dashboard.view_list", "Listen-Ansicht"),
                            icon: <ListIcon size={16} />,
                        },
                        {
                            mode: "tile",
                            label: t("ui.dashboard.view_grid", "Kachel-Ansicht"),
                            icon: <LayoutGrid size={16} />,
                        },
                    ]}
                    classNames={{
                        group: "inline-flex overflow-hidden rounded-[var(--radius-sm)] border border-border bg-card",
                        button: "inline-flex items-center px-[10px] py-[6px] text-muted-foreground",
                        activeButton: "bg-primary text-white",
                        label: "sr-only",
                    }}
                />
            </div>
            {trash.length === 0 ? (
                <EmptyState
                    testId="trash-empty-state"
                    icon={<Trash2 size={48} strokeWidth={1} color="var(--text-muted)" />}
                    title={t("ui.dashboard.trash_empty", "Papierkorb ist leer")}
                />
            ) : trashViewMode === "grid" ? (
                <div data-testid="trash-grid">
                    <EntityTileView
                        items={trash}
                        descriptor={trashDescriptor}
                        onAction={onTrashAction}
                        classNames={{
                            grid: "grid gap-3 auto-rows-fr [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]",
                            tile: "flex h-full flex-col gap-1 rounded-[var(--radius-md)] border border-border p-3 bg-card",
                            title: "font-semibold",
                            subtitle: "text-sm text-muted-foreground",
                            actions: "mt-auto flex gap-2 pt-2",
                            actionButton: "btn btn-primary btn-sm",
                            dangerActionButton: "btn btn-danger btn-sm",
                        }}
                    />
                </div>
            ) : (
                <div data-testid="trash-list">
                    <EntityTrashView
                        items={trash}
                        descriptor={trashDescriptor}
                        prefiltered
                        onAction={onTrashAction}
                        restoreLabel={t("ui.dashboard.restore_book", "Wiederherstellen")}
                        permanentDeleteLabel={t("ui.dashboard.delete_permanent", "Endgültig löschen")}
                        emptyState={
                            <EntityEmptyState
                                title={t("ui.dashboard.trash_empty", "Papierkorb ist leer")}
                            />
                        }
                        classNames={{
                            container: "rounded-[var(--radius-md)] border border-border",
                            list: {
                                root: "overflow-x-auto",
                                table: "w-full border-collapse text-foreground",
                                head: "border-b border-border",
                                header: "px-3 py-2 text-left text-sm font-semibold text-muted-foreground",
                                headerActions: "px-3 py-2 text-right",
                                sortButton: "inline-flex items-center gap-1",
                                row: "border-b border-border",
                                cell: "px-3 py-2 align-middle",
                                actionsCell: "px-3 py-2 text-right whitespace-nowrap",
                                actions: "inline-flex gap-2 justify-end",
                                actionButton: "btn btn-primary btn-sm",
                                dangerActionButton: "btn btn-danger btn-sm",
                                pagination: "flex items-center gap-2 p-2",
                                pageButton: "btn btn-secondary btn-sm",
                                pageStatus: "text-sm text-muted-foreground",
                            },
                        }}
                    />
                </div>
            )}
        </div>
    );
}
