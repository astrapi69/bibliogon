/**
 * TipTap JSON ↔ plain-text / Markdown conversion utilities.
 *
 * Extracted from ``components/Editor.tsx`` in the v0.32.0 UX-Polish
 * session so the same converters can power both the editor's
 * internal WYSIWYG↔Markdown toggle and the new clipboard "Copy as
 * Markdown / Copy as plain text" toolbar action.
 *
 * Two converters are exposed:
 *
 *  - ``editorToMarkdown(editor)`` — full TipTap-doc → Markdown
 *    walk. Handles every node type the Bibliogon editor emits
 *    (doc, paragraph, heading, lists, blockquote, codeBlock,
 *    imageFigure / image, horizontalRule, text with marks). Used
 *    by the WYSIWYG↔Markdown toggle and by the Copy action's
 *    default mode.
 *
 *  - ``editorToPlainText(editor)`` — lightly-formatted plain text:
 *    headings stay as text (no leading ``#``), bold/italic markers
 *    stripped, links rendered as ``text (url)``, lists prefixed
 *    with ``- ``/``1. ``, blockquotes prefixed with ``> ``. Aimed
 *    at paste-targets that mangle Markdown (email, notes,
 *    chat). Used by the Copy action's "plain text" variant.
 *
 * Both converters accept a ``DocumentMetadata`` object that, when
 * provided, prepends a title (+ optional subtitle) to the output.
 * The convention: a user copying an article from the editor
 * expects the title to come with the body — silent body-only
 * copy was a paste-target footgun (the user said as much in the
 * F3 sub-confirmations).
 *
 * Markdown title: ``# Title\n\n*Subtitle*\n\n{body}``
 * Plain title:    ``Title\n{Subtitle}\n\n{body}``
 */

import type {Editor as TiptapEditor} from "@tiptap/react";

export interface DocumentMetadata {
    /** Prepended as a heading (Markdown ``# Title`` / plain
     *  ``Title``). Empty / undefined skips the prepend. */
    title?: string;
    /** Optional. In Markdown rendered as ``*Subtitle*``; in plain
     *  text rendered on its own line below the title. */
    subtitle?: string;
}

type TipTapNode = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

export function editorToMarkdown(
    editor: TiptapEditor | null,
    metadata?: DocumentMetadata,
): string {
    if (!editor) return "";
    const body = nodeToMarkdown(editor.getJSON() as TipTapNode);
    return prependMetadataMarkdown(body, metadata);
}

export function nodeToMarkdown(node: TipTapNode): string {
    if (!node) return "";
    const type = node.type as string;
    const content = node.content as TipTapNode[] | undefined;
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
            const inner = ((item.content as TipTapNode[]) || [])
                .map(nodeToMarkdown)
                .join("\n");
            return "- " + inner;
        }).join("\n");
    }
    if (type === "orderedList") {
        return (content || []).map((item, i) => {
            const inner = ((item.content as TipTapNode[]) || [])
                .map(nodeToMarkdown)
                .join("\n");
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
                    const href =
                        (mark.attrs as Record<string, unknown>)?.href as string ||
                        "";
                    text = `[${text}](${href})`;
                }
            }
        }
        return text;
    }
    return "";
}

export function inlineToMarkdown(nodes: TipTapNode[]): string {
    return nodes.map(nodeToMarkdown).join("");
}

function prependMetadataMarkdown(
    body: string,
    metadata?: DocumentMetadata,
): string {
    if (!metadata?.title?.trim()) return body;
    const parts: string[] = [`# ${metadata.title.trim()}`];
    if (metadata.subtitle?.trim()) {
        parts.push(`*${metadata.subtitle.trim()}*`);
    }
    parts.push(body);
    return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// Plain text
// ---------------------------------------------------------------------------

export function editorToPlainText(
    editor: TiptapEditor | null,
    metadata?: DocumentMetadata,
): string {
    if (!editor) return "";
    const body = nodeToPlainText(editor.getJSON() as TipTapNode);
    return prependMetadataPlain(body, metadata);
}

function nodeToPlainText(node: TipTapNode): string {
    if (!node) return "";
    const type = node.type as string;
    const content = node.content as TipTapNode[] | undefined;

    if (type === "doc") {
        return (content || []).map(nodeToPlainText).join("\n\n");
    }
    if (type === "paragraph" || type === "heading") {
        // Headings drop their level marker — typical paste-targets
        // can't render Markdown anyway, so the visual hierarchy is
        // already gone; keeping "# " in front is just noise.
        return inlineToPlainText(content || []);
    }
    if (type === "bulletList") {
        return (content || []).map((item) => {
            const inner = ((item.content as TipTapNode[]) || [])
                .map(nodeToPlainText)
                .join("\n");
            return "- " + inner;
        }).join("\n");
    }
    if (type === "orderedList") {
        return (content || []).map((item, i) => {
            const inner = ((item.content as TipTapNode[]) || [])
                .map(nodeToPlainText)
                .join("\n");
            return `${i + 1}. ${inner}`;
        }).join("\n");
    }
    if (type === "blockquote") {
        const inner = (content || []).map(nodeToPlainText).join("\n");
        return inner.split("\n").map((l) => "> " + l).join("\n");
    }
    if (type === "codeBlock") {
        const code = (content || []).map((n) => (n.text as string) || "").join("");
        return code;
    }
    if (type === "imageFigure" || type === "figure" || type === "image") {
        // Images can't paste into a plain-text target; render the
        // alt / caption when present so the prose still reads.
        const attrs = node.attrs as Record<string, unknown> | undefined;
        const alt = (attrs?.alt as string) || "";
        const caption = content ? inlineToPlainText(content) : "";
        if (alt && caption) return `[Image: ${alt} — ${caption}]`;
        if (alt) return `[Image: ${alt}]`;
        if (caption) return `[Image — ${caption}]`;
        return "[Image]";
    }
    if (type === "horizontalRule") {
        return "---";
    }
    if (type === "text") {
        const text = (node.text as string) || "";
        const marks = node.marks as Record<string, unknown>[] | undefined;
        // Bold / italic / strike / code marks are stripped silently —
        // the visual cue is gone but the words remain. The one
        // exception is link: surface the URL parenthetically because
        // a paste-target with no link rendering otherwise loses the
        // reference entirely.
        if (marks) {
            for (const mark of marks) {
                if (mark.type === "link") {
                    const href =
                        (mark.attrs as Record<string, unknown>)?.href as string ||
                        "";
                    if (href && href !== text) return `${text} (${href})`;
                }
            }
        }
        return text;
    }
    return "";
}

function inlineToPlainText(nodes: TipTapNode[]): string {
    return nodes.map(nodeToPlainText).join("");
}

function prependMetadataPlain(
    body: string,
    metadata?: DocumentMetadata,
): string {
    if (!metadata?.title?.trim()) return body;
    const titleLine = metadata.title.trim();
    const subtitleLine = metadata.subtitle?.trim();
    if (subtitleLine) {
        return `${titleLine}\n${subtitleLine}\n\n${body}`;
    }
    return `${titleLine}\n\n${body}`;
}
