import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogClose,
} from "@/components/ui/dialog";
import { Globe, Link2, Link2Off, Loader2, Plus, X } from "lucide-react";
import { api, ApiError, Book, TranslationSiblingsResponse } from "../api/client";
import { useI18n } from "../hooks/useI18n";
import { useFeature } from "@astrapi69/feature-strategy-react";
import { FEATURES } from "../features/featureConfig";
import { notify } from "../utils/notify";

/**
 * PGS-04 "Translations:" row for the metadata editor.
 *
 * Fetches the book's sibling list. When the book is part of a
 * group, renders a clickable language badge per sibling that
 * navigates to that book's editor. Also exposes an Unlink action
 * for users that want to detach a book from the group.
 *
 * When the book is NOT part of a group, renders nothing - the
 * link UI lives in Settings (a Translations panel that lets the
 * user pick existing books and group them manually).
 */
export default function TranslationLinks({ bookId }: { bookId: string }) {
    const { t } = useI18n();
    const translation = useFeature(FEATURES.TRANSLATION_LINKS);
    const offline = !translation.isActive;
    const navigate = useNavigate();
    const [data, setData] = useState<TranslationSiblingsResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [unlinking, setUnlinking] = useState(false);
    const [showLinkPicker, setShowLinkPicker] = useState(false);

    useEffect(() => {
        // Translations are a backend-only feature (cross-book grouping in the
        // server DB); offline there are no siblings, so skip the fetch and render
        // the unlinked state without firing an /api call.
        if (offline) return;
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bookId, offline]);

    async function load(): Promise<void> {
        setLoading(true);
        try {
            const next = await api.translations.list(bookId);
            setData(next);
        } catch (err) {
            if (err instanceof ApiError && err.status !== 404) {
                notify.error(
                    t("ui.translations.load_error", "Konnte Übersetzungen nicht laden."),
                    err,
                );
            }
        } finally {
            setLoading(false);
        }
    }

    async function handleUnlink(): Promise<void> {
        setUnlinking(true);
        try {
            await api.translations.unlink(bookId);
            notify.success(
                t("ui.translations.unlink_success", "Buch aus der Übersetzungsgruppe entfernt."),
            );
            await load();
        } catch (err) {
            if (err instanceof ApiError) {
                notify.error(t("ui.translations.unlink_error", "Entfernen fehlgeschlagen."), err);
            }
        } finally {
            setUnlinking(false);
        }
    }

    if (loading && !data) {
        return null;
    }
    const isLinked = !!(data && data.translation_group_id && data.siblings.length > 0);

    if (!isLinked) {
        return (
            <>
                <div
                    data-testid="translation-links-row-unlinked"
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 10px",
                        marginBottom: 12,
                        border: "1px dashed var(--border)",
                        borderRadius: 6,
                        fontSize: "0.8125rem",
                        color: "var(--text-muted)",
                    }}
                >
                    <Globe size={14} />
                    <span style={{ flex: 1 }}>
                        {t("ui.translations.unlinked_hint", "Keine Übersetzungen verknüpft.")}
                    </span>
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setShowLinkPicker(true)}
                        data-testid="translation-link-btn"
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                        }}
                    >
                        <Plus size={12} />
                        {t("ui.translations.link", "Verknüpfen")}
                    </button>
                </div>
                <LinkPickerDialog
                    open={showLinkPicker}
                    bookId={bookId}
                    onClose={() => setShowLinkPicker(false)}
                    onLinked={() => {
                        setShowLinkPicker(false);
                        void load();
                    }}
                />
            </>
        );
    }
    if (!data) return null;

    return (
        <div
            data-testid="translation-links-row"
            style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
                padding: "8px 10px",
                marginBottom: 12,
                border: "1px solid var(--border)",
                borderRadius: 6,
                background: "var(--bg-card)",
                fontSize: "0.8125rem",
            }}
        >
            <Globe size={14} className="muted" />
            <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>
                {t("ui.translations.label", "Übersetzungen")}:
            </span>
            <div
                style={{
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                    flex: 1,
                    minWidth: 0,
                }}
            >
                {data.siblings.map((s) => (
                    <button
                        key={s.book_id}
                        type="button"
                        data-testid={`translation-sibling-${s.language || "unknown"}`}
                        onClick={() => navigate(`/book/${s.book_id}`)}
                        title={s.title}
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "2px 8px",
                            border: "1px solid var(--border)",
                            borderRadius: 4,
                            background: "var(--bg-primary)",
                            cursor: "pointer",
                            fontSize: "0.75rem",
                            color: "var(--text-primary)",
                        }}
                    >
                        <Link2 size={11} />
                        <strong>{(s.language || "??").toUpperCase()}</strong>
                        <span
                            style={{
                                color: "var(--text-muted)",
                                maxWidth: 180,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {s.title}
                        </span>
                    </button>
                ))}
            </div>
            <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleUnlink}
                disabled={unlinking}
                data-testid="translation-unlink-btn"
                title={t("ui.translations.unlink_tooltip", "Dieses Buch aus der Gruppe entfernen")}
                style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
            >
                {unlinking ? <Loader2 size={12} className="spin" /> : <Link2Off size={12} />}
                {t("ui.translations.unlink", "Trennen")}
            </button>
        </div>
    );
}

function LinkPickerDialog({
    open,
    bookId,
    onClose,
    onLinked,
}: {
    open: boolean;
    bookId: string;
    onClose: () => void;
    onLinked: () => void;
}) {
    const { t } = useI18n();
    const [books, setBooks] = useState<Book[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);
    const [linking, setLinking] = useState(false);

    useEffect(() => {
        if (!open) return;
        setSelected(new Set());
        setLoading(true);
        api.books
            .list()
            .then((all) => setBooks(all.filter((b) => b.id !== bookId)))
            .catch((err) => {
                if (err instanceof ApiError) {
                    notify.error(
                        t("ui.translations.list_books_error", "Konnte Buchliste nicht laden."),
                        err,
                    );
                }
            })
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, bookId]);

    function toggle(id: string): void {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    async function handleLink(): Promise<void> {
        if (selected.size === 0) return;
        setLinking(true);
        try {
            await api.translations.link([bookId, ...selected]);
            notify.success(
                t("ui.translations.link_success", "Bücher als Übersetzungen verknüpft."),
            );
            onLinked();
        } catch (err) {
            if (err instanceof ApiError) {
                notify.error(t("ui.translations.link_error", "Verknüpfen fehlgeschlagen."), err);
            }
        } finally {
            setLinking(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
            <DialogContent
                size="wide"
                data-testid="translation-link-picker"
                aria-describedby={undefined}
            >
                <DialogHeader>
                    <DialogTitle>
                        {t(
                            "ui.translations.link_dialog_title",
                            "Bücher als Übersetzungen verknüpfen",
                        )}
                    </DialogTitle>
                    <DialogClose
                        className="dialog-close"
                        aria-label={t("ui.common.close", "Schließen")}
                    >
                        <X size={18} />
                    </DialogClose>
                </DialogHeader>
                {loading ? (
                    <div
                        data-testid="translation-link-picker-loading"
                        style={{ padding: 16, color: "var(--text-muted)" }}
                    >
                        {t("ui.common.loading", "Laedt...")}
                    </div>
                ) : books.length === 0 ? (
                    <p style={{ padding: 16, color: "var(--text-muted)" }}>
                        {t(
                            "ui.translations.no_other_books",
                            "Keine weiteren Bücher zum Verknüpfen vorhanden.",
                        )}
                    </p>
                ) : (
                    <ul
                        data-testid="translation-link-picker-list"
                        style={{
                            listStyle: "none",
                            padding: 0,
                            margin: 0,
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                            maxHeight: "55vh",
                            overflowY: "auto",
                        }}
                    >
                        {books.map((b) => (
                            <li
                                key={b.id}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    padding: 8,
                                    border: "1px solid var(--border)",
                                    borderRadius: 4,
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={selected.has(b.id)}
                                    onChange={() => toggle(b.id)}
                                    data-testid={`translation-link-pick-${b.id}`}
                                    aria-label={b.title}
                                />
                                <strong style={{ minWidth: 36 }}>
                                    {(b.language || "??").toUpperCase()}
                                </strong>
                                <span style={{ flex: 1, minWidth: 0 }}>{b.title}</span>
                            </li>
                        ))}
                    </ul>
                )}
                <DialogFooter sticky>
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={onClose}
                        data-testid="translation-link-cancel"
                    >
                        {t("ui.common.cancel", "Abbrechen")}
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleLink}
                        disabled={selected.size === 0 || linking}
                        data-testid="translation-link-confirm"
                    >
                        {linking ? <Loader2 size={14} className="spin" /> : <Link2 size={14} />}
                        {t("ui.translations.link_confirm", "Verknüpfen")}
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
