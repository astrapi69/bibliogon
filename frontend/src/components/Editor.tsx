import {useEffect, useRef, useCallback, useState} from "react";
import {useEditorPluginStatus, isPluginAvailable, pluginDisabledMessage} from "../hooks/useEditorPluginStatus";
import {useFlushOnUnload} from "../hooks/useFlushOnUnload";
import {useEditor, EditorContent, type Editor as TiptapEditor} from "@tiptap/react";
import {saveDraft, deleteDraft, checkForRecovery, cleanupOldDrafts, hashContent} from "../db/drafts";
import {reviewString, NON_PROSE_CHAPTER_TYPES} from "../data/ai-review-strings";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import Highlight from "@tiptap/extension-highlight";
import Typography from "@tiptap/extension-typography";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Color from "@tiptap/extension-color";
import TextStyle from "@tiptap/extension-text-style";
import Figure from "@pentestpad/tiptap-extension-figure";
import {Footnotes, FootnoteReference, Footnote} from "tiptap-footnotes";
import SearchAndReplace from "@sereneinserenade/tiptap-search-and-replace";
import OfficePaste from "@intevation/tiptap-extension-office-paste";
import Focus from "@tiptap/extension-focus";
import {StyleCheckExtension} from "../extensions/StyleCheckExtension";
import {FIX_ISSUE_PROMPTS, findEnclosingSentence, FixIssueType} from "../data/fix-issue-prompts";

type Translator = (key: string, fallback: string) => string;

const ISSUE_TYPE_LABELS: Record<FixIssueType, (t: Translator) => string> = {
    passive_voice: (t) => t("ui.editor.ai_fix_issue_label_passive", "Passiv"),
    adverb: (t) => t("ui.editor.ai_fix_issue_label_adverb", "Adverb"),
    filler_word: (t) => t("ui.editor.ai_fix_issue_label_filler", "Fuellwort"),
    long_sentence: (t) => t("ui.editor.ai_fix_issue_label_long", "Langer Satz"),
};
import Toolbar from "./Toolbar";
import {useI18n} from "../hooks/useI18n";
import {api, ApiError, SaveAbortedError} from "../api/client";
import {notify} from "../utils/notify";

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
export {pluginsForContentKind} from "./editor-gates";
export type {ContentKind, PluginGates} from "./editor-gates";
import type {ContentKind} from "./editor-gates";
import {pluginsForContentKind as pluginsForKind} from "./editor-gates";
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
    bookContext?: BookContext;
    autosaveDebounceMs?: number;
    draftSaveDebounceMs?: number;
    draftMaxAgeDays?: number;
    aiContextChars?: number;
    /** When set, Editor runs a one-shot style check after mount and
     *  scrolls+selects the first finding of the given type. `seq` is
     *  used as a dep so repeated navigations to the same type re-fire
     *  the jump even when chapter did not change. Set by BookEditor in
     *  response to a Quality-tab click. */
    initialFocus?: {type: string; seq: number};
}

export default function Editor({content, onSave, placeholder, contentKind = "book-chapter", bookId, chapterId, chapterTitle, chapterType = "chapter", chapterVersion, bookContext, autosaveDebounceMs = 800, draftSaveDebounceMs = 2000, draftMaxAgeDays = 30, aiContextChars = 2000, initialFocus}: Props) {
    const gates = pluginsForKind(contentKind);
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSaved = useRef(content);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
    const {t} = useI18n();
    const [markdownMode, setMarkdownMode] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const [focusMode, setFocusMode] = useState(false);
    const [showSpellcheck, setShowSpellcheck] = useState(false);
    const [spellcheckResults, setSpellcheckResults] = useState<{message: string; short_message: string; offset: number; length: number; replacements: string[]; rule_id: string}[]>([]);
    const [spellcheckLoading, setSpellcheckLoading] = useState(false);
    const [styleCheckActive, setStyleCheckActive] = useState(false);
    const [styleCheckLoading, setStyleCheckLoading] = useState(false);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);
    const {status: pluginStatus} = useEditorPluginStatus();
    const [showAiPanel, setShowAiPanel] = useState(false);
    const [aiSuggestion, setAiSuggestion] = useState("");
    const [aiReview, setAiReview] = useState("");
    const [aiLoading, setAiLoading] = useState(false);
    const [aiPromptType, setAiPromptType] = useState<"improve" | "shorten" | "expand" | "custom" | "review" | "fix_issue">("improve");
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
    const [reviewFocus, setReviewFocus] = useState<"style" | "consistency" | "beta_reader">("style");
    const [reviewDownloadUrl, setReviewDownloadUrl] = useState<string | null>(null);
    const [reviewStatusMsg, setReviewStatusMsg] = useState<string | null>(null);
    const [reviewCostLabel, setReviewCostLabel] = useState<string | null>(null);
    const reviewEventSource = useRef<EventSource | null>(null);
    const [wordGoal, setWordGoal] = useState<number | null>(() => {
        if (!chapterId) return null;
        const stored = localStorage.getItem(`bibliogon-word-goal-${chapterId}`);
        return stored ? parseInt(stored, 10) : null;
    });
    const [editingGoal, setEditingGoal] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [replaceTerm, setReplaceTerm] = useState("");
    const [recoveryDraft, setRecoveryDraft] = useState<{content: string; savedAt: number} | null>(null);
    const serverContentHash = useRef(hashContent(content));
    const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
                        t("ui.editor.save_failed", "Speichern fehlgeschlagen. Deine Änderungen sind lokal gesichert."),
                        () => { void performSave(json); },
                        t("ui.editor.save_retry", "Erneut versuchen"),
                    );
                }
                return;
            }
            lastSaved.current = json;
            if (chapterId) deleteDraft(chapterId);
            serverContentHash.current = hashContent(json);
            setSaveStatus("saved");
            setTimeout(() => setSaveStatus("idle"), 2000);
        },
        [onSave, chapterId, t],
    );

    const debouncedSave = useCallback(
        (json: string) => {
            if (saveTimer.current) clearTimeout(saveTimer.current);
            setSaveStatus("saving");
            saveTimer.current = setTimeout(() => { void performSave(json); }, autosaveDebounceMs);

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
        [performSave, chapterId, bookId, autosaveDebounceMs, draftSaveDebounceMs]
    );

    // Flush pending saves on tab close / page unload / backgrounding. Uses
    // IndexedDB (Dexie writes via a transaction queue that survives the
    // tab dying) plus a best-effort keepalive fetch. Reuses the existing
    // `editorRef` (wired by the useEffect further down).
    const flushPendingSaveRef = useRef<() => void>(() => {});
    useFlushOnUnload(() => flushPendingSaveRef.current());

    const parseContent = (raw: string): Record<string, unknown> | string => {
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object" && parsed.type === "doc") {
                return parsed;
            }
        } catch {
            // Not JSON, treat as HTML for backward compatibility
        }
        return raw;
    };

    const editorRef = useRef<TiptapEditor | null>(null);

    const uploadAndInsertImage = async (file: File) => {
        if (!bookId) return;
        try {
            const asset = await api.assets.upload(bookId, file, "figure");
            const src = `/api/books/${bookId}/assets/file/${asset.filename}`;
            editorRef.current?.chain().focus().setImage({src, alt: file.name}).run();
        } catch (err) {
            notify.error(t("ui.editor.upload_failed", "Upload fehlgeschlagen"), err);
        }
    };

    const editor = useEditor({
        extensions: [
            StarterKit,
            Figure.configure({
                allowBase64: true,
            }),
            Link.configure({
                openOnClick: false,
                HTMLAttributes: {
                    class: "tiptap-link",
                },
            }),
            TextAlign.configure({
                types: ["heading", "paragraph"],
            }),
            Underline,
            Subscript,
            Superscript,
            Highlight.configure({multicolor: true}),
            Typography,
            Table.configure({resizable: true}),
            TableRow,
            TableCell,
            TableHeader,
            TaskList,
            TaskItem.configure({nested: true}),
            CharacterCount,
            TextStyle,
            Color,
            Footnotes,
            FootnoteReference,
            Footnote,
            SearchAndReplace.configure({
                searchResultClass: "search-result",
                disableRegex: true,
            }),
            Placeholder.configure({
                placeholder: placeholder || "Beginne zu schreiben...",
            }),
            OfficePaste,
            Focus.configure({
                className: "has-focus",
                mode: "deepest",
            }),
            StyleCheckExtension,
        ],
        content: parseContent(content),
        onUpdate: ({editor}) => {
            syncCountsRef.current(editor);
            const json = JSON.stringify(editor.getJSON());
            debouncedSave(json);
        },
        editorProps: {
            attributes: {
                class: "tiptap-editor",
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
    useEffect(() => { editorRef.current = editor; }, [editor]);

    // Keep the flush callback fresh: on every render capture the current
    // chapterId, bookId, and editor. Invoked from beforeunload/pagehide/
    // visibilitychange handlers installed by `useFlushOnUnload` above.
    useEffect(() => {
        flushPendingSaveRef.current = () => {
            if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
            if (draftTimer.current) { clearTimeout(draftTimer.current); draftTimer.current = null; }
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
                    notify.info(t("ui.metadata.quality_nav_no_issues", "Keine Treffer in diesem Kapitel"));
                    return;
                }
                // Offsets are plain-text; convert via a temp doc walk
                // that mirrors StyleCheckExtension's mapping.
                const doc = editor.state.doc;
                let charCount = 0;
                let from: number | null = null;
                let to: number | null = null;
                doc.descendants((node, pos) => {
                    if (from !== null && to !== null) return false;
                    if (node.isText && node.text) {
                        const nodeEnd = charCount + node.text.length;
                        if (from === null && match.offset >= charCount && match.offset < nodeEnd) {
                            from = pos + (match.offset - charCount);
                        }
                        const endOffset = match.offset + match.length;
                        if (to === null && endOffset >= charCount && endOffset <= nodeEnd) {
                            to = pos + (endOffset - charCount);
                        }
                        charCount = nodeEnd;
                    } else if (node.isBlock && charCount > 0) {
                        charCount += 1;
                    }
                    return undefined;
                });
                if (from === null) return;
                editor.chain()
                    .focus()
                    .setTextSelection({from, to: to ?? from})
                    .scrollIntoView()
                    .run();
                // Arm the "fix issue" AI mode for this finding. The AI
                // panel stays closed until the user clicks; the button
                // on the quality tab is diagnosis, not remediation.
                setActiveIssue({
                    type: match.type as "filler_word" | "passive_voice" | "adverb" | "long_sentence",
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
        return () => { cancelled = true; };
    }, [editor, initialFocus?.type, initialFocus?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

    // Clear activeIssue on chapter switch. The finding offsets belong
    // to the previous chapter's plain text, so re-using them after a
    // swap would jump to the wrong range.
    useEffect(() => {
        setActiveIssue(null);
        setAiPromptType((prev) => (prev === "fix_issue" ? "improve" : prev));
    }, [chapterId]);

    // Check for recovery draft when chapter loads
    useEffect(() => {
        if (!chapterId || !editor) return;
        const activeChapter = chapterId;
        checkForRecovery(chapterId, content, new Date().toISOString()).then((draft) => {
            if (draft && activeChapter === chapterId) {
                setRecoveryDraft({content: draft.content, savedAt: draft.savedAt});
            }
        });
        serverContentHash.current = hashContent(content);
    }, [chapterId]);

    // Cleanup old drafts on mount
    useEffect(() => { cleanupOldDrafts(draftMaxAgeDays); }, [draftMaxAgeDays]);


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
                const tokensLabel = tokens >= 1000 ? `${Math.round(tokens / 100) / 10}k` : `${tokens}`;
                if (cost !== null) {
                    setReviewCostLabel(`~${tokensLabel} ${t("ui.editor.ai_review_tokens", "tokens")}, ~$${cost.toFixed(3)}`);
                } else {
                    setReviewCostLabel(`~${tokensLabel} ${t("ui.editor.ai_review_tokens", "tokens")}`);
                }
            })
            .catch(() => {
                if (!cancelled) setReviewCostLabel(null);
            });
        return () => { cancelled = true; };
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
            notify.error(detail || t("ui.editor.spellcheck_error", "Rechtschreibprüfung fehlgeschlagen"));
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
            const {from, to} = editor.state.selection;
            let text = from !== to ? editor.state.doc.textBetween(from, to, "\n") : editor.getText();
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
                notify.error(detail || t("ui.editor.preview_error", "Vorschau fehlgeschlagen"));
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
    ): {from: number; to: number} | null => {
        const plain = ed.getText();
        const {start, end} = findEnclosingSentence(plain, issueOffset, issueLength);
        const doc = ed.state.doc;
        let charCount = 0;
        let from: number | null = null;
        let to: number | null = null;
        doc.descendants((node, pos) => {
            if (from !== null && to !== null) return false;
            if (node.isText && node.text) {
                const nodeEnd = charCount + node.text.length;
                if (from === null && start >= charCount && start < nodeEnd) {
                    from = pos + (start - charCount);
                }
                // For `to`, a position that lands exactly at a text
                // node boundary is still valid (inclusive end).
                if (to === null && end >= charCount && end <= nodeEnd) {
                    to = pos + (end - charCount);
                }
                charCount = nodeEnd;
            } else if (node.isBlock && charCount > 0) {
                charCount += 1;
            }
            return undefined;
        });
        if (from === null) return null;
        if (to === null) to = from;
        if (to < from) return null;
        return {from, to};
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
            editor.chain().focus().setTextSelection({from: range.from, to: range.to}).run();
        }

        const {from, to} = editor.state.selection;
        const selectedText = from !== to ? editor.state.doc.textBetween(from, to, "\n") : "";
        if (!selectedText.trim()) {
            notify.info(t("ui.editor.ai_select_text", "Markiere zuerst einen Text für AI-Vorschläge"));
            return;
        }
        setShowAiPanel(true);
        setAiLoading(true);
        setAiSuggestion("");

        // Build context-aware system prompt. Article + book-chapter
        // contexts diverge: article tone targets online-publication
        // (engaging, accessible, SEO-aware), book-chapter tone matches
        // genre + book identity. See parity analysis Open Question 3.
        const ctx = bookContext;
        const contextLines: string[] = [];
        if (ctx?.language) contextLines.push(`Language: ${ctx.language}`);
        if (contentKind === "book-chapter") {
            if (ctx?.genre) contextLines.push(`Genre: ${ctx.genre}`);
            if (ctx?.title) contextLines.push(`Book: ${ctx.title}`);
            if (chapterTitle) contextLines.push(`Chapter: ${chapterTitle}`);
        } else {
            // Article: chapterTitle slot holds the article title.
            if (chapterTitle) contextLines.push(`Article: ${chapterTitle}`);
        }
        const toneHint = contentKind === "article"
            ? "Match an engaging, accessible online-publication tone. The output should read well as a standalone article."
            : "Match the tone and style appropriate for this genre and language.";
        const contextBlock = contextLines.length > 0
            ? `\n\nContext:\n${contextLines.join("\n")}\n\n${toneHint}`
            : "";

        const fixIssuePrompt = activeIssue
            ? FIX_ISSUE_PROMPTS[activeIssue.type] + contextBlock
            : "";

        const basePrompts: Record<string, string> = contentKind === "article"
            ? {
                improve: `You are a professional editor for online publications. Improve the following article excerpt: fix grammar, improve clarity, sharpen voice for online readers. Return only the improved text.${contextBlock}`,
                shorten: `You are a professional editor. Tighten the following article excerpt without losing meaning. Favor punchy phrasing suitable for online reading. Return only the shortened text.${contextBlock}`,
                expand: `You are a professional writer for online publications. Expand the following article excerpt with concrete detail and examples. Keep the tone engaging. Return only the expanded text.${contextBlock}`,
                custom: (aiCustomPrompt || "Improve this article excerpt.") + contextBlock,
                fix_issue: fixIssuePrompt,
            }
            : {
                improve: `You are a professional editor. Improve the following text: fix grammar, improve clarity and flow. Return only the improved text.${contextBlock}`,
                shorten: `You are a professional editor. Make the following text more concise without losing meaning. Return only the shortened text.${contextBlock}`,
                expand: `You are a professional writer. Expand the following text with more detail and description. Return only the expanded text.${contextBlock}`,
                custom: (aiCustomPrompt || "Improve this text.") + contextBlock,
                fix_issue: fixIssuePrompt,
            };

        try {
            const data = await api.ai.generate(selectedText, basePrompts[aiPromptType], bookId || "");
            setAiSuggestion(data.content || "");
        } catch (err) {
            const detail = err instanceof ApiError ? err.detail : null;
            notify.error(detail || t("ui.editor.ai_error", "AI nicht erreichbar"));
            setAiSuggestion("");
        }
        setAiLoading(false);
    };

    const handleAiApply = () => {
        if (!editor || !aiSuggestion) return;
        const {from, to} = editor.state.selection;
        if (from !== to) {
            editor.chain().focus().deleteRange({from, to}).insertContentAt(from, aiSuggestion).run();
            notify.success(t("ui.editor.ai_applied", "AI-Vorschlag übernommen"));
        }
        setShowAiPanel(false);
        setAiSuggestion("");
    };

    const bookLanguage = bookContext?.language || document.documentElement.getAttribute("lang") || "de";

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
            notify.error(detail || t("ui.editor.ai_error", "AI nicht erreichbar"));
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
                const parsed = JSON.parse(ev.data) as {type: string; data: Record<string, unknown>};
                if (parsed.type === "review_start") {
                    setReviewStatusMsg(reviewString(bookLanguage, "status_analyzing"));
                } else if (parsed.type === "review_llm_call") {
                    setReviewStatusMsg(reviewString(bookLanguage, "status_generating"));
                } else if (parsed.type === "review_done") {
                    const url = typeof parsed.data.download_url === "string" ? parsed.data.download_url : null;
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
        saveStatus === "saving" ? t("ui.editor.saving", "Speichert...") :
        saveStatus === "saved" ? t("ui.editor.saved", "Gespeichert") :
        saveStatus === "error" ? t("ui.editor.save_failed_short", "Speichern fehlgeschlagen") :
        "";

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
                    <div style={{flex: 1}}>
                        <strong>{t("ui.editor.recovery_title", "Ungespeicherte Änderungen gefunden")}</strong>
                        <p style={{margin: "4px 0 0", fontSize: "0.8125rem", color: "var(--text-secondary)"}}>
                            {t("ui.editor.recovery_desc", "Änderungen vom {timestamp} gefunden, die nicht gespeichert wurden.")
                                .replace("{timestamp}", new Date(recoveryDraft.savedAt).toLocaleString())}
                        </p>
                    </div>
                    <div style={{display: "flex", gap: 8}}>
                        <button className="btn btn-primary btn-sm" onClick={handleRestore}>
                            {t("ui.editor.recovery_restore", "Wiederherstellen")}
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={handleDiscardDraft}>
                            {t("ui.editor.recovery_discard", "Verwerfen")}
                        </button>
                    </div>
                </div>
            )}

            <Toolbar
                editor={editor}
                markdownMode={markdownMode}
                onToggleMarkdown={handleToggleMarkdown}
                onToggleSearch={() => setShowSearch(!showSearch)}
                focusMode={focusMode}
                onToggleFocus={() => setFocusMode(!focusMode)}
                spellcheckActive={showSpellcheck}
                onToggleSpellcheck={isPluginAvailable(pluginStatus, "grammar") ? handleToggleSpellcheck : undefined}
                onPreviewAudio={gates.showAudiobook && isPluginAvailable(pluginStatus, "audiobook") ? handlePreviewAudio : undefined}
                previewLoading={previewLoading}
                previewDisabledReason={gates.showAudiobook && !isPluginAvailable(pluginStatus, "audiobook") ? pluginDisabledMessage(pluginStatus, "audiobook") : undefined}
                aiPanelActive={showAiPanel}
                onToggleAi={isPluginAvailable(pluginStatus, "ai") ? () => setShowAiPanel(!showAiPanel) : undefined}
                aiDisabledReason={!isPluginAvailable(pluginStatus, "ai") ? pluginDisabledMessage(pluginStatus, "ai") : undefined}
                spellcheckDisabledReason={!isPluginAvailable(pluginStatus, "grammar") ? pluginDisabledMessage(pluginStatus, "grammar") : undefined}
                styleCheckActive={styleCheckActive}
                styleCheckLoading={styleCheckLoading}
                onToggleStyleCheck={isPluginAvailable(pluginStatus, "ms-tools") ? handleToggleStyleCheck : undefined}
            />

            {/* TTS Preview Player */}
            {previewAudioUrl && (
                <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "6px 12px",
                    background: "var(--bg-secondary)",
                    borderBottom: "1px solid var(--border)",
                }}>
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <audio
                        controls
                        autoPlay
                        src={previewAudioUrl}
                        onEnded={() => {
                            URL.revokeObjectURL(previewAudioUrl);
                            setPreviewAudioUrl(null);
                        }}
                        style={{height: 32, flex: 1, maxWidth: 400}}
                    />
                    <button
                        className="btn-icon"
                        onClick={() => {
                            URL.revokeObjectURL(previewAudioUrl);
                            setPreviewAudioUrl(null);
                        }}
                        title={t("ui.common.close", "Schließen")}
                        style={{padding: 4, fontSize: "1rem", lineHeight: 1}}
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
                        <div style={{display: "flex", gap: 4, marginLeft: "auto", flexWrap: "wrap"}}>
                            {activeIssue && (
                                <button
                                    key="fix_issue"
                                    data-testid="ai-fix-issue-mode"
                                    className={`btn btn-sm ${aiPromptType === "fix_issue" ? "btn-primary" : "btn-ghost"}`}
                                    onClick={() => { setAiPromptType("fix_issue"); setAiSuggestion(""); setAiReview(""); }}
                                    style={{padding: "2px 8px", fontSize: "0.75rem"}}
                                >
                                    {t("ui.editor.ai_fix_issue", "Problem beheben")}
                                </button>
                            )}
                            {(["improve", "shorten", "expand", "custom", "review"] as const).map((type) => (
                                <button
                                    key={type}
                                    className={`btn btn-sm ${aiPromptType === type ? "btn-primary" : "btn-ghost"}`}
                                    onClick={() => { setAiPromptType(type); setAiSuggestion(""); setAiReview(""); }}
                                    style={{padding: "2px 8px", fontSize: "0.75rem"}}
                                >
                                    {type === "improve" ? t("ui.editor.ai_improve", "Verbessern")
                                        : type === "shorten" ? t("ui.editor.ai_shorten", "Kürzen")
                                        : type === "expand" ? t("ui.editor.ai_expand", "Erweitern")
                                        : type === "custom" ? t("ui.editor.ai_custom", "Eigener Prompt")
                                        : t("ui.editor.ai_review", "Review")}
                                </button>
                            ))}
                        </div>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setShowAiPanel(false); setAiReview(""); }}>&times;</button>
                    </div>
                    {aiPromptType === "custom" && (
                        <input
                            className="input"
                            style={{margin: "6px 16px", width: "calc(100% - 32px)", fontSize: "0.8125rem"}}
                            placeholder={t("ui.editor.ai_custom_placeholder", "z.B. Mache den Ton formeller...")}
                            value={aiCustomPrompt}
                            onChange={(e) => setAiCustomPrompt(e.target.value)}
                        />
                    )}
                    {aiPromptType === "review" ? (
                        <>
                            <div style={{padding: "4px 16px"}}>
                                <small style={{color: "var(--text-muted)", fontSize: "0.75rem"}}>
                                    {t("ui.editor.ai_review_hint", "Analysiert das gesamte Kapitel auf Stil, Kohaerenz und Pacing.")}
                                </small>
                            </div>
                            <div
                                role="radiogroup"
                                aria-label={t("ui.editor.ai_review_focus", "Review-Fokus")}
                                style={{padding: "4px 16px", display: "flex", gap: 12, flexWrap: "wrap"}}
                            >
                                {(["style", "consistency", "beta_reader"] as const).map((value) => (
                                    <label
                                        key={value}
                                        data-testid={`ai-review-focus-${value}`}
                                        style={{display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.8125rem", cursor: "pointer"}}
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
                                                ? t("ui.editor.ai_review_focus_consistency", "Konsistenz")
                                                : t("ui.editor.ai_review_focus_beta_reader", "Testleser")}
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
                            <div style={{padding: "6px 16px", display: "flex", gap: 8, alignItems: "center"}}>
                                <button
                                    data-testid="ai-review-start"
                                    className="btn btn-primary btn-sm"
                                    onClick={handleAiReview}
                                    disabled={aiLoading}
                                >
                                    {aiLoading
                                        ? (reviewStatusMsg || t("ui.editor.ai_loading", "Denke nach..."))
                                        : t("ui.editor.ai_review_start", "Kapitel reviewen")}
                                </button>
                                {reviewCostLabel && !aiLoading && (
                                    <small data-testid="ai-review-cost" style={{color: "var(--text-muted)", fontSize: "0.75rem"}}>
                                        {reviewCostLabel}
                                    </small>
                                )}
                            </div>
                            {aiReview && (
                                <div className={styles.aiSuggestion}>
                                    <div style={{fontSize: "0.8125rem", whiteSpace: "pre-wrap", color: "var(--text-primary)", lineHeight: 1.6}}>
                                        {aiReview}
                                    </div>
                                    <div style={{display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap"}}>
                                        {reviewDownloadUrl && (
                                            <a
                                                data-testid="ai-review-download"
                                                className="btn btn-ghost btn-sm"
                                                href={reviewDownloadUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                download
                                            >
                                                {t("ui.editor.ai_review_download", "Bericht herunterladen")}
                                            </a>
                                        )}
                                        <button className="btn btn-ghost btn-sm" onClick={() => { setAiReview(""); setReviewDownloadUrl(null); }}>
                                            {t("ui.editor.ai_review_close", "Schließen")}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            {aiPromptType === "fix_issue" && activeIssue && (
                                <div data-testid="ai-fix-issue-hint" style={{padding: "4px 16px"}}>
                                    <small style={{color: "var(--text-muted)", fontSize: "0.75rem"}}>
                                        {t("ui.editor.ai_fix_issue_hint", "AI formuliert den markierten Satz um.")} ({ISSUE_TYPE_LABELS[activeIssue.type](t)})
                                    </small>
                                </div>
                            )}
                            <div style={{padding: "6px 16px", display: "flex", gap: 8}}>
                                <button
                                    data-testid={aiPromptType === "fix_issue" ? "ai-fix-issue-run" : undefined}
                                    className="btn btn-primary btn-sm"
                                    onClick={handleAiSuggest}
                                    disabled={aiLoading || (aiPromptType === "fix_issue" && !activeIssue)}
                                >
                                    {aiLoading
                                        ? (aiPromptType === "fix_issue" && activeIssue
                                            ? t("ui.editor.ai_fix_issue_loading", "AI arbeitet am Satz...")
                                            : t("ui.editor.ai_loading", "Denke nach..."))
                                        : (aiPromptType === "fix_issue"
                                            ? t("ui.editor.ai_fix_issue_run", "Vorschlag generieren")
                                            : t("ui.editor.ai_suggest", "Vorschlag generieren"))}
                                </button>
                            </div>
                            {aiSuggestion && (
                                <div className={styles.aiSuggestion}>
                                    <div style={{fontSize: "0.8125rem", whiteSpace: "pre-wrap", color: "var(--text-primary)"}}>
                                        {aiSuggestion}
                                    </div>
                                    <div style={{display: "flex", gap: 8, marginTop: 8}}>
                                        <button className="btn btn-primary btn-sm" onClick={handleAiApply}>
                                            {t("ui.editor.ai_apply", "Übernehmen")}
                                        </button>
                                        <button className="btn btn-ghost btn-sm" onClick={() => setAiSuggestion("")}>
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
                        className={styles.searchInput}
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
                        className={styles.searchInput}
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
                    <button className="btn btn-ghost btn-sm" onClick={() => editor.commands.previousSearchResult()}>
                        &lt;
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => editor.commands.nextSearchResult()}>
                        &gt;
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => editor.commands.replace()}>
                        {t("ui.editor.replace_one", "Ersetzen")}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => editor.commands.replaceAll()}>
                        {t("ui.editor.replace_all", "Alle")}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setShowSearch(false); setSearchTerm(""); setReplaceTerm(""); editor.commands.setSearchTerm(""); }}>
                        &times;
                    </button>
                </div>
            )}

            {/* Spellcheck results panel */}
            {showSpellcheck && !markdownMode && (
                <div className={styles.spellcheckPanel}>
                    <div className={styles.spellcheckHeader}>
                        <strong>{t("ui.editor.spellcheck", "Rechtschreibprüfung")}</strong>
                        {spellcheckLoading && <span style={{color: "var(--text-muted)", marginLeft: 8}}>{t("ui.editor.checking", "Prüfe...")}</span>}
                        {!spellcheckLoading && <span style={{color: "var(--text-muted)", marginLeft: 8}}>{spellcheckResults.length} {t("ui.editor.issues", "Probleme")}</span>}
                        <button className="btn btn-ghost btn-sm" style={{marginLeft: "auto"}} onClick={handleToggleSpellcheck}>&times;</button>
                    </div>
                    {spellcheckResults.length > 0 && (
                        <div className={styles.spellcheckList}>
                            {spellcheckResults.map((issue, i) => (
                                <div key={i} className={styles.spellcheckItem}>
                                    <div style={{fontSize: "0.8125rem", color: "var(--text-primary)"}}>
                                        {issue.message}
                                    </div>
                                    {issue.replacements.length > 0 && (
                                        <div style={{fontSize: "0.75rem", color: "var(--accent)", marginTop: 2}}>
                                            {t("ui.editor.suggestions", "Vorschläge")}: {issue.replacements.join(", ")}
                                        </div>
                                    )}
                                    <div style={{fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: 2}}>
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
                    {/* Word goal */}
                    {chapterId && !editingGoal && (
                        <button
                            className={styles.goalBtn}
                            onClick={() => setEditingGoal(true)}
                            title={t("ui.editor.set_goal", "Wortziel setzen")}
                        >
                            {wordGoal ? `${t("ui.editor.goal", "Ziel")}: ${wordGoal}` : `+ ${t("ui.editor.goal", "Ziel")}`}
                        </button>
                    )}
                    {editingGoal && (
                        <input
                            className={styles.goalInput}
                            type="number"
                            min="0"
                            placeholder="z.B. 2000"
                            defaultValue={wordGoal ?? ""}
                            autoFocus
                            onBlur={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (val > 0) {
                                    setWordGoal(val);
                                    localStorage.setItem(`bibliogon-word-goal-${chapterId}`, String(val));
                                } else {
                                    setWordGoal(null);
                                    localStorage.removeItem(`bibliogon-word-goal-${chapterId}`);
                                }
                                setEditingGoal(false);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                if (e.key === "Escape") setEditingGoal(false);
                            }}
                        />
                    )}
                </span>
                {/* Progress bar for word goal */}
                {wordGoal && wordGoal > 0 && (
                    <div className={styles.goalProgress}>
                        <div className={styles.goalProgressFill} style={{
                            width: `${Math.min(100, (wordCount / wordGoal) * 100)}%`,
                            background: wordCount >= wordGoal ? "#16a34a" : "var(--accent)",
                        }}/>
                    </div>
                )}
                {statusLabel && (
                    <span className={styles.saveStatus} style={{
                        color:
                            saveStatus === "saving" ? "var(--text-muted)" :
                            saveStatus === "error" ? "var(--danger, #b91c1c)" :
                            "var(--accent)",
                    }} data-testid={`editor-save-status-${saveStatus}`}>
                        {statusLabel}
                    </span>
                )}
            </div>

            <div className={styles.editorArea}>
                <div className={`${styles.editorContainer} ${focusMode ? "focus-mode" : ""}`}>
                    {markdownMode ? (
                        <textarea
                            className={styles.markdownEditor}
                            value={markdownText}
                            onChange={handleMarkdownChange}
                            spellCheck={false}
                        />
                    ) : (
                        <EditorContent editor={editor}/>
                    )}
                </div>
            </div>
        </div>
    );
}

function editorToMarkdown(editor: TiptapEditor | null): string {
    if (!editor) return "";
    // Simple text extraction - the full TipTap-JSON to Markdown conversion
    // happens server-side in the export plugin. This is a lightweight preview.
    const doc = editor.getJSON();
    return nodeToMarkdown(doc);
}

function nodeToMarkdown(node: Record<string, unknown>): string {
    if (!node) return "";
    const type = node.type as string;
    const content = node.content as Record<string, unknown>[] | undefined;
    const attrs = node.attrs as Record<string, unknown> | undefined;

    if (type === "doc") {
        return (content || []).map(nodeToMarkdown).join("\n\n");
    }
    if (type === "paragraph") {
        return inlineToMarkdown(content || []);
    }
    if (type === "heading") {
        const level = (attrs?.level as number) || 1;
        return "#".repeat(level) + " " + inlineToMarkdown(content || []);
    }
    if (type === "bulletList") {
        return (content || []).map((item) => {
            const inner = (item.content as Record<string, unknown>[] || []).map(nodeToMarkdown).join("\n");
            return "- " + inner;
        }).join("\n");
    }
    if (type === "orderedList") {
        return (content || []).map((item, i) => {
            const inner = (item.content as Record<string, unknown>[] || []).map(nodeToMarkdown).join("\n");
            return `${i + 1}. ${inner}`;
        }).join("\n");
    }
    if (type === "blockquote") {
        const inner = (content || []).map(nodeToMarkdown).join("\n");
        return inner.split("\n").map((l) => "> " + l).join("\n");
    }
    if (type === "codeBlock") {
        const lang = (attrs?.language as string) || "";
        const code = (content || []).map((n) => (n.text as string) || "").join("");
        return "```" + lang + "\n" + code + "\n```";
    }
    if (type === "imageFigure" || type === "figure") {
        const src = (attrs?.src as string) || "";
        const alt = (attrs?.alt as string) || "";
        const caption = content ? inlineToMarkdown(content) : "";
        let md = `![${alt}](${src})`;
        if (caption) {
            md += `\n*${caption}*`;
        }
        return md;
    }
    if (type === "image") {
        const src = (attrs?.src as string) || "";
        const alt = (attrs?.alt as string) || "";
        return `![${alt}](${src})`;
    }
    if (type === "horizontalRule") {
        return "---";
    }
    if (type === "text") {
        let text = (node.text as string) || "";
        const marks = node.marks as Record<string, unknown>[] | undefined;
        if (marks) {
            for (const mark of marks) {
                const mt = mark.type as string;
                if (mt === "bold") text = `**${text}**`;
                else if (mt === "italic") text = `*${text}*`;
                else if (mt === "strike") text = `~~${text}~~`;
                else if (mt === "code") text = "`" + text + "`";
                else if (mt === "link") {
                    const href = (mark.attrs as Record<string, unknown>)?.href as string || "";
                    text = `[${text}](${href})`;
                }
            }
        }
        return text;
    }
    return "";
}

function inlineToMarkdown(nodes: Record<string, unknown>[]): string {
    return nodes.map(nodeToMarkdown).join("");
}

/**
 * Convert Markdown text to HTML so TipTap can parse it correctly.
 * Handles headings, bold, italic, strikethrough, code, links, lists,
 * blockquotes, code blocks, and horizontal rules.
 */
function markdownToHtml(md: string): string {
    const lines = md.split("\n");
    const htmlLines: string[] = [];
    let inCodeBlock = false;
    let codeBlockContent: string[] = [];
    let inList: "ul" | "ol" | null = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Code blocks
        if (line.startsWith("```")) {
            if (inCodeBlock) {
                htmlLines.push(`<pre><code>${codeBlockContent.join("\n")}</code></pre>`);
                codeBlockContent = [];
                inCodeBlock = false;
            } else {
                if (inList) { htmlLines.push(inList === "ul" ? "</ul>" : "</ol>"); inList = null; }
                inCodeBlock = true;
            }
            continue;
        }
        if (inCodeBlock) {
            codeBlockContent.push(line.replace(/</g, "&lt;").replace(/>/g, "&gt;"));
            continue;
        }

        // Close list if current line is not a list item
        if (inList && !line.match(/^[-*]\s/) && !line.match(/^\d+\.\s/) && line.trim() !== "") {
            htmlLines.push(inList === "ul" ? "</ul>" : "</ol>");
            inList = null;
        }

        // Empty line
        if (line.trim() === "") {
            if (inList) { htmlLines.push(inList === "ul" ? "</ul>" : "</ol>"); inList = null; }
            continue;
        }

        // Horizontal rule
        if (line.match(/^---+$/)) {
            htmlLines.push("<hr>");
            continue;
        }

        // Headings
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
            const level = headingMatch[1].length;
            htmlLines.push(`<h${level}>${inlineMarkdown(headingMatch[2])}</h${level}>`);
            continue;
        }

        // Blockquote
        if (line.startsWith("> ")) {
            htmlLines.push(`<blockquote><p>${inlineMarkdown(line.slice(2))}</p></blockquote>`);
            continue;
        }

        // Unordered list
        const ulMatch = line.match(/^[-*]\s+(.+)$/);
        if (ulMatch) {
            if (inList !== "ul") {
                if (inList) htmlLines.push("</ol>");
                htmlLines.push("<ul>");
                inList = "ul";
            }
            htmlLines.push(`<li>${inlineMarkdown(ulMatch[1])}</li>`);
            continue;
        }

        // Ordered list
        const olMatch = line.match(/^\d+\.\s+(.+)$/);
        if (olMatch) {
            if (inList !== "ol") {
                if (inList) htmlLines.push("</ul>");
                htmlLines.push("<ol>");
                inList = "ol";
            }
            htmlLines.push(`<li>${inlineMarkdown(olMatch[1])}</li>`);
            continue;
        }

        // Image: ![alt](src) - standalone on a line
        // If next line is italic (*caption*), treat as figure+figcaption
        const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
        if (imgMatch) {
            const nextLine = i + 1 < lines.length ? lines[i + 1] : "";
            const captionMatch = nextLine.match(/^\*([^*]+)\*\s*$/);
            if (captionMatch) {
                htmlLines.push(
                    `<figure><img src="${imgMatch[2]}" alt="${imgMatch[1]}" />` +
                    `<figcaption>${captionMatch[1]}</figcaption></figure>`
                );
                i++; // skip caption line
            } else {
                htmlLines.push(`<img src="${imgMatch[2]}" alt="${imgMatch[1]}" />`);
            }
            continue;
        }

        // Paragraph (also handle inline images)
        htmlLines.push(`<p>${inlineMarkdown(line)}</p>`);
    }

    if (inList) htmlLines.push(inList === "ul" ? "</ul>" : "</ol>");
    if (inCodeBlock) htmlLines.push(`<pre><code>${codeBlockContent.join("\n")}</code></pre>`);

    return htmlLines.join("\n");
}

function inlineMarkdown(text: string): string {
    return text
        // Images must be before links (both use [...](...)  syntax)
        .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />')
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/~~(.+?)~~/g, "<s>$1</s>")
        .replace(/`(.+?)`/g, "<code>$1</code>")
        .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
}
