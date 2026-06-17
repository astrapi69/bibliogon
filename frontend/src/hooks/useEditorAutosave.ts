import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { api, ApiError, SaveAbortedError } from "../api/client";
import { saveDraft, deleteDraft, hashContent } from "../db/drafts";
import { notify } from "../utils/notify";
import { useFlushOnUnload } from "./useFlushOnUnload";
import { useI18n } from "./useI18n";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface AutosaveController {
    /** Current save indicator state. */
    saveStatus: SaveStatus;
    /** Run an immediate save of the given TipTap JSON (debounce already elapsed). */
    performSave: (json: string) => Promise<void>;
    /** Schedule a debounced server save + parallel IndexedDB draft write. */
    debouncedSave: (json: string) => void;
    /** Editor instance ref. The caller MUST keep it in sync (`editorRef.current = editor`). */
    editorRef: MutableRefObject<TiptapEditor | null>;
    /** Last value successfully saved to the server. Read/written by chapter-switch + restore. */
    lastSaved: MutableRefObject<string>;
    /** SHA of the current server content. Re-seeded by the recovery effect on chapter load. */
    serverContentHash: MutableRefObject<string>;
    /** The pending server-save timer. The markdown-mode handler clears it before its own save. */
    saveTimer: MutableRefObject<ReturnType<typeof setTimeout> | null>;
    setSaveStatus: (status: SaveStatus) => void;
}

/**
 * Bundle the editor's autosave concern: the dual-debounce (server save
 * + parallel IndexedDB draft), the save-status state machine, and the
 * flush-on-unload safety net.
 *
 * Owns six mutable refs (`saveTimer`, `idleTimer`, `draftTimer`,
 * `lastSaved`, `serverContentHash`, `lastAttemptedJson`) plus the
 * `editorRef` and the `flushPendingSaveRef`. The refs that genuinely
 * cross the seam back into the editor (`editorRef`, `lastSaved`,
 * `serverContentHash`, `saveTimer`) are returned rather than wrapped in
 * a context, so the chapter-switch / draft-recovery / markdown-mode /
 * restore code paths in the host component read and write them
 * directly, preserving the exact prior behavior.
 *
 * The caller wires `editorRef.current = editor` in its own effect once
 * the TipTap instance is constructed (this hook runs before
 * `useEditor`, so it cannot take the instance as an argument).
 */
export function useEditorAutosave(args: {
    onSave: (json: string) => void | Promise<void>;
    content: string;
    chapterId?: string;
    bookId?: string;
    chapterVersion?: number;
    autosaveDebounceMs: number;
    draftSaveDebounceMs: number;
}): AutosaveController {
    const {
        onSave,
        content,
        chapterId,
        bookId,
        chapterVersion,
        autosaveDebounceMs,
        draftSaveDebounceMs,
    } = args;
    const { t } = useI18n();

    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Pending "saved" -> "idle" reset. Tracked so a NEW save cycle can
    // cancel a prior reset: without this, the idle-timer from save N
    // fires ~2s later and clobbers save N+1's "saved" status (set just
    // before), flickering the indicator off early on rapid sequential
    // autosaves. (Found via content-safety version-history smoke.)
    const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSaved = useRef(content);
    const serverContentHash = useRef(hashContent(content));
    const lastAttemptedJson = useRef<string | null>(null);
    const editorRef = useRef<TiptapEditor | null>(null);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

    const performSave = useCallback(
        async (json: string) => {
            if (json === lastSaved.current) {
                setSaveStatus("idle");
                return;
            }
            lastAttemptedJson.current = json;
            setSaveStatus("saving");
            try {
                await onSave(json);
            } catch (err) {
                if (err instanceof SaveAbortedError) {
                    // A newer save for the same chapter superseded us.
                    // Leave the status to the newer call to resolve.
                    return;
                }
                console.error("Autosave failed:", err);
                setSaveStatus("error");
                // Three suppress-toast cases:
                // - 409 (version_conflict): the BookEditor opens the
                //   conflict dialog; a retry toast would duplicate the
                //   signal and the retry action is wrong (wrong version)
                // - offline: OfflineBanner already tells the user;
                //   reconnect will auto-flush the IndexedDB draft
                // All other errors: show the retry toast.
                const isConflict = err instanceof ApiError && err.status === 409;
                const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
                if (!isConflict && !isOffline) {
                    notify.saveError(
                        t(
                            "ui.editor.save_failed",
                            "Speichern fehlgeschlagen. Deine Änderungen sind lokal gesichert.",
                        ),
                        () => {
                            void performSave(json);
                        },
                        t("ui.editor.save_retry", "Erneut versuchen"),
                    );
                }
                return;
            }
            lastSaved.current = json;
            if (chapterId) deleteDraft(chapterId);
            serverContentHash.current = hashContent(json);
            setSaveStatus("saved");
            // Reset to idle after 2s, cancelling any prior reset so a
            // newer "saved" isn't clobbered by an older save's timer.
            if (idleTimer.current) clearTimeout(idleTimer.current);
            idleTimer.current = setTimeout(() => setSaveStatus("idle"), 2000);
        },
        [onSave, chapterId, t],
    );

    const debouncedSave = useCallback(
        (json: string) => {
            if (saveTimer.current) clearTimeout(saveTimer.current);
            // A new edit starts a fresh save cycle; cancel any pending
            // "saved" -> "idle" reset so it can't flip the indicator to
            // idle mid-cycle.
            if (idleTimer.current) {
                clearTimeout(idleTimer.current);
                idleTimer.current = null;
            }
            setSaveStatus("saving");
            saveTimer.current = setTimeout(() => {
                void performSave(json);
            }, autosaveDebounceMs);

            // Save draft to IndexedDB (parallel to server save, independent debounce).
            // This is the safety net: even if the server save later fails, the
            // local draft is already written.
            if (chapterId && bookId) {
                if (draftTimer.current) clearTimeout(draftTimer.current);
                draftTimer.current = setTimeout(() => {
                    saveDraft(chapterId, bookId, json, serverContentHash.current);
                }, draftSaveDebounceMs);
            }
        },
        [performSave, chapterId, bookId, autosaveDebounceMs, draftSaveDebounceMs],
    );

    // Flush pending saves on tab close / page unload / backgrounding. Uses
    // IndexedDB (Dexie writes via a transaction queue that survives the
    // tab dying) plus a best-effort keepalive fetch.
    const flushPendingSaveRef = useRef<() => void>(() => {});
    useFlushOnUnload(() => flushPendingSaveRef.current());

    // Keep the flush callback fresh: on every render capture the current
    // chapterId, bookId, and editor. Invoked from beforeunload/pagehide/
    // visibilitychange handlers installed by `useFlushOnUnload` above.
    useEffect(() => {
        flushPendingSaveRef.current = () => {
            if (saveTimer.current) {
                clearTimeout(saveTimer.current);
                saveTimer.current = null;
            }
            if (draftTimer.current) {
                clearTimeout(draftTimer.current);
                draftTimer.current = null;
            }
            const editorInstance = editorRef.current;
            if (!editorInstance || !chapterId || !bookId) return;
            let json: string;
            try {
                json = JSON.stringify(editorInstance.getJSON());
            } catch {
                return;
            }
            if (json === lastSaved.current) return;
            // 1) IndexedDB write is the authoritative fallback.
            void saveDraft(chapterId, bookId, json, serverContentHash.current);
            // 2) Best-effort keepalive PATCH - may succeed or may be dropped;
            //    the IndexedDB draft covers it either way. Skipped if we do
            //    not have a current version (e.g. chapter still loading); the
            //    draft path still saves locally.
            if (typeof chapterVersion === "number") {
                api.chapters.updateKeepalive(bookId, chapterId, {
                    content: json,
                    version: chapterVersion,
                });
            }
        };
    });

    // Cancel the pending server-save timer on unmount. (The review SSE
    // cleanup lives in its own hook; this hook owns only the save timer.)
    useEffect(() => {
        return () => {
            if (saveTimer.current) clearTimeout(saveTimer.current);
        };
    }, []);

    return {
        saveStatus,
        performSave,
        debouncedSave,
        editorRef,
        lastSaved,
        serverContentHash,
        saveTimer,
        setSaveStatus,
    };
}
