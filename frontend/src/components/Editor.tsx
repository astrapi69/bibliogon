import {useEffect, useRef, useCallback, useState} from "react";
import {useEditor, EditorContent, type Editor as TiptapEditor} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import {Figcaption} from "../extensions/figcaption";
import Toolbar from "./Toolbar";

type SaveStatus = "idle" | "saving" | "saved";

interface Props {
    content: string;
    onSave: (json: string) => void;
    placeholder?: string;
}

export default function Editor({content, onSave, placeholder}: Props) {
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSaved = useRef(content);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
    const [wordCount, setWordCount] = useState(0);
    const [markdownMode, setMarkdownMode] = useState(false);
    const [markdownText, setMarkdownText] = useState("");

    const updateWordCount = useCallback((text: string) => {
        const words = text.trim().split(/\s+/).filter((w) => w.length > 0);
        setWordCount(words.length);
    }, []);

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

    const editor = useEditor({
        extensions: [
            StarterKit,
            Image.configure({
                inline: false,
                allowBase64: true,
            }),
            Link.configure({
                openOnClick: false,
                HTMLAttributes: {
                    class: "tiptap-link",
                },
            }),
            Figcaption,
            Placeholder.configure({
                placeholder: placeholder || "Beginne zu schreiben...",
            }),
        ],
        content: parseContent(content),
        onUpdate: ({editor}) => {
            const json = JSON.stringify(editor.getJSON());
            debouncedSave(json);
            updateWordCount(editor.getText());
        },
        editorProps: {
            attributes: {
                class: "tiptap-editor",
            },
        },
    });

    // Update content when switching chapters
    useEffect(() => {
        if (editor) {
            const currentJson = JSON.stringify(editor.getJSON());
            if (content !== currentJson) {
                editor.commands.setContent(parseContent(content));
                lastSaved.current = content;
                updateWordCount(editor.getText());
                setMarkdownMode(false);
            }
        }
    }, [content, editor, updateWordCount]);

    // Initial word count
    useEffect(() => {
        if (editor) {
            updateWordCount(editor.getText());
        }
    }, [editor, updateWordCount]);

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
            updateWordCount(editor.getText());
            setMarkdownMode(false);
        }
    };

    const handleMarkdownChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const text = e.target.value;
        setMarkdownText(text);
        updateWordCount(text);

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

    const statusLabel = saveStatus === "saving" ? "Speichert..." : saveStatus === "saved" ? "Gespeichert" : "";

    return (
        <div style={styles.wrapper}>
            <Toolbar
                editor={editor}
                markdownMode={markdownMode}
                onToggleMarkdown={handleToggleMarkdown}
            />

            {/* Status bar */}
            <div style={styles.statusBar}>
                <span style={styles.wordCount}>
                    {wordCount} {wordCount === 1 ? "Wort" : "Wörter"}
                </span>
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
                <div style={styles.editorContainer}>
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
    if (type === "image") {
        const src = (attrs?.src as string) || "";
        const alt = (attrs?.alt as string) || "";
        return `![${alt}](${src})`;
    }
    if (type === "figcaption") {
        const text = inlineToMarkdown(content || []);
        return `*${text}*`;
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

        // Image: ![alt](src)
        const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
        if (imgMatch) {
            htmlLines.push(`<img src="${imgMatch[2]}" alt="${imgMatch[1]}" />`);
            continue;
        }

        // Paragraph
        htmlLines.push(`<p>${inlineMarkdown(line)}</p>`);
    }

    if (inList) htmlLines.push(inList === "ul" ? "</ul>" : "</ol>");
    if (inCodeBlock) htmlLines.push(`<pre><code>${codeBlockContent.join("\n")}</code></pre>`);

    return htmlLines.join("\n");
}

function inlineMarkdown(text: string): string {
    return text
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
