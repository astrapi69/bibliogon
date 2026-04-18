import {useEffect, useRef, useCallback, useState} from "react";
import {useEditorPluginStatus, isPluginAvailable, pluginDisabledMessage} from "../hooks/useEditorPluginStatus";
import {useFlushOnUnload} from "../hooks/useFlushOnUnload";
import {useEditor, EditorContent, type Editor as TiptapEditor} from "@tiptap/react";
import {saveDraft, deleteDraft, checkForRecovery, cleanupOldDrafts, hashContent} from "../db/drafts";
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
import Toolbar from "./Toolbar";
import {useI18n} from "../hooks/useI18n";
import {api} from "../api/client";
import {notify} from "../utils/notify";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface BookContext {
    title: string;
    author: string;
    language: string;
    genre: string;
    description: string;
}

interface Props {
    content: string;
    onSave: (json: string) => void | Promise<void>;
    placeholder?: string;
    bookId?: string;
    chapterId?: string;
    chapterTitle?: string;
    bookContext?: BookContext;
    autosaveDebounceMs?: number;
    draftSaveDebounceMs?: number;
    draftMaxAgeDays?: number;
    aiContextChars?: number;
}

export default function Editor({content, onSave, placeholder, bookId, chapterId, chapterTitle, bookContext, autosaveDebounceMs = 800, draftSaveDebounceMs = 2000, draftMaxAgeDays = 30, aiContextChars = 2000}: Props) {
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
    const [aiPromptType, setAiPromptType] = useState<"improve" | "shorten" | "expand" | "custom" | "review">("improve");
    const [aiCustomPrompt, setAiCustomPrompt] = useState("");
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
                console.error("Autosave failed:", err);
                setSaveStatus("error");
                // While offline, OfflineBanner is already showing a
                // status message, and reconnect will auto-flush the
                // IndexedDB draft. Skip the retry toast in that case
                // to avoid double-notifying the user.
                if (typeof navigator !== "undefined" && navigator.onLine) {
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
            //    the IndexedDB draft covers it either way.
            api.chapters.updateKeepalive(bookId, chapterId, {content: json});
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
        };
    }, []);

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
            const res = await fetch("/api/grammar/check", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({text}),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({detail: "Grammar check failed"}));
                notify.error(err.detail || t("ui.editor.spellcheck_error", "Rechtschreibpruefung fehlgeschlagen"));
                setSpellcheckResults([]);
            } else {
                const data = await res.json();
                setSpellcheckResults(data.matches || []);
                if ((data.matches || []).length === 0) {
                    notify.success(t("ui.editor.spellcheck_ok", "Keine Fehler gefunden"));
                }
            }
        } catch {
            notify.error(t("ui.editor.spellcheck_error", "Rechtschreibpruefung fehlgeschlagen"));
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
            notify.error(t("ui.editor.spellcheck_error", "Stilpruefung fehlgeschlagen"));
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

            const res = await fetch("/api/audiobook/preview", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    text,
                    book_id: bookId || "",
                    chapter_title: chapterTitle || "",
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({detail: "Preview failed"}));
                notify.error(err.detail || t("ui.editor.preview_error", "Vorschau fehlgeschlagen"));
                setPreviewLoading(false);
                return;
            }

            // Store the blob URL so the inline player renders
            const blob = await res.blob();
            // Revoke any previous preview URL to avoid memory leaks
            if (previewAudioUrl) URL.revokeObjectURL(previewAudioUrl);
            setPreviewAudioUrl(URL.createObjectURL(blob));
        } catch {
            notify.error(t("ui.editor.preview_error", "Vorschau fehlgeschlagen"));
        }
        setPreviewLoading(false);
    };

    const handleAiSuggest = async () => {
        if (!editor) return;
        const {from, to} = editor.state.selection;
        const selectedText = from !== to ? editor.state.doc.textBetween(from, to, "\n") : "";
        if (!selectedText.trim()) {
            notify.info(t("ui.editor.ai_select_text", "Markiere zuerst einen Text fuer AI-Vorschlaege"));
            return;
        }
        setShowAiPanel(true);
        setAiLoading(true);
        setAiSuggestion("");

        // Build context-aware system prompt with book metadata
        const ctx = bookContext;
        const contextLines: string[] = [];
        if (ctx?.language) contextLines.push(`Language: ${ctx.language}`);
        if (ctx?.genre) contextLines.push(`Genre: ${ctx.genre}`);
        if (ctx?.title) contextLines.push(`Book: ${ctx.title}`);
        if (chapterTitle) contextLines.push(`Chapter: ${chapterTitle}`);
        const contextBlock = contextLines.length > 0
            ? `\n\nContext:\n${contextLines.join("\n")}\n\nMatch the tone and style appropriate for this genre and language.`
            : "";

        const basePrompts: Record<string, string> = {
            improve: `You are a professional editor. Improve the following text: fix grammar, improve clarity and flow. Return only the improved text.${contextBlock}`,
            shorten: `You are a professional editor. Make the following text more concise without losing meaning. Return only the shortened text.${contextBlock}`,
            expand: `You are a professional writer. Expand the following text with more detail and description. Return only the expanded text.${contextBlock}`,
            custom: (aiCustomPrompt || "Improve this text.") + contextBlock,
        };

        try {
            const res = await fetch("/api/ai/generate", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    prompt: selectedText,
                    system: basePrompts[aiPromptType],
                    book_id: bookId || "",
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({detail: "AI request failed"}));
                notify.error(err.detail || t("ui.editor.ai_error", "AI nicht erreichbar"));
                setAiSuggestion("");
            } else {
                const data = await res.json();
                setAiSuggestion(data.content || "");
            }
        } catch {
            notify.error(t("ui.editor.ai_error", "AI nicht erreichbar"));
        }
        setAiLoading(false);
    };

    const handleAiApply = () => {
        if (!editor || !aiSuggestion) return;
        const {from, to} = editor.state.selection;
        if (from !== to) {
            editor.chain().focus().deleteRange({from, to}).insertContentAt(from, aiSuggestion).run();
            notify.success(t("ui.editor.ai_applied", "AI-Vorschlag uebernommen"));
        }
        setShowAiPanel(false);
        setAiSuggestion("");
    };

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

        try {
            const res = await fetch("/api/ai/review", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    content: fullText,
                    chapter_title: chapterTitle || "",
                    book_title: bookContext?.title || "",
                    genre: bookContext?.genre || "",
                    language: bookContext?.language || document.documentElement.getAttribute("lang") || "de",
                    focus: ["style", "coherence", "pacing"],
                    book_id: bookId || "",
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({detail: "AI review failed"}));
                notify.error(err.detail || t("ui.editor.ai_error", "AI nicht erreichbar"));
                setAiReview("");
            } else {
                const data = await res.json();
                setAiReview(data.review || "");
            }
        } catch {
            notify.error(t("ui.editor.ai_error", "AI nicht erreichbar"));
        }
        setAiLoading(false);
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
        <div style={styles.wrapper}>
            {/* Recovery dialog */}
            {recoveryDraft && (
                <div style={styles.recoveryBanner}>
                    <div style={{flex: 1}}>
                        <strong>{t("ui.editor.recovery_title", "Ungespeicherte Aenderungen gefunden")}</strong>
                        <p style={{margin: "4px 0 0", fontSize: "0.8125rem", color: "var(--text-secondary)"}}>
                            {t("ui.editor.recovery_desc", "Aenderungen vom {timestamp} gefunden, die nicht gespeichert wurden.")
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
                onPreviewAudio={isPluginAvailable(pluginStatus, "audiobook") ? handlePreviewAudio : undefined}
                previewLoading={previewLoading}
                previewDisabledReason={!isPluginAvailable(pluginStatus, "audiobook") ? pluginDisabledMessage(pluginStatus, "audiobook") : undefined}
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
                        title={t("ui.common.close", "Schliessen")}
                        style={{padding: 4, fontSize: "1rem", lineHeight: 1}}
                    >
                        &#x2715;
                    </button>
                </div>
            )}

            {/* AI Assistant Panel */}
            {showAiPanel && !markdownMode && (
                <div style={styles.aiPanel}>
                    <div style={styles.aiHeader}>
                        <strong>{t("ui.editor.ai_assistant", "AI-Assistent")}</strong>
                        <div style={{display: "flex", gap: 4, marginLeft: "auto", flexWrap: "wrap"}}>
                            {(["improve", "shorten", "expand", "custom", "review"] as const).map((type) => (
                                <button
                                    key={type}
                                    className={`btn btn-sm ${aiPromptType === type ? "btn-primary" : "btn-ghost"}`}
                                    onClick={() => { setAiPromptType(type); setAiSuggestion(""); setAiReview(""); }}
                                    style={{padding: "2px 8px", fontSize: "0.75rem"}}
                                >
                                    {type === "improve" ? t("ui.editor.ai_improve", "Verbessern")
                                        : type === "shorten" ? t("ui.editor.ai_shorten", "Kuerzen")
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
                            <div style={{padding: "6px 16px", display: "flex", gap: 8}}>
                                <button
                                    className="btn btn-primary btn-sm"
                                    onClick={handleAiReview}
                                    disabled={aiLoading}
                                >
                                    {aiLoading ? t("ui.editor.ai_loading", "Denke nach...") : t("ui.editor.ai_review_start", "Kapitel reviewen")}
                                </button>
                            </div>
                            {aiReview && (
                                <div style={styles.aiSuggestion}>
                                    <div style={{fontSize: "0.8125rem", whiteSpace: "pre-wrap", color: "var(--text-primary)", lineHeight: 1.6}}>
                                        {aiReview}
                                    </div>
                                    <div style={{display: "flex", gap: 8, marginTop: 8}}>
                                        <button className="btn btn-ghost btn-sm" onClick={() => setAiReview("")}>
                                            {t("ui.editor.ai_review_close", "Schliessen")}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            <div style={{padding: "6px 16px", display: "flex", gap: 8}}>
                                <button
                                    className="btn btn-primary btn-sm"
                                    onClick={handleAiSuggest}
                                    disabled={aiLoading}
                                >
                                    {aiLoading ? t("ui.editor.ai_loading", "Denke nach...") : t("ui.editor.ai_suggest", "Vorschlag generieren")}
                                </button>
                            </div>
                            {aiSuggestion && (
                                <div style={styles.aiSuggestion}>
                                    <div style={{fontSize: "0.8125rem", whiteSpace: "pre-wrap", color: "var(--text-primary)"}}>
                                        {aiSuggestion}
                                    </div>
                                    <div style={{display: "flex", gap: 8, marginTop: 8}}>
                                        <button className="btn btn-primary btn-sm" onClick={handleAiApply}>
                                            {t("ui.editor.ai_apply", "Uebernehmen")}
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
                <div style={styles.searchBar}>
                    <input
                        style={styles.searchInput}
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
                        style={styles.searchInput}
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
                <div style={styles.spellcheckPanel}>
                    <div style={styles.spellcheckHeader}>
                        <strong>{t("ui.editor.spellcheck", "Rechtschreibpruefung")}</strong>
                        {spellcheckLoading && <span style={{color: "var(--text-muted)", marginLeft: 8}}>{t("ui.editor.checking", "Pruefe...")}</span>}
                        {!spellcheckLoading && <span style={{color: "var(--text-muted)", marginLeft: 8}}>{spellcheckResults.length} {t("ui.editor.issues", "Probleme")}</span>}
                        <button className="btn btn-ghost btn-sm" style={{marginLeft: "auto"}} onClick={handleToggleSpellcheck}>&times;</button>
                    </div>
                    {spellcheckResults.length > 0 && (
                        <div style={styles.spellcheckList}>
                            {spellcheckResults.map((issue, i) => (
                                <div key={i} style={styles.spellcheckItem}>
                                    <div style={{fontSize: "0.8125rem", color: "var(--text-primary)"}}>
                                        {issue.message}
                                    </div>
                                    {issue.replacements.length > 0 && (
                                        <div style={{fontSize: "0.75rem", color: "var(--accent)", marginTop: 2}}>
                                            {t("ui.editor.suggestions", "Vorschlaege")}: {issue.replacements.join(", ")}
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
            <div style={styles.statusBar}>
                <span style={styles.wordCount}>
                    {editor?.storage.characterCount?.words() ?? 0} {t("ui.editor.words", "Wörter")}
                    {" / "}
                    {editor?.storage.characterCount?.characters() ?? 0} {t("ui.editor.characters", "Zeichen")}
                    {/* Word goal */}
                    {chapterId && !editingGoal && (
                        <button
                            style={styles.goalBtn}
                            onClick={() => setEditingGoal(true)}
                            title={t("ui.editor.set_goal", "Wortziel setzen")}
                        >
                            {wordGoal ? `${t("ui.editor.goal", "Ziel")}: ${wordGoal}` : `+ ${t("ui.editor.goal", "Ziel")}`}
                        </button>
                    )}
                    {editingGoal && (
                        <input
                            style={styles.goalInput}
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
                    <div style={styles.goalProgress}>
                        <div style={{
                            ...styles.goalProgressFill,
                            width: `${Math.min(100, ((editor?.storage.characterCount?.words() ?? 0) / wordGoal) * 100)}%`,
                            background: (editor?.storage.characterCount?.words() ?? 0) >= wordGoal ? "#16a34a" : "var(--accent)",
                        }}/>
                    </div>
                )}
                {statusLabel && (
                    <span style={{
                        ...styles.saveStatus,
                        color:
                            saveStatus === "saving" ? "var(--text-muted)" :
                            saveStatus === "error" ? "var(--danger, #b91c1c)" :
                            "var(--accent)",
                    }} data-testid={`editor-save-status-${saveStatus}`}>
                        {statusLabel}
                    </span>
                )}
            </div>

            <div style={styles.editorArea}>
                <div style={styles.editorContainer} className={focusMode ? "focus-mode" : ""}>
                    {markdownMode ? (
                        <textarea
                            style={styles.markdownEditor}
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

const styles: Record<string, React.CSSProperties> = {
    wrapper: {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
    },
    recoveryBanner: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 16px",
        background: "rgba(251, 191, 36, 0.15)",
        borderBottom: "1px solid rgba(251, 191, 36, 0.3)",
        fontSize: "0.875rem",
    },
    searchBar: {
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 16px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-secondary)",
    },
    searchInput: {
        padding: "4px 8px",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        fontSize: "0.8125rem",
        background: "var(--bg-card)",
        color: "var(--text-primary)",
        outline: "none",
        width: 160,
    },
    spellcheckPanel: {
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-secondary)",
        maxHeight: 200,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column" as const,
    },
    spellcheckHeader: {
        display: "flex",
        alignItems: "center",
        padding: "6px 16px",
        fontSize: "0.8125rem",
        borderBottom: "1px solid var(--border)",
    },
    spellcheckList: {
        overflowY: "auto" as const,
        flex: 1,
    },
    spellcheckItem: {
        padding: "6px 16px",
        borderBottom: "1px solid var(--border)",
    },
    aiPanel: {
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-secondary)",
        maxHeight: 300,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column" as const,
    },
    aiHeader: {
        display: "flex",
        alignItems: "center",
        padding: "6px 16px",
        fontSize: "0.8125rem",
        borderBottom: "1px solid var(--border)",
        gap: 8,
        flexWrap: "wrap" as const,
    },
    aiSuggestion: {
        padding: "8px 16px",
        borderTop: "1px solid var(--border)",
        background: "var(--bg-card)",
        overflowY: "auto" as const,
        maxHeight: 180,
    },
    statusBar: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "4px 16px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-card)",
        fontSize: "0.75rem",
    },
    wordCount: {
        color: "var(--text-muted)",
        display: "flex",
        alignItems: "center",
        gap: 8,
    },
    goalBtn: {
        background: "none",
        border: "1px dashed var(--border)",
        borderRadius: 3,
        padding: "1px 6px",
        fontSize: "0.6875rem",
        color: "var(--text-muted)",
        cursor: "pointer",
        fontFamily: "var(--font-body)",
    },
    goalInput: {
        width: 70,
        padding: "1px 4px",
        border: "1px solid var(--accent)",
        borderRadius: 3,
        fontSize: "0.6875rem",
        background: "var(--bg-card)",
        color: "var(--text-primary)",
        outline: "none",
    },
    goalProgress: {
        width: 80,
        height: 4,
        background: "var(--bg-secondary)",
        borderRadius: 2,
        overflow: "hidden",
    },
    goalProgressFill: {
        height: "100%",
        borderRadius: 2,
        transition: "width 300ms ease",
    },
    saveStatus: {
        fontSize: "0.75rem",
        fontWeight: 500,
    },
    editorArea: {
        flex: 1,
        overflow: "auto",
        background: "var(--bg-primary)",
        display: "flex",
        justifyContent: "center",
    },
    editorContainer: {
        width: "100%",
        maxWidth: 740,
        background: "var(--bg-editor)",
        minHeight: "100%",
        borderLeft: "1px solid var(--border)",
        borderRight: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
    },
    markdownEditor: {
        width: "100%",
        height: "100%",
        minHeight: "100%",
        border: "none",
        outline: "none",
        resize: "none",
        padding: "24px 32px",
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: "0.9375rem",
        lineHeight: 1.7,
        color: "var(--text-primary)",
        background: "var(--bg-editor)",
    },
};
