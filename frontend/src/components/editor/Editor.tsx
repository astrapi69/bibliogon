import { useEffect, useRef, useState } from "react";
import {
    useEditorPluginStatus,
    isPluginAvailable,
    pluginDisabledMessage,
} from "../../hooks/editor/useEditorPluginStatus";
import { useFullscreenToggle } from "../../hooks/ui/useFullscreenToggle";
import { useTypewriterScroll } from "../../hooks/useTypewriterScroll";
import { useKeyboardShortcuts } from "../../hooks/ui/useKeyboardShortcuts";
import { useEditor, EditorContent, type Editor as TiptapEditor } from "@tiptap/react";
import { deleteDraft, checkForRecovery, cleanupOldDrafts, hashContent } from "../../db/drafts";
import "katex/dist/katex.min.css";
import { buildEditorExtensions } from "../editorExtensions";
import { findEnclosingSentence } from "../../data/fix-issue-prompts";
import Toolbar from "./Toolbar";
import EditorDisplaySettingsPopover from "./EditorDisplaySettingsPopover";
import {
    buildMentionLabels,
    createStoryBibleMention,
    handleMentionClick,
} from "../storyBibleMention";
import EditorContextMenu from "./EditorContextMenu";
import EditorAiPanel from "./EditorAiPanel";
import {
    EditorSearchBar,
    EditorSpellcheckPanel,
    EditorRecoveryBanner,
    EditorAudioPreview,
} from "./EditorPanels";
import { useEditorDisplaySettings } from "../../hooks/editor/useEditorDisplaySettings";
import { useAiChapterReview } from "../../hooks/ai/useAiChapterReview";
import { useEditorWordCount } from "../../hooks/editor/useEditorWordCount";
import EditorStatusBar from "../../lib/components/EditorStatusBar";
import { WORDS_PER_MINUTE } from "../../lib/utils/textStats";
import { useEditorAutosave } from "../../hooks/editor/useEditorAutosave";
import { useEditorTools } from "../../hooks/editor/useEditorTools";
import { useI18n } from "../../hooks/useI18n";
import { useFeature } from "@astrapi69/feature-strategy-react";
import { FEATURES } from "../../features/featureConfig";
import { api, ApiError } from "../../api/client";
import { aiComplete, AiNotConfiguredError } from "../../ai/aiComplete";
import { getStorage } from "../../storage";
import { warnIfOfflineStorageNearlyFull } from "../../utils/storageQuota";
import { notify } from "../../utils/notify";
import { editorToMarkdown } from "../../utils/editor/tiptap-markdown";
import { markdownToHtml } from "../../lib/utils/markdownToHtml";
import { parseContent, textOffsetToDocPos, buildAiPrompts } from "../editorHelpers";

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
export { pluginsForContentKind } from "../editor-gates";
export type { ContentKind, PluginGates } from "../editor-gates";
import type { ContentKind } from "../editor-gates";
import { pluginsForContentKind as pluginsForKind } from "../editor-gates";
import styles from "../Editor.module.css";

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
    const { t } = useI18n();
    const autosave = useEditorAutosave({
        onSave,
        content,
        chapterId,
        bookId,
        chapterVersion,
        autosaveDebounceMs,
        draftSaveDebounceMs,
    });
    const {
        saveStatus,
        performSave,
        debouncedSave,
        editorRef,
        lastSaved,
        serverContentHash,
        saveTimer,
        setSaveStatus,
    } = autosave;
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

    const imageInputRef = useRef<HTMLInputElement>(null);

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

    // Context-menu "Insert image": open a file picker, then run the
    // same upload+insert path as drag/paste. Only wired when the
    // surface has a bookId to upload assets against.
    const handleImageFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file && file.type.startsWith("image/")) {
            void uploadAndInsertImage(file);
        }
        event.target.value = "";
    };

    const { wordCount, charCount, syncCounts } = useEditorWordCount();

    const editor = useEditor({
        immediatelyRender: false,
        extensions: buildEditorExtensions(
            placeholder,
            mentionBookId ? [createStoryBibleMention(mentionBookId, buildMentionLabels(t))] : [],
        ),
        content: parseContent(content),
        onUpdate: ({ editor }) => {
            syncCounts(editor);
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

    const bookLanguage =
        bookContext?.language || document.documentElement.getAttribute("lang") || "de";

    // v0.20.x AI review extension (docs/explorations/ai-review-extension.md).
    // Owns the SSE EventSource ref + the review-specific state; the shared
    // AI-panel state stays here and is threaded in via setters.
    const chapterReview = useAiChapterReview({
        editor,
        showAiPanel,
        aiPromptType,
        chapterId,
        chapterTitle,
        chapterType,
        bookId,
        bookContext,
        bookLanguage,
        setShowAiPanel,
        setAiLoading,
        setAiReview,
        setAiSuggestion,
    });
    const {
        reviewFocus,
        setReviewFocus,
        reviewDownloadUrl,
        setReviewDownloadUrl,
        reviewStatusMsg,
        reviewCostLabel,
    } = chapterReview;

    // Grammar spellcheck + ms-tools style check + TTS audio preview.
    const tools = useEditorTools({ editor, bookId, chapterTitle, aiContextChars });
    const {
        showSpellcheck,
        spellcheckResults,
        spellcheckLoading,
        toggleSpellcheck: handleToggleSpellcheck,
        styleCheckActive,
        setStyleCheckActive,
        styleCheckLoading,
        toggleStyleCheck: handleToggleStyleCheck,
        previewLoading,
        previewAudio: handlePreviewAudio,
        previewAudioUrl,
        setPreviewAudioUrl,
    } = tools;

    // Initial render: seed the counts off the just-mounted editor.
    // (The live updates come from the onUpdate config callback above.)
    useEffect(() => {
        if (!editor) return;
        syncCounts(editor);
    }, [editor, syncCounts]);

    // Keep ref in sync for async callbacks (image upload). editorRef is a
    // stable ref from useEditorAutosave, so it is not a real dependency.
    useEffect(() => {
        editorRef.current = editor;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editor]);

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
        // eslint-disable-next-line react-hooks/exhaustive-deps
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

    // Close any open AI-review SSE stream on unmount. (The autosave
    // timer cleanup lives in useEditorAutosave.)
    const reviewCleanup = chapterReview.cleanup;
    useEffect(() => {
        return () => {
            reviewCleanup();
        };
    }, [reviewCleanup]);

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
            // Storage-mode-aware: offline (Dexie) goes browser-direct to the
            // user's provider; online uses the backend AI route. Same call site.
            const { content } = await aiComplete(
                [
                    { role: "system", content: basePrompts[aiPromptType] },
                    { role: "user", content: selectedText },
                ],
                { bookId: bookId || "" },
            );
            setAiSuggestion(content || "");
        } catch (err) {
            setAiSuggestion("");
            if (err instanceof AiNotConfiguredError) {
                notify.info(
                    t(
                        "ui.feature.requires_ai_key",
                        "This feature requires a configured AI key (Settings > AI Assistant)",
                    ),
                );
            } else {
                const detail = err instanceof ApiError ? err.detail : null;
                notify.error(detail || t("ui.editor.ai_error", "AI nicht erreichbar"), err);
            }
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

    const handleAiReview = chapterReview.runReview;

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
                <EditorRecoveryBanner
                    t={t}
                    savedAt={recoveryDraft.savedAt}
                    onRestore={handleRestore}
                    onDiscard={handleDiscardDraft}
                />
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
                <EditorAudioPreview
                    t={t}
                    src={previewAudioUrl}
                    onClose={() => {
                        URL.revokeObjectURL(previewAudioUrl);
                        setPreviewAudioUrl(null);
                    }}
                />
            )}

            {/* AI Assistant Panel */}
            {showAiPanel && !markdownMode && (
                <EditorAiPanel
                    t={t}
                    activeIssue={activeIssue}
                    aiPromptType={aiPromptType}
                    setAiPromptType={setAiPromptType}
                    setAiSuggestion={setAiSuggestion}
                    setAiReview={setAiReview}
                    setShowAiPanel={setShowAiPanel}
                    aiCustomPrompt={aiCustomPrompt}
                    setAiCustomPrompt={setAiCustomPrompt}
                    reviewFocus={reviewFocus}
                    setReviewFocus={setReviewFocus}
                    aiLoading={aiLoading}
                    chapterType={chapterType}
                    bookLanguage={bookLanguage}
                    onRunReview={handleAiReview}
                    aiGenDisabled={aiGen.isDisabled}
                    aiGenTitle={aiGenTitle}
                    reviewStatusMsg={reviewStatusMsg}
                    reviewCostLabel={reviewCostLabel}
                    aiReview={aiReview}
                    reviewDownloadUrl={reviewDownloadUrl}
                    setReviewDownloadUrl={setReviewDownloadUrl}
                    onRunSuggest={handleAiSuggest}
                    aiSuggestion={aiSuggestion}
                    onApplySuggestion={handleAiApply}
                />
            )}

            {/* Search & Replace bar */}
            {showSearch && !markdownMode && editor && (
                <EditorSearchBar
                    t={t}
                    editor={editor}
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                    replaceTerm={replaceTerm}
                    setReplaceTerm={setReplaceTerm}
                    onClose={() => setShowSearch(false)}
                />
            )}

            {/* Spellcheck results panel */}
            {showSpellcheck && !markdownMode && (
                <EditorSpellcheckPanel
                    t={t}
                    loading={spellcheckLoading}
                    results={spellcheckResults}
                    onClose={handleToggleSpellcheck}
                />
            )}

            {/* Status bar */}
            <div className={styles.statusBar}>
                <EditorStatusBar
                    wordCount={wordCount}
                    readingTimeMin={wordCount > 0 ? Math.ceil(wordCount / WORDS_PER_MINUTE) : 0}
                    charCount={charCount}
                    labels={{
                        words: t("ui.editor.words", "Wörter"),
                        readingTime: t("ui.editor.reading_time", "Min Lesezeit"),
                        characters: t("ui.editor.characters", "Zeichen"),
                    }}
                >
                    {/* Word target (read-only; set in the Storyboard). */}
                    {wordGoal && wordGoal > 0 && (
                        <span className={styles.goalBtn} data-testid="editor-word-goal">
                            · {t("ui.editor.goal", "Ziel")}: {wordGoal}
                        </span>
                    )}
                </EditorStatusBar>
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
                            onInsertImage={
                                bookId ? () => imageInputRef.current?.click() : undefined
                            }
                            onTakeSnapshot={
                                versionHistory.isActive && bookId && chapterId
                                    ? handleTakeSnapshot
                                    : undefined
                            }
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
                            onInsertImage={
                                bookId ? () => imageInputRef.current?.click() : undefined
                            }
                            onTakeSnapshot={
                                versionHistory.isActive && bookId && chapterId
                                    ? handleTakeSnapshot
                                    : undefined
                            }
                        >
                            <div>
                                <EditorContent editor={editor} />
                            </div>
                        </EditorContextMenu>
                    )}
                    <input
                        ref={imageInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleImageFileSelected}
                        style={{ display: "none" }}
                        data-testid="editor-image-input"
                    />
                </div>
            </div>
        </div>
    );
}
