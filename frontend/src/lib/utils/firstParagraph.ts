/** Derive a chapter synopsis from its content (CHAPTER-SYNOPSIS-NOTES-01).
 *
 * Pure, dependency-free, app-agnostic: parses the TipTap JSON storage
 * shape (or a plain string) and returns the first paragraph's plain text,
 * for the Outliner's "auto-generate synopsis" action. */

interface TipTapNode {
    type?: string
    text?: string
    content?: TipTapNode[]
}

function nodeText(node: TipTapNode): string {
    if (typeof node.text === "string") return node.text
    if (Array.isArray(node.content)) return node.content.map(nodeText).join("")
    return ""
}

function firstBlockText(doc: TipTapNode): string {
    const blocks = Array.isArray(doc.content) ? doc.content : []
    for (const block of blocks) {
        if (block.type === "paragraph" || block.type === "heading") {
            const text = nodeText(block).trim()
            if (text) return text
        }
    }
    return nodeText(doc)
}

function collapse(value: string): string {
    return value.replace(/\s+/g, " ").trim()
}

function truncate(value: string, maxLen: number): string {
    if (value.length <= maxLen) return value
    return value.slice(0, maxLen - 1).trimEnd() + "…"
}

/**
 * Return the first paragraph's plain text from a chapter's `content`,
 * trimmed, whitespace-collapsed and capped at `maxLen` characters (an
 * ellipsis is appended when truncated). Accepts TipTap JSON or a plain
 * string; returns `""` for empty/whitespace input.
 *
 * @example
 * firstParagraphText(
 *   '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Once upon a time."}]}]}',
 * )
 * // -> "Once upon a time."
 */
export function firstParagraphText(content: string | null | undefined, maxLen = 280): string {
    const raw = (content ?? "").trim()
    if (!raw) return ""
    let text = raw
    if (raw.startsWith("{")) {
        try {
            text = firstBlockText(JSON.parse(raw) as TipTapNode)
        } catch {
            text = raw
        }
    }
    return truncate(collapse(text), maxLen)
}
