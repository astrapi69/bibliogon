import { useEffect, useRef, useState, useCallback } from "react";
import {
    api,
    ApiError,
    SaveAbortedError,
    BookDetail,
    ChapterType,
} from "../../api/client";
import type { ConflictInfo } from "../../components/import/ConflictResolutionDialog";
import { getStorage } from "../../storage";
import { useDialog } from "../../components/shared/AppDialog";
import { notify } from "../../utils/platform/notify";
import { useI18n } from "../../hooks/useI18n";
import { chapterTypeLabels } from "../../lib/chapterTypeLabels";

interface BookEditorDataParams {
    bookId: string | undefined;
    activeChapterId: string | null;
    setActiveChapterId: (
        next: string | null | ((prev: string | null) => string | null),
    ) => void;
    offlineGate: boolean;
}

interface EditorSettings {
    autosave_debounce_ms?: number;
    draft_save_debounce_ms?: number;
    draft_max_age_days?: number;
    ai_context_chars?: number;
}

/**
 * Owns the BookEditor's data + persistence layer: book load, chapter
 * content load, metadata save, chapter CRUD/reorder, version-conflict
 * resolution, git-sync status, and the editor-settings probe.
 *
 * Extracted from BookEditor.tsx (god-file split, #207) as a pure
 * structural move — behaviour is unchanged. The page keeps view/sidebar
 * state + render; this hook keeps everything that talks to the storage
 * seam.
 *
 * @example
 * const data = useBookEditorData({ bookId, activeChapterId, setActiveChapterId, offlineGate });
 * data.book; data.handleSaveContent(content);
 */
export function useBookEditorData({
    bookId,
    activeChapterId,
    setActiveChapterId,
    offlineGate,
}: BookEditorDataParams) {
    const dialog = useDialog();
    const { t } = useI18n();
    const TYPE_LABELS = chapterTypeLabels(t);

    const [book, setBook] = useState<BookDetail | null>(null);
    const [allBooks, setAllBooks] = useState<import("../../api/client").Book[]>([]);
    const [gitSyncState, setGitSyncState] = useState<string | null>(null);
    const [gitSyncMapped, setGitSyncMapped] = useState(false);
    const [conflict, setConflict] = useState<ConflictInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [editorSettings, setEditorSettings] = useState<EditorSettings>({});
    const [loadedContent, setLoadedContent] = useState<{
        id: string;
        content: string;
    } | null>(null);
    const [contentLoading, setContentLoading] = useState(false);

    const activeChapterMeta = book?.chapters.find((c) => c.id === activeChapterId) ?? null;

    // Authoritative per-chapter version (chapterId -> version). Seeded on
    // content load and updated synchronously from every successful save /
    // rename / conflict response, so a rapid second autosave sends the
    // post-bump version instead of the stale one from the lagging `book`
    // state (the 409 self-conflict). The api client's per-chapter
    // AbortController already gives latest-save-wins at the network layer.
    const chapterVersions = useRef<Record<string, number>>({});

    // Fetch chapter content when active chapter changes
    useEffect(() => {
        if (!bookId || !activeChapterId) {
            setLoadedContent(null);
            return;
        }
        if (loadedContent?.id === activeChapterId) return;
        setContentLoading(true);
        getStorage()
            .chapters.get(bookId, activeChapterId)
            .then((ch) => {
                chapterVersions.current[ch.id] = ch.version;
                setLoadedContent({ id: ch.id, content: ch.content });
            })
            .catch(() => notify.error(t("ui.common.error", "Fehler beim Laden")))
            .finally(() => setContentLoading(false));
    }, [bookId, activeChapterId]); // eslint-disable-line react-hooks/exhaustive-deps

    const refreshGitSync = useCallback(async () => {
        if (!bookId || offlineGate) return;
        try {
            const sync = await api.git.syncStatus(bookId);
            setGitSyncState(sync.state);
        } catch {
            // Non-fatal: repo may not be initialized yet.
            setGitSyncState(null);
        }
    }, [bookId, offlineGate]);

    const refreshGitSyncMapping = useCallback(async () => {
        if (!bookId || offlineGate) return;
        try {
            const mapping = await api.gitSync.status(bookId);
            setGitSyncMapped(mapping.mapped);
        } catch {
            // Non-fatal: 200/{mapped:false} is the normal "no mapping"
            // shape so anything that throws is a server/network blip;
            // hide the button rather than spam toasts.
            setGitSyncMapped(false);
        }
    }, [bookId, offlineGate]);

    // Bootstrap effect: load book + app settings + book list.
    //
    // StrictMode in dev mode (frontend/src/main.tsx) re-runs effects
    // after a synthetic unmount/remount cycle. Without the cancel
    // guard below, both mounts trigger ``loadBook``; the second
    // response calls ``setBook`` after the user has already started
    // editing, and the new ``book`` object reference cascades into
    // BookMetadataEditor's ``useEffect([book])`` which resets the
    // user's local form/keyword state. The keywords-editor smoke
    // tests caught this as "the first keyword added is dropped".
    useEffect(() => {
        let cancelled = false;
        const runLoad = async () => {
            if (!bookId) return;
            try {
                const data = await getStorage().books.get(bookId);
                if (cancelled) return;
                setBook(data);
                if (data.chapters.length > 0) {
                    setActiveChapterId((prev) => {
                        if (prev && data.chapters.some((c) => c.id === prev)) return prev;
                        return data.chapters[0].id;
                    });
                } else {
                    setActiveChapterId(null);
                }
                void refreshGitSync();
                void refreshGitSyncMapping();
            } catch (err) {
                if (!cancelled) console.error("Failed to load book:", err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        void runLoad();
        getStorage()
            .settings.getApp()
            .then((cfg) => {
                if (cancelled) return;
                const ed = (cfg as Record<string, unknown>).editor as
                    | Record<string, number>
                    | undefined;
                if (ed) setEditorSettings(ed);
            })
            .catch(() => {});
        getStorage()
            .books.list()
            .then((list) => {
                if (cancelled) return;
                setAllBooks(list);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bookId]);

    const handleSaveMetadata = async (data: Record<string, unknown>) => {
        if (!bookId) return;
        const updated = await getStorage().books.update(
            bookId,
            data as Partial<import("../../api/client").BookCreate>,
        );
        setBook((prev) => (prev ? { ...prev, ...updated } : prev));
    };

    const handleAddChapter = async (chapterType?: ChapterType) => {
        if (!bookId) return;
        const typeLabel = chapterType ? TYPE_LABELS[chapterType] : "Kapitel";
        const title = await dialog.prompt(
            `${typeLabel} erstellen`,
            `Titel für das neue ${typeLabel}:`,
            `z.B. Mein ${typeLabel}`,
        );
        if (!title) return;
        const chapter = await getStorage().chapters.create(bookId, {
            title: title.trim(),
            chapter_type: chapterType || "chapter",
        });
        setBook((prev) => {
            if (!prev) return prev;
            return { ...prev, chapters: [...prev.chapters, chapter] };
        });
        setActiveChapterId(chapter.id);
    };

    const handleAddChapterFromTemplate = async (
        template: import("../../api/client").ChapterTemplate,
    ) => {
        if (!bookId) return;
        const childIds = template.child_template_ids ?? [];
        // Group template: insert one chapter per child, in list order.
        // Insertion is intentionally NOT transactional here - on a
        // mid-loop failure the chapters created so far stay so the user
        // can decide whether to retry the rest or delete the partial
        // result.
        if (childIds.length > 0) {
            try {
                const children = await Promise.all(
                    childIds.map((cid) => api.chapterTemplates.get(cid)),
                );
                const created: import("../../api/client").Chapter[] = [];
                for (const child of children) {
                    const chapter = await getStorage().chapters.create(bookId, {
                        title: child.name,
                        chapter_type: child.chapter_type,
                        content: child.content ?? "",
                    });
                    created.push(chapter);
                }
                setBook((prev) => {
                    if (!prev) return prev;
                    return { ...prev, chapters: [...prev.chapters, ...created] };
                });
                if (created.length > 0) setActiveChapterId(created[0].id);
                notify.success(
                    t(
                        "ui.chapter_template_picker.inserted_group",
                        "{count} Kapitel aus Gruppe eingefügt",
                    ).replace("{count}", String(created.length)),
                );
            } catch (err) {
                notify.error(
                    t("ui.chapter_template_picker.insert_failed", "Einfügen fehlgeschlagen"),
                );
                throw err;
            }
            return;
        }

        try {
            const chapter = await getStorage().chapters.create(bookId, {
                title: template.name,
                chapter_type: template.chapter_type,
                content: template.content ?? "",
            });
            setBook((prev) => {
                if (!prev) return prev;
                return { ...prev, chapters: [...prev.chapters, chapter] };
            });
            setActiveChapterId(chapter.id);
            notify.success(
                t("ui.chapter_template_picker.inserted", "Kapitel aus Vorlage eingefügt"),
            );
        } catch (err) {
            notify.error(
                t("ui.chapter_template_picker.insert_failed", "Einfügen fehlgeschlagen"),
                err,
            );
            throw err;
        }
    };

    const handleRenameChapter = async (chapterId: string, newTitle: string) => {
        if (!bookId) return;
        const current = book?.chapters.find((c) => c.id === chapterId);
        if (!current) return;
        try {
            const updated = await getStorage().chapters.update(bookId, chapterId, {
                title: newTitle,
                version: chapterVersions.current[chapterId] ?? current.version,
            });
            chapterVersions.current[updated.id] = updated.version;
            setBook((prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    chapters: prev.chapters.map((c) =>
                        c.id === updated.id
                            ? { ...c, title: updated.title, version: updated.version }
                            : c,
                    ),
                };
            });
        } catch (err) {
            // A newer rename superseded this one; the later one will
            // resolve state. No user-visible error.
            if (err instanceof SaveAbortedError) return;
            notify.error(t("ui.editor.rename_failed", "Umbenennen fehlgeschlagen"), err);
        }
    };

    const handleDeleteChapter = async (chapterId: string) => {
        if (!bookId) return;
        if (
            !(await dialog.confirm(
                t("ui.editor.delete_chapter_title", "Kapitel löschen"),
                t("ui.editor.delete_chapter_confirm", "Kapitel wirklich löschen?"),
                "danger",
            ))
        )
            return;
        await getStorage().chapters.delete(bookId, chapterId);
        setBook((prev) => {
            if (!prev) return prev;
            const chapters = prev.chapters.filter((c) => c.id !== chapterId);
            return { ...prev, chapters };
        });
        if (activeChapterId === chapterId) {
            setActiveChapterId(book?.chapters.find((c) => c.id !== chapterId)?.id ?? null);
        }
    };

    const handleSaveContent = async (content: string) => {
        if (!bookId || !activeChapterId) return;
        const current = book?.chapters.find((c) => c.id === activeChapterId);
        if (!current) return;
        try {
            // Rethrow on failure so the Editor sees the error and sets
            // its status to "error" instead of lying with "saved". 409
            // (version_conflict) is caught below and routed into the
            // conflict resolution dialog.
            const updated = await getStorage().chapters.update(bookId, activeChapterId, {
                content,
                version: chapterVersions.current[activeChapterId] ?? current.version,
            });
            chapterVersions.current[updated.id] = updated.version;
            setBook((prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    chapters: prev.chapters.map((c) => (c.id === updated.id ? updated : c)),
                };
            });
        } catch (err) {
            if (err instanceof ApiError && err.status === 409 && err.detailBody) {
                const body = err.detailBody as {
                    current_version?: number;
                    server_content?: string;
                    server_title?: string;
                    server_updated_at?: string;
                };
                if (
                    typeof body.current_version === "number" &&
                    typeof body.server_content === "string"
                ) {
                    chapterVersions.current[activeChapterId] = body.current_version;
                    setConflict({
                        chapterId: activeChapterId,
                        localContent: content,
                        serverContent: body.server_content,
                        serverVersion: body.current_version,
                        serverTitle: body.server_title,
                        serverUpdatedAt: body.server_updated_at,
                    });
                }
            }
            throw err;
        }
    };

    const resolveConflictKeepLocal = async (info: ConflictInfo) => {
        if (!bookId) return;
        try {
            const updated = await getStorage().chapters.update(bookId, info.chapterId, {
                content: info.localContent,
                version: info.serverVersion,
            });
            chapterVersions.current[updated.id] = updated.version;
            setBook((prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    chapters: prev.chapters.map((c) => (c.id === updated.id ? updated : c)),
                };
            });
            setLoadedContent({ id: updated.id, content: updated.content });
            setConflict(null);
            notify.success(t("ui.conflict.saved_local", "Deine Änderungen wurden gespeichert."));
        } catch {
            notify.error(
                t(
                    "ui.conflict.save_failed_again",
                    "Speichern fehlgeschlagen. Bitte erneut versuchen.",
                ),
            );
        }
    };

    const resolveConflictDiscardLocal = (info: ConflictInfo) => {
        if (!bookId) return;
        chapterVersions.current[info.chapterId] = info.serverVersion;
        setBook((prev) => {
            if (!prev) return prev;
            return {
                ...prev,
                chapters: prev.chapters.map((c) =>
                    c.id === info.chapterId
                        ? { ...c, content: info.serverContent, version: info.serverVersion }
                        : c,
                ),
            };
        });
        setLoadedContent({ id: info.chapterId, content: info.serverContent });
        setConflict(null);
        notify.info(t("ui.conflict.server_restored", "Server-Version geladen."));
    };

    const resolveConflictSaveAsNew = async (info: ConflictInfo) => {
        if (!bookId) return;
        try {
            const sourceTitle = info.serverTitle ?? "";
            const draftSuffix = t("ui.conflict.local_draft_suffix", "(Lokaler Entwurf)");
            const forkedTitle = sourceTitle ? `${sourceTitle} ${draftSuffix}`.trim() : undefined;
            const newChapter = await api.chapters.fork(bookId, info.chapterId, {
                content: info.localContent,
                title: forkedTitle,
            });
            // Reload the book so the new chapter shows up + every
            // position bumped on the server is reflected in state.
            const fresh = await getStorage().books.get(bookId);
            for (const ch of fresh.chapters) {
                chapterVersions.current[ch.id] = ch.version;
            }
            setBook(fresh);
            // Source chapter keeps the server's content; load that
            // into the editor so the user sees the canonical version.
            setLoadedContent({ id: info.chapterId, content: info.serverContent });
            setConflict(null);
            notify.success(
                t(
                    "ui.conflict.saved_as_new_chapter",
                    'Lokale Änderungen wurden als neues Kapitel "{title}" gespeichert.',
                ).replace("{title}", newChapter.title),
            );
        } catch (err) {
            if (err instanceof ApiError) {
                notify.error(
                    t(
                        "ui.conflict.save_as_new_failed",
                        "Speichern als neues Kapitel fehlgeschlagen.",
                    ),
                    err,
                );
            }
        }
    };

    const handleReorder = async (chapterIds: string[]) => {
        if (!bookId) return;
        try {
            const reordered = await getStorage().chapters.reorder(bookId, chapterIds);
            setBook((prev) => {
                if (!prev) return prev;
                return { ...prev, chapters: reordered };
            });
        } catch (err) {
            console.error("Reorder failed:", err);
        }
    };

    const handleValidateToc = async () => {
        if (!bookId) return;
        try {
            const result = await api.chapters.validateToc(bookId);
            if (!result.toc_found) {
                notify.info(t("ui.editor.toc_not_found", "Kein Inhaltsverzeichnis gefunden."));
            } else if (result.valid) {
                notify.success(t("ui.editor.toc_valid", "TOC gültig: alle Links korrekt."));
            } else {
                const broken = result.broken.map((b) => b.text).join(", ");
                notify.error(t("ui.editor.toc_invalid", "Ungültige Links") + `: ${broken}`);
            }
        } catch {
            notify.error(t("ui.editor.toc_error", "Fehler bei der TOC-Validierung."));
        }
    };

    return {
        book,
        setBook,
        allBooks,
        loading,
        editorSettings,
        loadedContent,
        setLoadedContent,
        contentLoading,
        activeChapterMeta,
        gitSyncState,
        gitSyncMapped,
        conflict,
        handleSaveMetadata,
        handleAddChapter,
        handleAddChapterFromTemplate,
        handleRenameChapter,
        handleDeleteChapter,
        handleSaveContent,
        resolveConflictKeepLocal,
        resolveConflictDiscardLocal,
        resolveConflictSaveAsNew,
        handleReorder,
        handleValidateToc,
    };
}
