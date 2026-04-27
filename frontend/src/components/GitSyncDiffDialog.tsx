import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
    X,
    Check,
    AlertTriangle,
    Plus,
    Minus,
    GitBranch,
    Loader2,
    ArrowRight,
} from "lucide-react";
import {
    api,
    ApiError,
    GitSyncDiffClassification,
    GitSyncDiffEntry,
    GitSyncDiffResponse,
    GitSyncResolutionEntry,
} from "../api/client";
import { useI18n } from "../hooks/useI18n";
import { notify } from "../utils/notify";

/**
 * PGS-03 conflict resolution dialog.
 *
 * Per chapter the user chooses Keep Bibliogon (DB unchanged),
 * Take from Repo (DB overwritten with the remote markdown), or
 * Mark Conflict (PGS-03-FU-01 - rewrites the chapter content with
 * git-style conflict markers so the user can resolve in the editor;
 * only offered on ``both_changed`` rows).
 *
 * Default action per row mirrors the classification:
 * - unchanged / *_added / *_removed - keep_local (safest default)
 * - remote_changed - take_remote (clearly the user wants the upstream)
 * - renamed_remote - take_remote (accept the rename; body identical)
 * - local_changed / both_changed - keep_local (no surprise data loss)
 */
interface Props {
    open: boolean;
    bookId: string;
    onClose: () => void;
    /** Fired after a successful resolve so the parent can re-fetch
     *  status / refresh the editor view. */
    onResolved?: () => void;
}

type Action = GitSyncResolutionEntry["action"];

function defaultAction(c: GitSyncDiffClassification): Action {
    if (c === "remote_changed" || c === "remote_added" || c === "renamed_remote") {
        return "take_remote";
    }
    return "keep_local";
}

function isResolvable(c: GitSyncDiffClassification): boolean {
    return c !== "unchanged";
}

export default function GitSyncDiffDialog({
    open,
    bookId,
    onClose,
    onResolved,
}: Props) {
    const { t } = useI18n();
    const [diff, setDiff] = useState<GitSyncDiffResponse | null>(null);
    const [actions, setActions] = useState<Record<string, Action>>({});
    const [loading, setLoading] = useState(false);
    const [resolving, setResolving] = useState(false);

    useEffect(() => {
        if (!open) return;
        void load();
    }, [open, bookId]);

    async function load(): Promise<void> {
        setLoading(true);
        try {
            const next = await api.gitSync.diff(bookId);
            setDiff(next);
            const seed: Record<string, Action> = {};
            for (const ch of next.chapters) {
                seed[`${ch.section}/${ch.slug}`] = defaultAction(ch.classification);
            }
            setActions(seed);
        } catch (err) {
            if (err instanceof ApiError) {
                notify.error(
                    t("ui.git_sync.diff_error", "Konnte Diff nicht laden."),
                    err,
                );
            }
        } finally {
            setLoading(false);
        }
    }

    async function handleApply(): Promise<void> {
        if (!diff) return;
        const resolutions: GitSyncResolutionEntry[] = diff.chapters
            .filter((ch) => isResolvable(ch.classification))
            .map((ch) => ({
                section: ch.section,
                slug: ch.slug,
                action: actions[`${ch.section}/${ch.slug}`] ?? "keep_local",
            }));
        setResolving(true);
        try {
            const result = await api.gitSync.resolve(bookId, resolutions);
            notify.success(
                t(
                    "ui.git_sync.resolve_success_v2",
                    "Aktualisiert {updated}, neu {created}, geloescht {deleted}, umbenannt {renamed}, mit Konflikt-Markern {marked}",
                )
                    .replace("{updated}", String(result.counts.updated))
                    .replace("{created}", String(result.counts.created))
                    .replace("{deleted}", String(result.counts.deleted))
                    .replace("{renamed}", String(result.counts.renamed))
                    .replace("{marked}", String(result.counts.marked)),
            );
            onResolved?.();
            onClose();
        } catch (err) {
            if (err instanceof ApiError) {
                notify.error(
                    t("ui.git_sync.resolve_error", "Auflösung fehlgeschlagen."),
                    err,
                );
            }
        } finally {
            setResolving(false);
        }
    }

    const actionable =
        diff?.chapters.filter((c) => isResolvable(c.classification)) ?? [];
    const unchangedCount =
        diff?.chapters.filter((c) => c.classification === "unchanged").length ?? 0;

    return (
        <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
            <Dialog.Portal>
                <Dialog.Overlay className="dialog-overlay" />
                <Dialog.Content
                    className="dialog-content dialog-content-wide"
                    data-testid="git-sync-diff-dialog"
                    style={{ maxWidth: 760 }}
                >
                    <div className="dialog-header">
                        <Dialog.Title className="dialog-title">
                            <GitBranch
                                size={18}
                                style={{ verticalAlign: -3, marginRight: 8 }}
                            />
                            {t("ui.git_sync.diff_title", "Aenderungen vom Repo zusammenfuehren")}
                        </Dialog.Title>
                        <Dialog.Close
                            className="dialog-close"
                            aria-label={t("ui.common.close", "Schliessen")}
                        >
                            <X size={18} />
                        </Dialog.Close>
                    </div>

                    {loading && !diff ? (
                        <div
                            data-testid="git-sync-diff-loading"
                            style={{ padding: 16, color: "var(--text-muted)" }}
                        >
                            {t("ui.common.loading", "Laedt...")}
                        </div>
                    ) : !diff ? null : actionable.length === 0 ? (
                        <NothingToResolveNotice unchangedCount={unchangedCount} />
                    ) : (
                        <>
                            <p
                                data-testid="git-sync-diff-summary"
                                style={{
                                    margin: "4px 0 12px 0",
                                    fontSize: "0.875rem",
                                    color: "var(--text-muted)",
                                }}
                            >
                                {t(
                                    "ui.git_sync.diff_summary",
                                    "{count} Kapitel mit Aenderungen, {unchanged} unveraendert.",
                                )
                                    .replace("{count}", String(actionable.length))
                                    .replace("{unchanged}", String(unchangedCount))}
                            </p>
                            <ul
                                data-testid="git-sync-diff-list"
                                style={{
                                    listStyle: "none",
                                    padding: 0,
                                    margin: 0,
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 8,
                                    maxHeight: "55vh",
                                    overflowY: "auto",
                                }}
                            >
                                {actionable.map((ch) => (
                                    <DiffRow
                                        key={`${ch.section}/${ch.slug}`}
                                        chapter={ch}
                                        action={
                                            actions[`${ch.section}/${ch.slug}`] ??
                                            defaultAction(ch.classification)
                                        }
                                        onActionChange={(next) =>
                                            setActions((prev) => ({
                                                ...prev,
                                                [`${ch.section}/${ch.slug}`]: next,
                                            }))
                                        }
                                    />
                                ))}
                            </ul>
                            <div className="dialog-footer">
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={onClose}
                                    data-testid="git-sync-diff-cancel"
                                >
                                    {t("ui.common.cancel", "Abbrechen")}
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    disabled={resolving}
                                    onClick={handleApply}
                                    data-testid="git-sync-diff-apply"
                                >
                                    {resolving ? (
                                        <Loader2 size={14} className="spin" />
                                    ) : (
                                        <Check size={14} />
                                    )}
                                    {t(
                                        "ui.git_sync.diff_apply",
                                        "Auflösungen anwenden",
                                    )}
                                </button>
                            </div>
                        </>
                    )}
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

function NothingToResolveNotice({
    unchangedCount,
}: {
    unchangedCount: number;
}) {
    const { t } = useI18n();
    return (
        <div
            data-testid="git-sync-diff-empty"
            style={{
                padding: 16,
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                marginTop: 8,
            }}
        >
            <Check
                size={14}
                style={{
                    verticalAlign: -2,
                    marginRight: 6,
                    color: "var(--success, #16a34a)",
                }}
            />
            {t(
                "ui.git_sync.diff_empty",
                "Keine Aenderungen zwischen Bibliogon und Repo. {count} Kapitel unveraendert.",
            ).replace("{count}", String(unchangedCount))}
        </div>
    );
}

function DiffRow({
    chapter,
    action,
    onActionChange,
}: {
    chapter: GitSyncDiffEntry;
    action: Action;
    onActionChange: (next: Action) => void;
}) {
    const { t } = useI18n();
    return (
        <li
            data-testid={`git-sync-diff-row-${chapter.section}-${chapter.slug}`}
            data-classification={chapter.classification}
            style={{
                padding: 10,
                border: "1px solid var(--border)",
                borderRadius: 6,
                background: "var(--bg-primary)",
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
            }}
        >
            <ClassificationBadge classification={chapter.classification} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: "0.9375rem" }}>
                    {chapter.title}
                </div>
                <div
                    style={{
                        fontSize: "0.75rem",
                        color: "var(--text-muted)",
                        marginTop: 2,
                    }}
                >
                    {chapter.section}/{chapter.slug}
                </div>
                {chapter.rename_from && (
                    <div
                        data-testid={`git-sync-diff-rename-from-${chapter.slug}`}
                        style={{
                            fontSize: "0.75rem",
                            color: "var(--text-muted)",
                            marginTop: 4,
                            fontStyle: "italic",
                        }}
                    >
                        {t(
                            "ui.git_sync.diff_renamed_from",
                            "Umbenannt von {section}/{slug}",
                        )
                            .replace("{section}", chapter.rename_from.section)
                            .replace("{slug}", chapter.rename_from.slug)}
                    </div>
                )}
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button
                    type="button"
                    className={`btn btn-sm ${
                        action === "keep_local" ? "btn-primary" : "btn-secondary"
                    }`}
                    onClick={() => onActionChange("keep_local")}
                    data-testid={`git-sync-diff-keep-${chapter.slug}`}
                    title={t(
                        "ui.git_sync.diff_keep_tooltip",
                        "Bibliogon-Stand behalten (kein DB-Update)",
                    )}
                >
                    {t("ui.git_sync.diff_keep_local", "Bibliogon")}
                </button>
                <button
                    type="button"
                    className={`btn btn-sm ${
                        action === "take_remote" ? "btn-primary" : "btn-secondary"
                    }`}
                    onClick={() => onActionChange("take_remote")}
                    data-testid={`git-sync-diff-take-${chapter.slug}`}
                    title={t(
                        "ui.git_sync.diff_take_tooltip",
                        "Repo-Stand uebernehmen (DB wird ueberschrieben)",
                    )}
                >
                    {t("ui.git_sync.diff_take_remote", "Repo")}
                </button>
                {chapter.classification === "both_changed" && (
                    <button
                        type="button"
                        className={`btn btn-sm ${
                            action === "mark_conflict"
                                ? "btn-primary"
                                : "btn-secondary"
                        }`}
                        onClick={() => onActionChange("mark_conflict")}
                        data-testid={`git-sync-diff-mark-conflict-${chapter.slug}`}
                        title={t(
                            "ui.git_sync.diff_mark_conflict_tooltip",
                            "Beide Versionen mit Konflikt-Markern in das Kapitel schreiben (manuell aufloesen)",
                        )}
                    >
                        {t("ui.git_sync.diff_mark_conflict", "Konflikt")}
                    </button>
                )}
            </div>
        </li>
    );
}

function ClassificationBadge({
    classification,
}: {
    classification: GitSyncDiffClassification;
}) {
    const { t } = useI18n();
    const label = (() => {
        switch (classification) {
            case "remote_changed":
                return t("ui.git_sync.diff_label_remote_changed", "Repo geaendert");
            case "local_changed":
                return t(
                    "ui.git_sync.diff_label_local_changed",
                    "Bibliogon geaendert",
                );
            case "both_changed":
                return t("ui.git_sync.diff_label_both_changed", "Konflikt");
            case "remote_added":
                return t("ui.git_sync.diff_label_remote_added", "Repo neu");
            case "local_added":
                return t(
                    "ui.git_sync.diff_label_local_added",
                    "Bibliogon neu",
                );
            case "remote_removed":
                return t(
                    "ui.git_sync.diff_label_remote_removed",
                    "Im Repo geloescht",
                );
            case "local_removed":
                return t(
                    "ui.git_sync.diff_label_local_removed",
                    "In Bibliogon geloescht",
                );
            case "renamed_remote":
                return t(
                    "ui.git_sync.diff_label_renamed_remote",
                    "Im Repo umbenannt",
                );
            case "renamed_local":
                return t(
                    "ui.git_sync.diff_label_renamed_local",
                    "In Bibliogon umbenannt",
                );
            case "unchanged":
                return t("ui.git_sync.diff_label_unchanged", "Unveraendert");
        }
    })();
    const icon = (() => {
        switch (classification) {
            case "both_changed":
                return <AlertTriangle size={12} />;
            case "remote_added":
            case "local_added":
                return <Plus size={12} />;
            case "remote_removed":
            case "local_removed":
                return <Minus size={12} />;
            case "renamed_remote":
            case "renamed_local":
                return <ArrowRight size={12} />;
            default:
                return <GitBranch size={12} />;
        }
    })();
    const isConflict = classification === "both_changed";
    return (
        <span
            data-testid="git-sync-diff-badge"
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "2px 6px",
                fontSize: "0.6875rem",
                borderRadius: 4,
                background: isConflict ? "var(--accent-light)" : "var(--bg-card)",
                color: isConflict ? "var(--accent-hover)" : "var(--text-muted)",
                border: "1px solid var(--border)",
                fontWeight: 500,
                whiteSpace: "nowrap",
                marginTop: 2,
            }}
        >
            {icon}
            {label}
        </span>
    );
}
