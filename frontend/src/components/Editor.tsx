import { useEffect, useRef, useCallback, useState } from "react";
import {
    useEditorPluginStatus,
    isPluginAvailable,
    pluginDisabledMessage,
} from "../hooks/useEditorPluginStatus";
import { useFlushOnUnload } from "../hooks/useFlushOnUnload";
import { useFullscreenToggle } from "../hooks/useFullscreenToggle";
import { useTypewriterScroll } from "../hooks/useTypewriterScroll";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useEditor, EditorContent, type Editor as TiptapEditor } from "@tiptap/react";
import {
    saveDraft,
    deleteDraft,
    checkForRecovery,
    cleanupOldDrafts,
    hashContent,
} from "../db/drafts";
import { reviewString, NON_PROSE_CHAPTER_TYPES } from "../data/ai-review-strings";
import "katex/dist/katex.min.css";
import { buildEditorExtensions } from "./editorExtensions";
import { findEnclosingSentence, FixIssueType } from "../data/fix-issue-prompts";

type Translator = (key: string, fallback: string) => string;

const ISSUE_TYPE_LABELS: Record<FixIssueType, (t: Translator) => string> = {
    passive_voice: (t) => t("ui.editor.ai_fix_issue_label_passive", "Passiv"),
    adverb: (t) => t("ui.editor.ai_fix_issue_label_adverb", "Adverb"),
    filler_word: (t) => t("ui.editor.ai_fix_issue_label_filler", "Fuellwort"),
    long_sentence: (t) => t("ui.editor.ai_fix_issue_label_long", "Langer Satz"),
};
import Toolbar from "./Toolbar";
import EditorDisplaySettingsPopover from "./EditorDisplaySettingsPopover";
import {
    buildMentionLabels,
    createStoryBibleMention,
    handleMentionClick,
} from "./storyBibleMention";
import EditorContextMenu from "./EditorContextMenu";
import { useEditorDisplaySettings } from "../hooks/useEditorDisplaySettings";
import { useI18n } from "../hooks/useI18n";
import { useFeature } from "@astrapi69/feature-strategy-react";
import { FEATURES } from "../features/featureConfig";
import { api, ApiError, SaveAbortedError } from "../api/client";
import { getStorage } from "../storage";
import { warnIfOfflineStorageNearlyFull } from "../utils/storageQuota";
import { notify } from "../utils/notify";
import { editorToMarkdown } from "../utils/tiptap-markdown";
import { markdownToHtml } from "../lib/utils/markdownToHtml";
import { parseContent, textOffsetToDocPos, buildAiPrompts } from "./editorHelpers";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface BookContext {
    title: string;
    author: string;
    language: string;
    genre: string;
    description: string;
}

// ContentKind + pluginsForContentKind live in editor-gates.ts so
// they can be imported from non-DOM unit tests without pulling in
// the entire TipTap extension graph.
export { pluginsForContentKind } from "./editor-gates";
export type { ContentKind, PluginGates } from "./editor-gates";
import type { ContentKind } from "./editor-gates";
import { pluginsForContentKind as pluginsForKind } from "./editor-gates";
import styles from "./Editor.module.css";

interface Props {
    content: string;
    onSave: (json: string) => void | Promise<void>;
    placeholder?: string;
    /** What this editor instance is editing. Defaults to
     *  "book-chapter" so existing BookEditor consumers stay
     *  unchanged. ArticleEditor passes "article". */
    contentKind?: ContentKind;
    bookId?: string;
    chapterId?: string;
    chapterTitle?: string;
    /** Chapter type (ChapterType enum value). Drives the AI review's
     *  chapter-type-specific prompt guidance and the non-prose warning
     *  shown above the review start button. */
    chapterType?: string;
    /** Current Chapter.version. Passed to keepalive PATCH on unload so
     *  the backend's optimistic-lock check passes. The normal autosave
     *  path gets version from the parent via `onSave`. */
    chapterVersion?: number;
    /** Per-chapter word target (WRITING-GOALS-PROGRESS-TRACKING-01),
     *  from the DB Chapter.target_words. Read-only here: shown as a
     *  live progress bar while writing. Set it in the Storyboard /
     *  Outliner (which own the chapter version for the PATCH). */
    targetWords?: number | null;
    bookContext?: BookContext;
    /** When set, the toolbar's "Copy" action prepends this string
     *  as a heading (Markdown: ``# documentTitle\n\n``; plain text:
     *  ``documentTitle\n\n``). Set by ArticleEditor with the
     *  article title, by BookEditor with the chapter title. */
    documentTitle?: string;
    /** Optional companion to ``documentTitle``. Rendered in
     *  Markdown as ``*subtitle*`` on its own line; in plain text
     *  on its own line beneath the title. ArticleEditor passes
     *  ``article.subtitle``; BookEditor leaves it unset (chapters
     *  have no subtitle field). */
    documentSubtitle?: string;
    autosaveDebounceMs?: number;
    draftSaveDebounceMs?: number;
    draftMaxAgeDays?: number;
    aiContextChars?: number;
    /** When set, Editor runs a one-shot style check after mount and
     *  scrolls+selects the first finding of the given type. `seq` is
     *  used as a dep so repeated navigations to the same type re-fire
     *  the jump even when chapter did not change. Set by BookEditor in
     *  response to a Quality-tab click. */
    initialFocus?: { type: string; seq: number };
    /** When set, enables Story Bible @-mention autocomplete scoped to
     *  this book (STORY-BIBLE C13). BookEditor passes the bookId only
     *  when plugin-story-bible is active. */
    mentionBookId?: string;
    /** Opens a story entity (mention click). Wired by BookEditor to the
     *  Story Bible sidebar. */
    onOpenStoryEntity?: (entityId: string) => void;
}

export default function Editor({
    content,
    onSave,
    placeholder,
    contentKind = "book-chapter",
    bookId,
    chapterId,
    chapterTitle,
    chapterType = "chapter",
    chapterVersion,
    targetWords,
    bookContext,
    documentTitle,
    documentSubtitle,
    autosaveDebounceMs = 800,
    draftSaveDebounceMs = 2000,
    draftMaxAgeDays = 30,
    aiContextChars = 2000,
    initialFocus,
    mentionBookId,
    onOpenStoryEntity,
}: Props) {
    const gates = pluginsForKind(contentKind);
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSaved = useRef(content);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
    const { t } = useI18n();
    const aiGen = useFeature(FEATURES.AI_GENERATE);
    const versionHistory = useFeature(FEATURES.VERSION_HISTORY);
    const aiGenTitle = aiGen.isDisabled
        ? t("ui.feature.requires_ai_key", "Configure your API key in Settings > AI.")
        : undefined;
    const [markdownMode, setMarkdownMode] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const [focusMode, setFocusMode] = useState(false);
    // COMPOSITION-DISTRACTION-FREE-MODE-01: umbrella distraction-free
    // mode. Session-only (not persisted - we don't want to reload
    // into a chromeless surface). Toggling it adds a `composition-mode`
    // class to document.documentElement so global CSS can hide the
    // app chrome (chapter sidebar + this editor's toolbar bar) that
    // lives outside this component, paint the backdrop, and center
    // the paper column. Escape exits; Ctrl+Shift+D toggles.
    const [compositionMode, setCompositionMode] = useState(false);
    const [showSpellcheck, setShowSpellcheck] = useState(false);
    const [spellcheckResults, setSpellcheckResults] = useState<
        {
            message: string;
            short_message: string;
            offset: number;
            length: number;
            replacements: string[];
            rule_id: string;
        }[]
    >([]);
    const [spellcheckLoading, setSpellcheckLoading] = useState(false);
    const [styleCheckActive, setStyleCheckActive] = useState(false);
    const [styleCheckLoading, setStyleCheckLoading] = useState(false);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);
    const { status: pluginStatus } = useEditorPluginStatus();
    const [showAiPanel, setShowAiPanel] = useState(false);
    const [aiSuggestion, setAiSuggestion] = useState("");
    const [aiReview, setAiReview] = useState("");
    const [aiLoading, setAiLoading] = useState(false);
    const [aiPromptType, setAiPromptType] = useState<
        "improve" | "shorten" | "expand" | "custom" | "review" | "fix_issue"
    >("improve");
    const [aiCustomPrompt, setAiCustomPrompt] = useState("");
    // activeIssue is set by the navigate-to-issue flow (initialFocus
    // effect) and cleared on chapter switch. Used by the AI "fix issue"
    // mode to target the rewrite with type-aware prompts (passive ->
    // active, adverb -> stronger verb, ...). The plain-text offsets
    // let the handler expand the selection to the enclosing sentence
    // so the AI gets enough context even when the raw finding is one
    // word long (filler_word, adverb).
    const [activeIssue, setActiveIssue] = useState<{
        type: "filler_word" | "passive_voice" | "adverb" | "long_sentence";
        offset: number;
        length: number;
    } | null>(null);
    // New for v0.20.x AI review extension. See docs/explorations/ai-review-extension.md.
    const [reviewFocus, setReviewFocus] = useState<"style" | "consistency" | "beta_reader">(
        "style",
    );
    const [reviewDownloadUrl, setReviewDownloadUrl] = useState<string | null>(null);
    const [reviewStatusMsg, setReviewStatusMsg] = useState<string | null>(null);
    const [reviewCostLabel, setReviewCostLabel] = useState<string | null>(null);
    const reviewEventSource = useRef<EventSource | null>(null);
    // Per-chapter word target (WRITING-GOALS-PROGRESS-TRACKING-01).
    // Promoted from per-device localStorage to the DB
    // Chapter.target_words, passed in by the parent. Read-only here
    // (set in the Storyboard / Outliner, which own the chapter version
    // for the PATCH); the editor shows live progress against it.
    const wordGoal = targetWords ?? null;
    const [searchTerm, setSearchTerm] = useState("");
    const [replaceTerm, setReplaceTerm] = useState("");
    const [recoveryDraft, setRecoveryDraft] = useState<{ content: string; savedAt: number } | null>(
        null,
    );
    const serverContentHash = useRef(hashContent(content));
    const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Pending "saved" -> "idle" reset. Tracked so a NEW save cycle can
    // cancel a prior reset: without this, the idle-timer from save N
    // fires ~2s later and clobbers save N+1's "saved" status (set just
    // before), flickering the indicator off early on rapid sequential
    // autosaves. (Found via content-safety version-history smoke.)
    const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [markdownText, setMarkdownText] = useState("");

    // Ctrl+H toggles search (documented in toolbar but was not wired as a shortcut)
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "h") {
                e.preventDefault();
                setShowSearch((s) => !s);
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, []);

    // EDITOR-FULLSCREEN-NATIVE-01: browser-native fullscreen
    // toggle via the toolbar button + Ctrl+Shift+F shortcut.
    // F11 stays browser-default (page-fullscreen) and is the
    // primary keyboard path; Ctrl+Shift+F is the secondary
    // JS-controlled path that goes through requestFullscreen().
    const fullscreen = useFullscreenToggle();
    useKeyboardShortcuts([
        ...(fullscreen.isSupported
            ? [{ keys: "ctrl+shift+f", handler: () => void fullscreen.toggle() }]
            : []),
        { keys: "ctrl+shift+d", handler: () => setCompositionMode((v) => !v) },
    ]);

    // COMPOSITION-DISTRACTION-FREE-MODE-01: drive the root-level
    // `composition-mode` class (global.css hides the sidebar + the
    // toolbar bar and paints the backdrop) and bind Escape-to-exit.
    // The class lives on documentElement because the chrome to hide
    // (ChapterSidebar, app shell) is rendered outside this component.
    useEffect(() => {
        if (!compositionMode) return;
        const root = document.documentElement;
        root.classList.add("composition-mode");
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setCompositionMode(false);
        };
        document.addEventListener("keydown", onKey);
        return () => {
            root.classList.remove("composition-mode");
            document.removeEventListener("keydown", onKey);
        };
    }, [compositionMode]);
    // EDITOR-DISPLAY-SETTINGS-01 C4: per-device editor display
    // preferences (width / font / size / line-height). Reads + writes
    // localStorage; applies CSS custom properties to
    // document.documentElement so the styling cascades into this
    // editor surface AND any sibling editor mounted on the same page.
    // Multiple Editor instances would all stay in sync because
    // localStorage is the source of truth; the popover surface is
    // local per-instance.
    const editorDisplay = useEditorDisplaySettings();

    const lastAttemptedJson = useRef<string | null>(null);

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
    // tab dying) plus a best-effort keepalive fetch. Reuses the existing
    // `editorRef` (wired by the useEffect further down).
    const flushPendingSaveRef = useRef<() => void>(() => {});
    useFlushOnUnload(() => flushPendingSaveRef.current());

    const editorRef = useRef<TiptapEditor | null>(null);

    const uploadAndInsertImage = async (file: File) => {
        if (!bookId) return;
        try {
            const asset = await getStorage().assets.upload(bookId, file, "figure");
            const src = `/api/books/${bookId}/assets/file/${asset.filename}`;
            editorRef.current?.chain().focus().setImage({ src, alt: file.name }).run();
            void warnIfOfflineStorageNearlyFull(
                t(
                    "ui.offline.storage_almost_full",
                    "Browser-Speicher fast voll. Entferne nicht benötigte Offline-Bücher, um Platz zu schaffen.",
                ),
            );
        } catch (err) {
            notify.error(t("ui.editor.upload_failed", "Upload fehlgeschlagen"), err);
        }
    };

    const editor = useEditor({
        immediatelyRender: false,
        extensions: buildEditorExtensions(
            placeholder,
            mentionBookId
                ? [createStoryBibleMention(mentionBookId, buildMentionLabels(t))]
                : [],
        ),
        content: parseContent(content),
        onUpdate: ({ editor }) => {
            syncCountsRef.current(editor);
            const json = JSON.stringify(editor.getJSON());
            debouncedSave(json);
        },
        editorProps: {
            attributes: {
                class: "tiptap-editor",
                // a11y: TipTap renders the editor as a
                // contenteditable div. ARIA-compliant browsers
                // implicitly map contenteditable=true to
                // role=textbox + aria-multiline=true, but the
                // editor needs a discoverable accessible name so
                // screen readers announce it as more than just
                // "edit text". WCAG 2.1 SC 4.1.2.
                "aria-label": t("ui.a11y.editor_label", "Editor"),
                role: "textbox",
                "aria-multiline": "true",
            },
            handleDrop: (_view, event, _slice, moved) => {
                if (moved || !event.dataTransfer?.files?.length || !bookId) return false;
                const file = event.dataTransfer.files[0];
                if (!file.type.startsWith("image/")) return false;
                event.preventDefault();
                uploadAndInsertImage(file);
                return true;
            },
            handlePaste: (_view, event) => {
                const items = event.clipboardData?.items;
                if (!items || !bookId) return false;
                for (const item of Array.from(items)) {
                    if (item.type.startsWith("image/")) {
                        const file = item.getAsFile();
                        if (file) {
                            event.preventDefault();
                            uploadAndInsertImage(file);
                            return true;
                        }
                    }
                }
                return false;
            },
        },
    });

    // COMPOSITION-DISTRACTION-FREE-MODE-01 C2: typewriter scrolling —
    // keep the caret line vertically centered while in composition
    // mode. No-op (and fail-open) outside composition.
    useTypewriterScroll(editor, compositionMode);

    // Live word/char count off editor.storage.characterCount.
    // Updated from inside the existing useEditor onUpdate callback
    // (the same callback that schedules debouncedSave) plus an
    // initial sync on mount via useEffect. Issue #12 history:
    //   1) inline `{editor.storage.characterCount.words()}` in JSX -
    //      not React-reactive, never updated.
    //   2) `useEditorState` selector - reactive, but wraps
    //      useSyncExternalStore which produced stale renders under
    //      React StrictMode + Playwright + Vite dev server.
    //   3) `useEffect + editor.on('update')` listener - looked right
    //      but the listener never fired in the smoke test, leaving
    //      the count pinned to the on-mount value.
    //   4) (current) write the count from the existing onUpdate
    //      config callback. That path already runs for debouncedSave
    //      so we know it fires; piggy-backing the count update there
    //      removes the second-listener variable entirely.
    const [wordCount, setWordCount] = useState(0);
    const [charCount, setCharCount] = useState(0);
    const syncCountsRef = useRef<(ed: TiptapEditor) => void>(() => {});
    syncCountsRef.current = (ed: TiptapEditor) => {
        // CharacterCount extension's `storage.words/characters()`
        // returned stale values during smoke tests (issue #12 followup
        // probe: 25 onUpdate calls all reported `words=2 chars=9` while
        // ed.state.doc.textContent already showed the freshly typed
        // string). Compute directly from textContent so the count
        // tracks the doc state at the same moment React reads it.
        const text = ed.state.doc.textContent;
        const words = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
        setWordCount(words);
        setCharCount(text.length);
    };
    useEffect(() => {
        if (!editor) return;
        // Initial render: seed the counts off the just-mounted editor.
        syncCountsRef.current(editor);
    }, [editor]);

    // Keep ref in sync for async callbacks (image upload)
    useEffect(() => {
        editorRef.current = editor;
    }, [editor]);

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

    // Update content when switching chapters
    useEffect(() => {
        if (editor) {
            const currentJson = JSON.stringify(editor.getJSON());
            if (content !== currentJson) {
                editor.commands.setContent(parseContent(content));
                lastSaved.current = content;
                setMarkdownMode(false);
            }
        }
    }, [content, editor]);

    // Navigate-to-first-issue: when the parent sets initialFocus (e.g.
    // from a Quality-tab click), run a style check and jump to the
    // first matching finding. Decorations from StyleCheckExtension
    // stay on until the user toggles the style-check button off.
    useEffect(() => {
        if (!editor || !initialFocus) return;
        let cancelled = false;
        (async () => {
            try {
                const text = editor.getText();
                if (!text.trim()) return;
                const result = await api.msTools.check(text, bookContext?.language || "de", bookId);
                if (cancelled) return;
                editor.commands.setStyleFindings(result.findings);
                setStyleCheckActive(true);
                const match = result.findings.find((f) => f.type === initialFocus.type);
                if (!match) {
                    notify.info(
                        t("ui.metadata.quality_nav_no_issues", "Keine Treffer in diesem Kapitel"),
                    );
                    return;
                }
                // Offsets are plain-text; convert via a temp doc walk
                // that mirrors StyleCheckExtension's mapping.
                const { from, to } = textOffsetToDocPos(
                    editor.state.doc,
                    match.offset,
                    match.offset + match.length,
                );
                if (from === null) return;
                editor
                    .chain()
                    .focus()
                    .setTextSelection({ from, to: to ?? from })
                    .scrollIntoView()
                    .run();
                // Arm the "fix issue" AI mode for this finding. The AI
                // panel stays closed until the user clicks; the button
                // on the quality tab is diagnosis, not remediation.
                setActiveIssue({
                    type: match.type as
                        | "filler_word"
                        | "passive_voice"
                        | "adverb"
                        | "long_sentence",
                    offset: match.offset,
                    length: match.length,
                });
                setAiPromptType("fix_issue");
                // Only open the AI panel if the AI plugin is enabled;
                // otherwise the user sees no button to press and the
                // arm is a no-op.
                if (isPluginAvailable(pluginStatus, "ai")) {
                    setShowAiPanel(true);
                }
            } catch {
                // style check failure: nothing to jump to
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [editor, initialFocus?.type, initialFocus?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

    // Clear activeIssue on chapter switch. The finding offsets belong
    // to the previous chapter's plain text, so re-using them after a
    // swap would jump to the wrong range.
    useEffect(() => {
        setActiveIssue(null);
        setAiPromptType((prev) => (prev === "fix_issue" ? "improve" : prev));
    }, [chapterId]);

    // Check for recovery draft when chapter loads. ``editor`` is in the deps
    // because ``immediatelyRender: false`` (TipTap v3) makes ``useEditor``
    // return ``null`` on the first render and the instance only on a later
    // one; without re-running when it arrives, the guard below bails on the
    // initial null and the recovery banner never appears.
    useEffect(() => {
        if (!chapterId || !editor) return;
        const activeChapter = chapterId;
        checkForRecovery(chapterId, content, new Date().toISOString()).then((draft) => {
            if (draft && activeChapter === chapterId) {
                setRecoveryDraft({ content: draft.content, savedAt: draft.savedAt });
            }
        });
        serverContentHash.current = hashContent(content);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chapterId, editor]);

    // Cleanup old drafts on mount
    useEffect(() => {
        cleanupOldDrafts(draftMaxAgeDays);
    }, [draftMaxAgeDays]);

    // Cleanup timer
    useEffect(() => {
        return () => {
            if (saveTimer.current) clearTimeout(saveTimer.current);
            if (reviewEventSource.current) {
                reviewEventSource.current.close();
                reviewEventSource.current = null;
            }
        };
    }, []);

    // Fetch a rough token + USD cost estimate when the review tab is
    // visible and the chapter content changes. Best-effort - a failed
    // estimate just hides the cost label.
    useEffect(() => {
        if (!showAiPanel || aiPromptType !== "review" || !editor) {
            setReviewCostLabel(null);
            return;
        }
        const fullText = editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n");
        if (!fullText.trim()) {
            setReviewCostLabel(null);
            return;
        }
        let cancelled = false;
        api.ai
            .estimateReview(fullText)
            .then((payload) => {
                if (cancelled) return;
                const tokens = Number(payload.input_tokens || 0);
                const cost = typeof payload.cost_usd === "number" ? payload.cost_usd : null;
                const tokensLabel =
                    tokens >= 1000 ? `${Math.round(tokens / 100) / 10}k` : `${tokens}`;
                if (cost !== null) {
                    setReviewCostLabel(
                        `~${tokensLabel} ${t("ui.editor.ai_review_tokens", "tokens")}, ~$${cost.toFixed(3)}`,
                    );
                } else {
                    setReviewCostLabel(
                        `~${tokensLabel} ${t("ui.editor.ai_review_tokens", "tokens")}`,
                    );
                }
            })
            .catch(() => {
                if (!cancelled) setReviewCostLabel(null);
            });
        return () => {
            cancelled = true;
        };
    }, [showAiPanel, aiPromptType, editor, chapterId, t]);

    const handleToggleMarkdown = () => {
        if (!editor) return;

        if (!markdownMode) {
            // Switch to Markdown mode: extract text representation
            setMarkdownText(editorToMarkdown(editor));
            setMarkdownMode(true);
        } else {
            // Switch back to WYSIWYG: convert markdown to HTML for TipTap
            const html = markdownToHtml(markdownText);
            editor.commands.setContent(html);
            const json = JSON.stringify(editor.getJSON());
            debouncedSave(json);
            setMarkdownMode(false);
        }
    };

    const handleMarkdownChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const text = e.target.value;
        setMarkdownText(text);

        // Debounced save in markdown mode - delegates to performSave so the
        // retry toast and status transitions match the WYSIWYG path.
        if (saveTimer.current) clearTimeout(saveTimer.current);
        setSaveStatus("saving");
        saveTimer.current = setTimeout(() => {
            if (!editor) {
                setSaveStatus("idle");
                return;
            }
            const html = markdownToHtml(text);
            editor.commands.setContent(html);
            const json = JSON.stringify(editor.getJSON());
            void performSave(json);
        }, 800);
    };

    // EDITOR-CONTEXT-MENU-01: take a manual chapter snapshot from the
    // right-click menu (chapter editor only; needs book + chapter ids).
    const handleTakeSnapshot = async () => {
        if (!bookId || !chapterId) return;
        try {
            await api.chapters.createSnapshot(bookId, chapterId, null);
            notify.success(t("ui.versions.snapshot_taken", "Snapshot erstellt."));
        } catch {
            notify.error(
                t("ui.versions.snapshot_failed", "Snapshot konnte nicht erstellt werden."),
            );
        }
    };

    // EDITOR-CONTEXT-MENU-01: search the selected text in the Story
    // Bible; open the first matching entity in the sidebar.
    const handleSearchStoryBible = async (text: string) => {
        const query = text.trim();
        if (!mentionBookId || !query) return;
        try {
            const matches = await getStorage().storyBible.listEntities(
                mentionBookId,
                undefined,
                query,
            );
            if (matches.length && onOpenStoryEntity) {
                onOpenStoryEntity(matches[0].id);
            } else {
                notify.info(
                    t("ui.editor_menu.no_story_bible_match", "Kein Story-Bibel-Eintrag gefunden."),
                );
            }
        } catch {
            notify.error(t("ui.editor_menu.search_failed", "Suche fehlgeschlagen."));
        }
    };

    const handleToggleSpellcheck = async () => {
        if (showSpellcheck) {
            setShowSpellcheck(false);
            setSpellcheckResults([]);
            return;
        }
        if (!editor) return;
        setShowSpellcheck(true);
        setSpellcheckLoading(true);
        try {
            const text = editor.getText();
            const data = await api.grammar.check(text);
            setSpellcheckResults(data.matches || []);
            if ((data.matches || []).length === 0) {
                notify.success(t("ui.editor.spellcheck_ok", "Keine Fehler gefunden"));
            }
        } catch (err) {
            const detail = err instanceof ApiError ? err.detail : null;
            notify.error(
                detail || t("ui.editor.spellcheck_error", "Rechtschreibprüfung fehlgeschlagen"),
                err,
            );
            setSpellcheckResults([]);
        }
        setSpellcheckLoading(false);
    };

    const handleToggleStyleCheck = async () => {
        if (!editor) return;
        if (styleCheckActive) {
            editor.commands.clearStyleFindings();
            setStyleCheckActive(false);
            return;
        }
        setStyleCheckLoading(true);
        setStyleCheckActive(true);
        try {
            const text = editor.getText();
            if (!text.trim()) {
                setStyleCheckActive(false);
                setStyleCheckLoading(false);
                return;
            }
            const result = await api.msTools.check(text, "de", bookId);
            editor.commands.setStyleFindings(result.findings);
        } catch {
            notify.error(t("ui.editor.spellcheck_error", "Stilprüfung fehlgeschlagen"));
            setStyleCheckActive(false);
        }
        setStyleCheckLoading(false);
    };

    const handlePreviewAudio = async () => {
        if (!editor) return;
        setPreviewLoading(true);
        try {
            // Use selected text or first N chars of chapter
            const { from, to } = editor.state.selection;
            let text =
                from !== to ? editor.state.doc.textBetween(from, to, "\n") : editor.getText();
            if (text.length > aiContextChars) text = text.slice(0, aiContextChars);
            if (!text.trim()) {
                notify.info(t("ui.editor.preview_no_text", "Kein Text zum Vorlesen"));
                setPreviewLoading(false);
                return;
            }

            try {
                const blob = await api.audiobook.preview(text, bookId || "", chapterTitle || "");
                // Revoke any previous preview URL to avoid memory leaks
                if (previewAudioUrl) URL.revokeObjectURL(previewAudioUrl);
                setPreviewAudioUrl(URL.createObjectURL(blob));
            } catch (err) {
                const detail = err instanceof ApiError ? err.detail : null;
                notify.error(
                    detail || t("ui.editor.preview_error", "Vorschau fehlgeschlagen"),
                    err,
                );
                setPreviewLoading(false);
                return;
            }
        } catch {
            notify.error(t("ui.editor.preview_error", "Vorschau fehlgeschlagen"));
        }
        setPreviewLoading(false);
    };

    /** Expand the plain-text issue range to its enclosing sentence
     *  and return ProseMirror from/to positions. Mirrors the walk in
     *  StyleCheckExtension.textOffsetToDocPos so the mapping stays
     *  consistent. Returns null if the offsets fall outside the
     *  current document (chapter drift, doc edited since the check). */
    const expandToSentenceRange = (
        ed: TiptapEditor,
        issueOffset: number,
        issueLength: number,
    ): { from: number; to: number } | null => {
        const plain = ed.getText();
        const { start, end } = findEnclosingSentence(plain, issueOffset, issueLength);
        const { from, to } = textOffsetToDocPos(ed.state.doc, start, end);
        if (from === null) return null;
        const resolvedTo = to ?? from;
        if (resolvedTo < from) return null;
        return { from, to: resolvedTo };
    };

    const handleAiSuggest = async () => {
        if (!editor) return;

        // fix_issue mode expands the selection to the enclosing
        // sentence before calling the AI, so single-word findings
        // (filler_word, adverb) still get useful rewrite context.
        if (aiPromptType === "fix_issue") {
            if (!activeIssue) {
                notify.info(t("ui.editor.ai_fix_issue_none", "Kein Problem ausgewählt"));
                return;
            }
            const range = expandToSentenceRange(editor, activeIssue.offset, activeIssue.length);
            if (!range) {
                notify.info(t("ui.editor.ai_fix_issue_none", "Kein Problem ausgewählt"));
                return;
            }
            editor.chain().focus().setTextSelection({ from: range.from, to: range.to }).run();
        }

        const { from, to } = editor.state.selection;
        const selectedText = from !== to ? editor.state.doc.textBetween(from, to, "\n") : "";
        if (!selectedText.trim()) {
            notify.info(
                t("ui.editor.ai_select_text", "Markiere zuerst einen Text für AI-Vorschläge"),
            );
            return;
        }
        setShowAiPanel(true);
        setAiLoading(true);
        setAiSuggestion("");

        // Build context-aware system prompt. Article + book-chapter
        // contexts diverge: article tone targets online-publication
        // (engaging, accessible, SEO-aware), book-chapter tone matches
        // genre + book identity. See parity analysis Open Question 3.
        const basePrompts = buildAiPrompts({
            contentKind,
            bookContext,
            chapterTitle,
            activeIssueType: activeIssue?.type ?? null,
            aiCustomPrompt,
        });

        try {
            const data = await api.ai.generate(
                selectedText,
                basePrompts[aiPromptType],
                bookId || "",
            );
            setAiSuggestion(data.content || "");
        } catch (err) {
            const detail = err instanceof ApiError ? err.detail : null;
            notify.error(detail || t("ui.editor.ai_error", "AI nicht erreichbar"), err);
            setAiSuggestion("");
        }
        setAiLoading(false);
    };

    const handleAiApply = () => {
        if (!editor || !aiSuggestion) return;
        const { from, to } = editor.state.selection;
        if (from !== to) {
            editor
                .chain()
                .focus()
                .deleteRange({ from, to })
                .insertContentAt(from, aiSuggestion)
                .run();
            notify.success(t("ui.editor.ai_applied", "AI-Vorschlag übernommen"));
        }
        setShowAiPanel(false);
        setAiSuggestion("");
    };

    const bookLanguage =
        bookContext?.language || document.documentElement.getAttribute("lang") || "de";

    const handleAiReview = async () => {
        if (!editor) return;
        const fullText = editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n");
        if (!fullText.trim()) {
            notify.info(t("ui.editor.ai_review_empty", "Das Kapitel ist leer."));
            return;
        }
        setShowAiPanel(true);
        setAiLoading(true);
        setAiReview("");
        setAiSuggestion("");
        setReviewDownloadUrl(null);
        setReviewStatusMsg(reviewString(bookLanguage, "status_preparing"));

        let jobId: string | null = null;
        try {
            const submitted = await api.ai.reviewAsync({
                content: fullText,
                chapter_id: chapterId || "",
                chapter_title: chapterTitle || "",
                chapter_type: chapterType,
                book_title: bookContext?.title || "",
                genre: bookContext?.genre || "",
                language: bookLanguage,
                focus: [reviewFocus],
                book_id: bookId || "",
            });
            jobId = submitted.job_id;
        } catch (err) {
            const detail = err instanceof ApiError ? err.detail : null;
            notify.error(detail || t("ui.editor.ai_error", "AI nicht erreichbar"), err);
            setAiLoading(false);
            setReviewStatusMsg(null);
            return;
        }

        // Close any previous stream before opening a new one.
        if (reviewEventSource.current) {
            reviewEventSource.current.close();
        }
        const es = new EventSource(`/api/ai/jobs/${jobId}/stream`);
        reviewEventSource.current = es;
        es.onmessage = (ev) => {
            try {
                const parsed = JSON.parse(ev.data) as {
                    type: string;
                    data: Record<string, unknown>;
                };
                if (parsed.type === "review_start") {
                    setReviewStatusMsg(reviewString(bookLanguage, "status_analyzing"));
                } else if (parsed.type === "review_llm_call") {
                    setReviewStatusMsg(reviewString(bookLanguage, "status_generating"));
                } else if (parsed.type === "review_done") {
                    const url =
                        typeof parsed.data.download_url === "string"
                            ? parsed.data.download_url
                            : null;
                    setReviewDownloadUrl(url);
                } else if (parsed.type === "stream_end") {
                    es.close();
                    reviewEventSource.current = null;
                    setAiLoading(false);
                    setReviewStatusMsg(null);
                    // Pull the final result from the poll endpoint.
                    if (jobId) {
                        api.ai
                            .getJob(jobId)
                            .then((payload) => {
                                if (payload?.result?.review) {
                                    setAiReview(payload.result.review);
                                }
                            })
                            .catch(() => {
                                notify.error(t("ui.editor.ai_error", "AI nicht erreichbar"));
                            });
                    }
                }
            } catch {
                // Malformed event - ignore.
            }
        };
        es.onerror = () => {
            es.close();
            reviewEventSource.current = null;
            setAiLoading(false);
            setReviewStatusMsg(null);
            notify.error(t("ui.editor.ai_error", "AI nicht erreichbar"));
        };
    };

    const statusLabel =
        saveStatus === "saving"
            ? t("ui.editor.saving", "Speichert...")
            : saveStatus === "saved"
              ? t("ui.editor.saved", "Gespeichert")
              : saveStatus === "error"
                ? t("ui.editor.save_failed_short", "Speichern fehlgeschlagen")
                : "";

    const handleRestore = () => {
        if (editor && recoveryDraft) {
            try {
                const parsed = JSON.parse(recoveryDraft.content);
                editor.commands.setContent(parsed);
                const json = recoveryDraft.content;
                lastSaved.current = json;
                onSave(json);
                if (chapterId) deleteDraft(chapterId);
            } catch {
                // Corrupt draft - discard
                if (chapterId) deleteDraft(chapterId);
            }
        }
        setRecoveryDraft(null);
    };

    const handleDiscardDraft = () => {
        if (chapterId) deleteDraft(chapterId);
        setRecoveryDraft(null);
    };

    return (
        <div className={styles.wrapper}>
            {/* Recovery dialog */}
            {recoveryDraft && (
                <div className={styles.recoveryBanner} data-testid="recovery-banner">
                    <div style={{ flex: 1 }}>
                        <strong>
                            {t("ui.editor.recovery_title", "Ungespeicherte Änderungen gefunden")}
                        </strong>
                        <p
                            style={{
                                margin: "4px 0 0",
                                fontSize: "0.8125rem",
                                color: "var(--text-secondary)",
                            }}
                        >
                            {t(
                                "ui.editor.recovery_desc",
                                "Änderungen vom {timestamp} gefunden, die nicht gespeichert wurden.",
                            ).replace(
                                "{timestamp}",
                                new Date(recoveryDraft.savedAt).toLocaleString(),
                            )}
                        </p>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        <button className="btn btn-primary btn-sm" onClick={handleRestore}>
                            {t("ui.editor.recovery_restore", "Wiederherstellen")}
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={handleDiscardDraft}>
                            {t("ui.editor.recovery_discard", "Verwerfen")}
                        </button>
                    </div>
                </div>
            )}

            {/* Wrapped so composition mode can hide the whole toolbar
                bar via global CSS (display:contents = layout-neutral
                when not in composition mode). */}
            <div className="editor-chrome-toolbar">
                <Toolbar
                    editor={editor}
                    markdownMode={markdownMode}
                    onToggleMarkdown={handleToggleMarkdown}
                    onToggleSearch={() => setShowSearch(!showSearch)}
                    focusMode={focusMode}
                    onToggleFocus={() => setFocusMode(!focusMode)}
                    compositionMode={compositionMode}
                    onToggleComposition={() => setCompositionMode(!compositionMode)}
                    isFullscreen={fullscreen.isFullscreen}
                    onToggleFullscreen={
                        fullscreen.isSupported ? () => void fullscreen.toggle() : undefined
                    }
                    spellcheckActive={showSpellcheck}
                    onToggleSpellcheck={
                        isPluginAvailable(pluginStatus, "grammar")
                            ? handleToggleSpellcheck
                            : undefined
                    }
                    onPreviewAudio={
                        gates.showAudiobook && isPluginAvailable(pluginStatus, "audiobook")
                            ? handlePreviewAudio
                            : undefined
                    }
                    previewLoading={previewLoading}
                    previewDisabledReason={
                        gates.showAudiobook && !isPluginAvailable(pluginStatus, "audiobook")
                            ? pluginDisabledMessage(pluginStatus, "audiobook")
                            : undefined
                    }
                    aiPanelActive={showAiPanel}
                    onToggleAi={
                        isPluginAvailable(pluginStatus, "ai")
                            ? () => setShowAiPanel(!showAiPanel)
                            : undefined
                    }
                    aiDisabledReason={
                        !isPluginAvailable(pluginStatus, "ai")
                            ? pluginDisabledMessage(pluginStatus, "ai")
                            : undefined
                    }
                    spellcheckDisabledReason={
                        !isPluginAvailable(pluginStatus, "grammar")
                            ? pluginDisabledMessage(pluginStatus, "grammar")
                            : undefined
                    }
                    styleCheckActive={styleCheckActive}
                    styleCheckLoading={styleCheckLoading}
                    onToggleStyleCheck={
                        isPluginAvailable(pluginStatus, "ms-tools")
                            ? handleToggleStyleCheck
                            : undefined
                    }
                    documentTitle={documentTitle ?? chapterTitle}
                    documentSubtitle={documentSubtitle}
                />
            </div>

            {/* Floating exit affordance, only in composition mode
                (the toolbar that hosts the toggle is hidden). */}
            {compositionMode && (
                <button
                    type="button"
                    className="composition-exit btn btn-ghost btn-sm"
                    data-testid="composition-exit"
                    onClick={() => setCompositionMode(false)}
                    title={t("ui.toolbar.exit_composition", "Exit composition mode") + " (Esc)"}
                    aria-label={t("ui.toolbar.exit_composition", "Exit composition mode")}
                >
                    {t("ui.toolbar.exit_composition", "Exit composition mode")}
                </button>
            )}

            {/* EDITOR-DISPLAY-SETTINGS-01 C4: editor-display popover.
             * Sits just below the Toolbar, right-aligned so it does
             * not crowd the toolbar's left-aligned formatting buttons.
             * Click opens a panel with the 4 controls + reset. */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    padding: "0 12px",
                }}
            >
                <EditorDisplaySettingsPopover
                    settings={editorDisplay.settings}
                    onWidthChange={editorDisplay.setWidth}
                    onFontFamilyChange={editorDisplay.setFontFamily}
                    onFontSizeChange={editorDisplay.setFontSize}
                    onLineHeightChange={editorDisplay.setLineHeight}
                    onReset={editorDisplay.reset}
                />
            </div>

            {/* TTS Preview Player */}
            {previewAudioUrl && (
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 12px",
                        background: "var(--bg-secondary)",
                        borderBottom: "1px solid var(--border)",
                    }}
                >
                    <audio
                        controls
                        autoPlay
                        src={previewAudioUrl}
                        onEnded={() => {
                            URL.revokeObjectURL(previewAudioUrl);
                            setPreviewAudioUrl(null);
                        }}
                        style={{ height: 32, flex: 1, maxWidth: 400 }}
                    />
                    <button
                        className="btn-icon"
                        onClick={() => {
                            URL.revokeObjectURL(previewAudioUrl);
                            setPreviewAudioUrl(null);
                        }}
                        title={t("ui.common.close", "Schließen")}
                        style={{ padding: 4, fontSize: "1rem", lineHeight: 1 }}
                    >
                        &#x2715;
                    </button>
                </div>
            )}

            {/* AI Assistant Panel */}
            {showAiPanel && !markdownMode && (
                <div className={styles.aiPanel}>
                    <div className={styles.aiHeader}>
                        <strong>{t("ui.editor.ai_assistant", "AI-Assistent")}</strong>
                        <div
                            style={{
                                display: "flex",
                                gap: 4,
                                marginLeft: "auto",
                                flexWrap: "wrap",
                            }}
                        >
                            {activeIssue && (
                                <button
                                    key="fix_issue"
                                    data-testid="ai-fix-issue-mode"
                                    className={`btn btn-sm ${aiPromptType === "fix_issue" ? "btn-primary" : "btn-ghost"}`}
                                    onClick={() => {
                                        setAiPromptType("fix_issue");
                                        setAiSuggestion("");
                                        setAiReview("");
                                    }}
                                    style={{ padding: "2px 8px", fontSize: "0.75rem" }}
                                >
                                    {t("ui.editor.ai_fix_issue", "Problem beheben")}
                                </button>
                            )}
                            {(["improve", "shorten", "expand", "custom", "review"] as const).map(
                                (type) => (
                                    <button
                                        key={type}
                                        className={`btn btn-sm ${aiPromptType === type ? "btn-primary" : "btn-ghost"}`}
                                        onClick={() => {
                                            setAiPromptType(type);
                                            setAiSuggestion("");
                                            setAiReview("");
                                        }}
                                        style={{ padding: "2px 8px", fontSize: "0.75rem" }}
                                    >
                                        {type === "improve"
                                            ? t("ui.editor.ai_improve", "Verbessern")
                                            : type === "shorten"
                                              ? t("ui.editor.ai_shorten", "Kürzen")
                                              : type === "expand"
                                                ? t("ui.editor.ai_expand", "Erweitern")
                                                : type === "custom"
                                                  ? t("ui.editor.ai_custom", "Eigener Prompt")
                                                  : t("ui.editor.ai_review", "Review")}
                                    </button>
                                ),
                            )}
                        </div>
                        <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                                setShowAiPanel(false);
                                setAiReview("");
                            }}
                        >
                            &times;
                        </button>
                    </div>
                    {aiPromptType === "custom" && (
                        <input
                            className="input"
                            style={{
                                margin: "6px 16px",
                                width: "calc(100% - 32px)",
                                fontSize: "0.8125rem",
                            }}
                            placeholder={t(
                                "ui.editor.ai_custom_placeholder",
                                "z.B. Mache den Ton formeller...",
                            )}
                            value={aiCustomPrompt}
                            onChange={(e) => setAiCustomPrompt(e.target.value)}
                        />
                    )}
                    {aiPromptType === "review" ? (
                        <>
                            <div style={{ padding: "4px 16px" }}>
                                <small style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                                    {t(
                                        "ui.editor.ai_review_hint",
                                        "Analysiert das gesamte Kapitel auf Stil, Kohaerenz und Pacing.",
                                    )}
                                </small>
                            </div>
                            <div
                                role="radiogroup"
                                aria-label={t("ui.editor.ai_review_focus", "Review-Fokus")}
                                style={{
                                    padding: "4px 16px",
                                    display: "flex",
                                    gap: 12,
                                    flexWrap: "wrap",
                                }}
                            >
                                {(["style", "consistency", "beta_reader"] as const).map((value) => (
                                    <label
                                        key={value}
                                        data-testid={`ai-review-focus-${value}`}
                                        style={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: 4,
                                            fontSize: "0.8125rem",
                                            cursor: "pointer",
                                        }}
                                    >
                                        <input
                                            type="radio"
                                            name="ai-review-focus"
                                            value={value}
                                            checked={reviewFocus === value}
                                            onChange={() => setReviewFocus(value)}
                                            disabled={aiLoading}
                                        />
                                        {value === "style"
                                            ? t("ui.editor.ai_review_focus_style", "Stil")
                                            : value === "consistency"
                                              ? t(
                                                    "ui.editor.ai_review_focus_consistency",
                                                    "Konsistenz",
                                                )
                                              : t(
                                                    "ui.editor.ai_review_focus_beta_reader",
                                                    "Testleser",
                                                )}
                                    </label>
                                ))}
                            </div>
                            {NON_PROSE_CHAPTER_TYPES.has(chapterType) && (
                                <div
                                    data-testid="ai-review-non-prose-warning"
                                    style={{
                                        padding: "4px 16px",
                                        fontSize: "0.75rem",
                                        color: "var(--warning, var(--text-muted))",
                                    }}
                                >
                                    {reviewString(bookLanguage, "non_prose_warning")}
                                </div>
                            )}
                            <div
                                style={{
                                    padding: "6px 16px",
                                    display: "flex",
                                    gap: 8,
                                    alignItems: "center",
                                }}
                            >
                                <button
                                    data-testid="ai-review-start"
                                    className="btn btn-primary btn-sm"
                                    onClick={handleAiReview}
                                    disabled={aiLoading || aiGen.isDisabled}
                                    title={aiGenTitle}
                                >
                                    {aiLoading
                                        ? reviewStatusMsg ||
                                          t("ui.editor.ai_loading", "Denke nach...")
                                        : t("ui.editor.ai_review_start", "Kapitel reviewen")}
                                </button>
                                {reviewCostLabel && !aiLoading && (
                                    <small
                                        data-testid="ai-review-cost"
                                        style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}
                                    >
                                        {reviewCostLabel}
                                    </small>
                                )}
                            </div>
                            {aiReview && (
                                <div className={styles.aiSuggestion}>
                                    <div
                                        style={{
                                            fontSize: "0.8125rem",
                                            whiteSpace: "pre-wrap",
                                            color: "var(--text-primary)",
                                            lineHeight: 1.6,
                                        }}
                                    >
                                        {aiReview}
                                    </div>
                                    <div
                                        style={{
                                            display: "flex",
                                            gap: 8,
                                            marginTop: 8,
                                            flexWrap: "wrap",
                                        }}
                                    >
                                        {reviewDownloadUrl && (
                                            <a
                                                data-testid="ai-review-download"
                                                className="btn btn-ghost btn-sm"
                                                href={reviewDownloadUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                download
                                            >
                                                {t(
                                                    "ui.editor.ai_review_download",
                                                    "Bericht herunterladen",
                                                )}
                                            </a>
                                        )}
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => {
                                                setAiReview("");
                                                setReviewDownloadUrl(null);
                                            }}
                                        >
                                            {t("ui.editor.ai_review_close", "Schließen")}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            {aiPromptType === "fix_issue" && activeIssue && (
                                <div
                                    data-testid="ai-fix-issue-hint"
                                    style={{ padding: "4px 16px" }}
                                >
                                    <small
                                        style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}
                                    >
                                        {t(
                                            "ui.editor.ai_fix_issue_hint",
                                            "AI formuliert den markierten Satz um.",
                                        )}{" "}
                                        ({ISSUE_TYPE_LABELS[activeIssue.type](t)})
                                    </small>
                                </div>
                            )}
                            <div style={{ padding: "6px 16px", display: "flex", gap: 8 }}>
                                <button
                                    data-testid={
                                        aiPromptType === "fix_issue"
                                            ? "ai-fix-issue-run"
                                            : undefined
                                    }
                                    className="btn btn-primary btn-sm"
                                    onClick={handleAiSuggest}
                                    disabled={
                                        aiLoading ||
                                        aiGen.isDisabled ||
                                        (aiPromptType === "fix_issue" && !activeIssue)
                                    }
                                    title={aiGenTitle}
                                >
                                    {aiLoading
                                        ? aiPromptType === "fix_issue" && activeIssue
                                            ? t(
                                                  "ui.editor.ai_fix_issue_loading",
                                                  "AI arbeitet am Satz...",
                                              )
                                            : t("ui.editor.ai_loading", "Denke nach...")
                                        : aiPromptType === "fix_issue"
                                          ? t("ui.editor.ai_fix_issue_run", "Vorschlag generieren")
                                          : t("ui.editor.ai_suggest", "Vorschlag generieren")}
                                </button>
                            </div>
                            {aiSuggestion && (
                                <div className={styles.aiSuggestion}>
                                    <div
                                        style={{
                                            fontSize: "0.8125rem",
                                            whiteSpace: "pre-wrap",
                                            color: "var(--text-primary)",
                                        }}
                                    >
                                        {aiSuggestion}
                                    </div>
                                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                                        <button
                                            className="btn btn-primary btn-sm"
                                            onClick={handleAiApply}
                                        >
                                            {t("ui.editor.ai_apply", "Übernehmen")}
                                        </button>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => setAiSuggestion("")}
                                        >
                                            {t("ui.editor.ai_discard", "Verwerfen")}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* Search & Replace bar */}
            {showSearch && !markdownMode && editor && (
                <div className={styles.searchBar}>
                    <input
                        className={`input ${styles.searchInput}`}
                        value={searchTerm}
                        onChange={(e) => {
                            setSearchTerm(e.target.value);
                            editor.commands.setSearchTerm(e.target.value);
                        }}
                        placeholder={t("ui.editor.search", "Suchen...")}
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === "Enter") editor.commands.nextSearchResult();
                            if (e.key === "Escape") setShowSearch(false);
                        }}
                    />
                    <input
                        className={`input ${styles.searchInput}`}
                        value={replaceTerm}
                        onChange={(e) => {
                            setReplaceTerm(e.target.value);
                            editor.commands.setReplaceTerm(e.target.value);
                        }}
                        placeholder={t("ui.editor.replace", "Ersetzen...")}
                        onKeyDown={(e) => {
                            if (e.key === "Escape") setShowSearch(false);
                        }}
                    />
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => editor.commands.previousSearchResult()}
                    >
                        &lt;
                    </button>
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => editor.commands.nextSearchResult()}
                    >
                        &gt;
                    </button>
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => editor.commands.replace()}
                    >
                        {t("ui.editor.replace_one", "Ersetzen")}
                    </button>
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => editor.commands.replaceAll()}
                    >
                        {t("ui.editor.replace_all", "Alle")}
                    </button>
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                            setShowSearch(false);
                            setSearchTerm("");
                            setReplaceTerm("");
                            editor.commands.setSearchTerm("");
                        }}
                    >
                        &times;
                    </button>
                </div>
            )}

            {/* Spellcheck results panel */}
            {showSpellcheck && !markdownMode && (
                <div className={styles.spellcheckPanel}>
                    <div className={styles.spellcheckHeader}>
                        <strong>{t("ui.editor.spellcheck", "Rechtschreibprüfung")}</strong>
                        {spellcheckLoading && (
                            <span style={{ color: "var(--text-muted)", marginLeft: 8 }}>
                                {t("ui.editor.checking", "Prüfe...")}
                            </span>
                        )}
                        {!spellcheckLoading && (
                            <span style={{ color: "var(--text-muted)", marginLeft: 8 }}>
                                {spellcheckResults.length} {t("ui.editor.issues", "Probleme")}
                            </span>
                        )}
                        <button
                            className="btn btn-ghost btn-sm"
                            style={{ marginLeft: "auto" }}
                            onClick={handleToggleSpellcheck}
                        >
                            &times;
                        </button>
                    </div>
                    {spellcheckResults.length > 0 && (
                        <div className={styles.spellcheckList}>
                            {spellcheckResults.map((issue, i) => (
                                <div key={i} className={styles.spellcheckItem}>
                                    <div
                                        style={{
                                            fontSize: "0.8125rem",
                                            color: "var(--text-primary)",
                                        }}
                                    >
                                        {issue.message}
                                    </div>
                                    {issue.replacements.length > 0 && (
                                        <div
                                            style={{
                                                fontSize: "0.75rem",
                                                color: "var(--accent)",
                                                marginTop: 2,
                                            }}
                                        >
                                            {t("ui.editor.suggestions", "Vorschläge")}:{" "}
                                            {issue.replacements.join(", ")}
                                        </div>
                                    )}
                                    <div
                                        style={{
                                            fontSize: "0.6875rem",
                                            color: "var(--text-muted)",
                                            marginTop: 2,
                                        }}
                                    >
                                        {issue.rule_id}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Status bar */}
            <div className={styles.statusBar}>
                <span className={styles.wordCount}>
                    {wordCount} {t("ui.editor.words", "Wörter")}
                    {" / "}
                    {charCount} {t("ui.editor.characters", "Zeichen")}
                    {/* Word target (read-only; set in the Storyboard). */}
                    {wordGoal && wordGoal > 0 && (
                        <span className={styles.goalBtn} data-testid="editor-word-goal">
                            {t("ui.editor.goal", "Ziel")}: {wordGoal}
                        </span>
                    )}
                </span>
                {/* Progress bar for the word target */}
                {wordGoal && wordGoal > 0 && (
                    <div className={styles.goalProgress}>
                        <div
                            className={styles.goalProgressFill}
                            style={{
                                width: `${Math.min(100, (wordCount / wordGoal) * 100)}%`,
                                background:
                                    wordCount >= wordGoal ? "var(--success)" : "var(--accent)",
                            }}
                        />
                    </div>
                )}
                {statusLabel && (
                    <span
                        className={styles.saveStatus}
                        style={{
                            color:
                                saveStatus === "saving"
                                    ? "var(--text-muted)"
                                    : saveStatus === "error"
                                      ? "var(--danger, #b91c1c)"
                                      : "var(--accent)",
                        }}
                        data-testid={`editor-save-status-${saveStatus}`}
                    >
                        {statusLabel}
                    </span>
                )}
            </div>

            <div className={styles.editorArea}>
                <div
                    className={`${styles.editorContainer} ${focusMode || compositionMode ? "focus-mode" : ""} ${compositionMode ? "composition-surface" : ""}`}
                >
                    {markdownMode ? (
                        <textarea
                            className={styles.markdownEditor}
                            value={markdownText}
                            onChange={handleMarkdownChange}
                            spellCheck={false}
                        />
                    ) : onOpenStoryEntity ? (
                        <EditorContextMenu
                            editor={editor}
                            mentionActive={!!mentionBookId}
                            onSearchStoryBible={mentionBookId ? handleSearchStoryBible : undefined}
                            onTakeSnapshot={versionHistory.isActive && bookId && chapterId ? handleTakeSnapshot : undefined}
                        >
                            <div
                                onClick={(e) => {
                                    handleMentionClick(e, onOpenStoryEntity);
                                }}
                            >
                                <EditorContent editor={editor} />
                            </div>
                        </EditorContextMenu>
                    ) : (
                        <EditorContextMenu
                            editor={editor}
                            mentionActive={!!mentionBookId}
                            onSearchStoryBible={mentionBookId ? handleSearchStoryBible : undefined}
                            onTakeSnapshot={versionHistory.isActive && bookId && chapterId ? handleTakeSnapshot : undefined}
                        >
                            <div>
                                <EditorContent editor={editor} />
                            </div>
                        </EditorContextMenu>
                    )}
                </div>
            </div>
        </div>
    );
}
