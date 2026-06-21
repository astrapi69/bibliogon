import type { Node as PmNode } from "@tiptap/pm/model";
import type { Editor as TiptapEditor } from "@tiptap/react";
import {
    FIX_ISSUE_PROMPTS,
    findEnclosingSentence,
    type FixIssueType,
} from "../../data/fix-issue-prompts";
import type { ContentKind } from "./editor-gates";

interface AiPromptContext {
    language?: string;
    genre?: string;
    title?: string;
}

/**
 * Build the AI system prompts map (improve/shorten/expand/custom/
 * fix_issue) for the editor's AI assistant.
 *
 * Pure: the prompt strings depend only on the content kind, the book/
 * chapter context, the optional active style issue, and the user's
 * custom-prompt text. Article and book-chapter contexts diverge in
 * tone; the shared context block lists language + genre/book/chapter
 * (book) or article title (article).
 */
export function buildAiPrompts(args: {
    contentKind: ContentKind;
    bookContext?: AiPromptContext;
    chapterTitle?: string;
    activeIssueType: FixIssueType | null;
    aiCustomPrompt: string;
}): Record<string, string> {
    const { contentKind, bookContext: ctx, chapterTitle, activeIssueType, aiCustomPrompt } = args;
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
    const toneHint =
        contentKind === "article"
            ? "Match an engaging, accessible online-publication tone. The output should read well as a standalone article."
            : "Match the tone and style appropriate for this genre and language.";
    const contextBlock =
        contextLines.length > 0
            ? `\n\nContext:\n${contextLines.join("\n")}\n\n${toneHint}`
            : "";

    const fixIssuePrompt = activeIssueType
        ? FIX_ISSUE_PROMPTS[activeIssueType] + contextBlock
        : "";

    return contentKind === "article"
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
}

/**
 * Parse the incoming editor content string.
 *
 * Returns a parsed TipTap doc object when the string is JSON whose
 * top-level node is a ``doc``; otherwise returns the raw string
 * (treated as HTML for backward compatibility).
 */
export function parseContent(raw: string): Record<string, unknown> | string {
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && parsed.type === "doc") {
            return parsed;
        }
    } catch {
        // Not JSON, treat as HTML for backward compatibility
    }
    return raw;
}

/**
 * Map a plain-text ``[start, end)`` offset range to ProseMirror
 * document positions in a single descendants walk.
 *
 * Mirrors StyleCheckExtension's offset->position mapping: text nodes
 * contribute their character length, block nodes contribute one
 * separator character once content has started. ``start`` maps with a
 * half-open lower bound (``>= charCount && < nodeEnd``); ``end`` maps
 * with an inclusive upper bound (``>= charCount && <= nodeEnd``) so a
 * position landing exactly on a text-node boundary is still valid.
 *
 * Returns ``null`` for ``from`` when the start offset falls outside the
 * document. ``to`` may be ``null`` when only the end offset is missing;
 * callers decide how to fall back.
 */
export function textOffsetToDocPos(
    doc: PmNode,
    start: number,
    end: number,
): { from: number | null; to: number | null } {
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
            if (to === null && end >= charCount && end <= nodeEnd) {
                to = pos + (end - charCount);
            }
            charCount = nodeEnd;
        } else if (node.isBlock && charCount > 0) {
            charCount += 1;
        }
        return undefined;
    });
    return { from, to };
}

/**
 * Expand the plain-text issue range to its enclosing sentence and return
 * ProseMirror from/to positions (#207, extracted verbatim from Editor.tsx).
 * Mirrors the walk in StyleCheckExtension.textOffsetToDocPos so the mapping
 * stays consistent. Returns null if the offsets fall outside the current
 * document (chapter drift, doc edited since the check).
 */
export const expandToSentenceRange = (
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
