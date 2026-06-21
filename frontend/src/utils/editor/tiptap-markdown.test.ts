/**
 * Tests for the TipTap → Markdown / plain-text converters shipped
 * in v0.32.0 F3.
 *
 * Two surfaces under test:
 *  - ``editorToMarkdown`` (extracted from Editor.tsx; behavior must
 *    match the WYSIWYG↔Markdown toggle's prior output)
 *  - ``editorToPlainText`` (new; lightly-formatted plain text)
 *
 * The full Editor is heavy; tests use a stub that implements just
 * ``getJSON()`` so the converters can be exercised in isolation.
 */

import { describe, it, expect } from "vitest";
import type { Editor as TiptapEditor } from "@tiptap/react";

import { editorToMarkdown, editorToPlainText, nodeToMarkdown } from "./tiptap-markdown";

function stubEditor(doc: object): TiptapEditor {
    // Only ``getJSON`` is consumed by the converters; cast through
    // unknown to satisfy the full TiptapEditor type without
    // implementing the surface we don't touch.
    return { getJSON: () => doc } as unknown as TiptapEditor;
}

function paragraph(...texts: string[]): object {
    return {
        type: "paragraph",
        content: texts.map((text) => ({ type: "text", text })),
    };
}

function doc(...nodes: object[]): object {
    return { type: "doc", content: nodes };
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

describe("editorToMarkdown", () => {
    it("returns empty string for a null editor", () => {
        expect(editorToMarkdown(null)).toBe("");
    });

    it("renders paragraphs separated by blank lines", () => {
        const md = editorToMarkdown(
            stubEditor(doc(paragraph("First."), paragraph("Second."))),
        );
        expect(md).toBe("First.\n\nSecond.");
    });

    it("renders headings with the right level of #", () => {
        const md = editorToMarkdown(
            stubEditor(
                doc({
                    type: "heading",
                    attrs: { level: 2 },
                    content: [{ type: "text", text: "Section" }],
                }),
            ),
        );
        expect(md).toBe("## Section");
    });

    it("renders bold + italic + code + link inline marks", () => {
        const md = nodeToMarkdown({
            type: "paragraph",
            content: [
                { type: "text", text: "plain " },
                { type: "text", text: "bold", marks: [{ type: "bold" }] },
                { type: "text", text: " " },
                {
                    type: "text",
                    text: "italic",
                    marks: [{ type: "italic" }],
                },
                { type: "text", text: " " },
                { type: "text", text: "code", marks: [{ type: "code" }] },
                { type: "text", text: " " },
                {
                    type: "text",
                    text: "site",
                    marks: [
                        { type: "link", attrs: { href: "https://example.com" } },
                    ],
                },
            ],
        });
        expect(md).toBe(
            "plain **bold** *italic* `code` [site](https://example.com)",
        );
    });

    it("renders bullet lists with - prefixes", () => {
        const md = editorToMarkdown(
            stubEditor(
                doc({
                    type: "bulletList",
                    content: [
                        {
                            type: "listItem",
                            content: [paragraph("One")],
                        },
                        {
                            type: "listItem",
                            content: [paragraph("Two")],
                        },
                    ],
                }),
            ),
        );
        expect(md).toBe("- One\n- Two");
    });

    it("renders ordered lists with numeric prefixes", () => {
        const md = editorToMarkdown(
            stubEditor(
                doc({
                    type: "orderedList",
                    content: [
                        { type: "listItem", content: [paragraph("First")] },
                        { type: "listItem", content: [paragraph("Second")] },
                    ],
                }),
            ),
        );
        expect(md).toBe("1. First\n2. Second");
    });

    it("renders blockquotes with > prefix on every line", () => {
        const md = nodeToMarkdown({
            type: "blockquote",
            content: [paragraph("Line one"), paragraph("Line two")],
        });
        // Inner paragraphs join with \n (not \n\n) inside the
        // blockquote, then every resulting line gets the "> " prefix.
        expect(md).toBe("> Line one\n> Line two");
    });

    it("renders code blocks with the language fence", () => {
        const md = nodeToMarkdown({
            type: "codeBlock",
            attrs: { language: "python" },
            content: [{ type: "text", text: "print('hi')" }],
        });
        expect(md).toBe("```python\nprint('hi')\n```");
    });

    it("renders imageFigure with caption as italic line", () => {
        const md = nodeToMarkdown({
            type: "imageFigure",
            attrs: { src: "moon.jpg", alt: "Moon" },
            content: [{ type: "text", text: "Full moon" }],
        });
        expect(md).toBe("![Moon](moon.jpg)\n*Full moon*");
    });

    it("renders horizontal rule as ---", () => {
        const md = nodeToMarkdown({ type: "horizontalRule" });
        expect(md).toBe("---");
    });

    it("prepends documentTitle as a single-# heading", () => {
        const md = editorToMarkdown(
            stubEditor(doc(paragraph("Body."))),
            { title: "Reply on longevity" },
        );
        expect(md).toBe("# Reply on longevity\n\nBody.");
    });

    it("prepends documentTitle + documentSubtitle when both are set", () => {
        const md = editorToMarkdown(
            stubEditor(doc(paragraph("Body."))),
            { title: "Reply on longevity", subtitle: "A class struggle reframing" },
        );
        expect(md).toBe(
            "# Reply on longevity\n\n*A class struggle reframing*\n\nBody.",
        );
    });

    it("trims and ignores an all-whitespace title without crashing", () => {
        const md = editorToMarkdown(
            stubEditor(doc(paragraph("Body."))),
            { title: "   " },
        );
        expect(md).toBe("Body.");
    });

    it("ignores subtitle when title is missing", () => {
        const md = editorToMarkdown(
            stubEditor(doc(paragraph("Body."))),
            { subtitle: "Floating subtitle" },
        );
        expect(md).toBe("Body.");
    });
});

// ---------------------------------------------------------------------------
// Plain text
// ---------------------------------------------------------------------------

describe("editorToPlainText", () => {
    it("returns empty string for a null editor", () => {
        expect(editorToPlainText(null)).toBe("");
    });

    it("renders paragraphs as plain text with blank-line separators", () => {
        const text = editorToPlainText(
            stubEditor(doc(paragraph("First."), paragraph("Second."))),
        );
        expect(text).toBe("First.\n\nSecond.");
    });

    it("renders headings as plain text without leading #", () => {
        const text = editorToPlainText(
            stubEditor(
                doc(
                    {
                        type: "heading",
                        attrs: { level: 2 },
                        content: [{ type: "text", text: "Section" }],
                    },
                    paragraph("Body."),
                ),
            ),
        );
        expect(text).toBe("Section\n\nBody.");
    });

    it("strips bold / italic / code marks silently", () => {
        const text = editorToPlainText(
            stubEditor(
                doc({
                    type: "paragraph",
                    content: [
                        { type: "text", text: "plain " },
                        { type: "text", text: "bold", marks: [{ type: "bold" }] },
                        { type: "text", text: " " },
                        {
                            type: "text",
                            text: "italic",
                            marks: [{ type: "italic" }],
                        },
                        { type: "text", text: " " },
                        { type: "text", text: "code", marks: [{ type: "code" }] },
                    ],
                }),
            ),
        );
        expect(text).toBe("plain bold italic code");
    });

    it("renders links as 'text (url)' so paste-targets keep the reference", () => {
        const text = editorToPlainText(
            stubEditor(
                doc({
                    type: "paragraph",
                    content: [
                        { type: "text", text: "See " },
                        {
                            type: "text",
                            text: "the site",
                            marks: [
                                {
                                    type: "link",
                                    attrs: { href: "https://example.com" },
                                },
                            ],
                        },
                        { type: "text", text: " for more." },
                    ],
                }),
            ),
        );
        expect(text).toBe("See the site (https://example.com) for more.");
    });

    it("links whose text already matches the href are NOT duplicated", () => {
        // Common Medium case: bare URL → linkified, text === href.
        const text = editorToPlainText(
            stubEditor(
                doc({
                    type: "paragraph",
                    content: [
                        {
                            type: "text",
                            text: "https://example.com",
                            marks: [
                                {
                                    type: "link",
                                    attrs: { href: "https://example.com" },
                                },
                            ],
                        },
                    ],
                }),
            ),
        );
        expect(text).toBe("https://example.com");
    });

    it("renders bullet lists with - prefixes", () => {
        const text = editorToPlainText(
            stubEditor(
                doc({
                    type: "bulletList",
                    content: [
                        { type: "listItem", content: [paragraph("One")] },
                        { type: "listItem", content: [paragraph("Two")] },
                    ],
                }),
            ),
        );
        expect(text).toBe("- One\n- Two");
    });

    it("renders ordered lists with numeric prefixes", () => {
        const text = editorToPlainText(
            stubEditor(
                doc({
                    type: "orderedList",
                    content: [
                        { type: "listItem", content: [paragraph("Alpha")] },
                        { type: "listItem", content: [paragraph("Beta")] },
                    ],
                }),
            ),
        );
        expect(text).toBe("1. Alpha\n2. Beta");
    });

    it("renders blockquotes with > prefixes", () => {
        const text = editorToPlainText(
            stubEditor(
                doc({
                    type: "blockquote",
                    content: [paragraph("Quote line.")],
                }),
            ),
        );
        expect(text).toBe("> Quote line.");
    });

    it("renders code blocks as plain text (no fence)", () => {
        const text = editorToPlainText(
            stubEditor(
                doc({
                    type: "codeBlock",
                    attrs: { language: "python" },
                    content: [{ type: "text", text: "print('hi')" }],
                }),
            ),
        );
        expect(text).toBe("print('hi')");
    });

    it("renders imageFigure as [Image: alt — caption]", () => {
        const text = editorToPlainText(
            stubEditor(
                doc({
                    type: "imageFigure",
                    attrs: { src: "moon.jpg", alt: "Moon" },
                    content: [{ type: "text", text: "Full moon" }],
                }),
            ),
        );
        expect(text).toBe("[Image: Moon — Full moon]");
    });

    it("prepends documentTitle on its own line", () => {
        const text = editorToPlainText(
            stubEditor(doc(paragraph("Body."))),
            { title: "Article title" },
        );
        expect(text).toBe("Article title\n\nBody.");
    });

    it("prepends documentTitle + documentSubtitle when both are set", () => {
        const text = editorToPlainText(
            stubEditor(doc(paragraph("Body."))),
            { title: "Article title", subtitle: "Subtitle" },
        );
        expect(text).toBe("Article title\nSubtitle\n\nBody.");
    });
});
