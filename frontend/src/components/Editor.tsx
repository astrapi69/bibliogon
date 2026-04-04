import {useEffect, useRef, useCallback, useState} from "react";
import {useEditor, EditorContent, type Editor as TiptapEditor} from "@tiptap/react";
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
import Toolbar from "./Toolbar";
import {useI18n} from "../hooks/useI18n";
import {api} from "../api/client";
import {notify} from "../utils/notify";

type SaveStatus = "idle" | "saving" | "saved";

interface Props {
    content: string;
    onSave: (json: string) => void;
    placeholder?: string;
    bookId?: string;
    chapterId?: string;
}

export default function Editor({content, onSave, placeholder, bookId, chapterId}: Props) {
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
    const [previewLoading, setPreviewLoading] = useState(false);
    const [wordGoal, setWordGoal] = useState<number | null>(() => {
        if (!chapterId) return null;
        const stored = localStorage.getItem(`bibliogon-word-goal-${chapterId}`);
        return stored ? parseInt(stored, 10) : null;
    });
    const [editingGoal, setEditingGoal] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [replaceTerm, setReplaceTerm] = useState("");
    const [markdownText, setMarkdownText] = useState("");

    const debouncedSave = useCallback(
        (json: string) => {
            if (saveTimer.current) clearTimeout(saveTimer.current);
            setSaveStatus("saving");
            saveTimer.current = setTimeout(() => {
                if (json !== lastSaved.current) {
                    lastSaved.current = json;
                    onSave(json);
                    setSaveStatus("saved");
                    setTimeout(() => setSaveStatus("idle"), 2000);
                } else {
                    setSaveStatus("idle");
                }
            }, 800);
        },
        [onSave]
    );

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
            notify.error(`Upload failed: ${err}`);
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

        // Debounced save in markdown mode
        if (saveTimer.current) clearTimeout(saveTimer.current);
        setSaveStatus("saving");
        saveTimer.current = setTimeout(() => {
            if (editor) {
                const html = markdownToHtml(text);
                editor.commands.setContent(html);
                const json = JSON.stringify(editor.getJSON());
                if (json !== lastSaved.current) {
                    lastSaved.current = json;
                    onSave(json);
                }
            }
            setSaveStatus("saved");
            setTimeout(() => setSaveStatus("idle"), 2000);
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

    const handlePreviewAudio = async () => {
        if (!editor) return;
        setPreviewLoading(true);
        try {
            // Use selected text or first 2000 chars of chapter
            const {from, to} = editor.state.selection;
            let text = from !== to ? editor.state.doc.textBetween(from, to, "\n") : editor.getText();
            if (text.length > 2000) text = text.slice(0, 2000);
            if (!text.trim()) {
                notify.info(t("ui.editor.preview_no_text", "Kein Text zum Vorlesen"));
                setPreviewLoading(false);
                return;
            }

            const res = await fetch("/api/audiobook/preview", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({text}),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({detail: "Preview failed"}));
                notify.error(err.detail || t("ui.editor.preview_error", "Vorschau fehlgeschlagen"));
                setPreviewLoading(false);
                return;
            }

            // Play the returned MP3
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audio.onended = () => URL.revokeObjectURL(url);
            audio.play();
        } catch {
            notify.error(t("ui.editor.preview_error", "Vorschau fehlgeschlagen"));
        }
        setPreviewLoading(false);
    };

    const statusLabel = saveStatus === "saving" ? t("ui.editor.saving", "Speichert...") : saveStatus === "saved" ? t("ui.editor.saved", "Gespeichert") : "";

    return (
        <div style={styles.wrapper}>
            <Toolbar
                editor={editor}
                markdownMode={markdownMode}
                onToggleMarkdown={handleToggleMarkdown}
                onToggleSearch={() => setShowSearch(!showSearch)}
                focusMode={focusMode}
                onToggleFocus={() => setFocusMode(!focusMode)}
                spellcheckActive={showSpellcheck}
                onToggleSpellcheck={handleToggleSpellcheck}
                onPreviewAudio={handlePreviewAudio}
                previewLoading={previewLoading}
            />

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
                        color: saveStatus === "saving" ? "var(--text-muted)" : "var(--accent)",
                    }}>
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
