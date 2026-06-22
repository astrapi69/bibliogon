import {describe, it, expect} from "vitest"

import {firstParagraphText} from "./firstParagraph"

const doc = (...paras: string[]) =>
    JSON.stringify({
        type: "doc",
        content: paras.map((p) => ({
            type: "paragraph",
            content: p ? [{type: "text", text: p}] : [],
        })),
    })

describe("firstParagraphText", () => {
    it("returns the first paragraph's text from a TipTap doc", () => {
        expect(firstParagraphText(doc("The hero leaves home.", "Then more."))).toBe(
            "The hero leaves home.",
        )
    })

    it("skips leading empty paragraphs", () => {
        expect(firstParagraphText(doc("", "  ", "Real first line."))).toBe("Real first line.")
    })

    it("collapses whitespace across nested text nodes", () => {
        const nested = JSON.stringify({
            type: "doc",
            content: [
                {
                    type: "paragraph",
                    content: [
                        {type: "text", text: "Bold "},
                        {type: "text", text: "and   plain"},
                    ],
                },
            ],
        })
        expect(firstParagraphText(nested)).toBe("Bold and plain")
    })

    it("truncates with an ellipsis past maxLen", () => {
        const long = "word ".repeat(100).trim()
        const out = firstParagraphText(doc(long), 20)
        expect(out.length).toBe(20)
        expect(out.endsWith("…")).toBe(true)
    })

    it("returns empty string for empty / whitespace / null", () => {
        expect(firstParagraphText("")).toBe("")
        expect(firstParagraphText("   ")).toBe("")
        expect(firstParagraphText(null)).toBe("")
        expect(firstParagraphText(undefined)).toBe("")
    })

    it("falls back to a plain (non-JSON) string", () => {
        expect(firstParagraphText("just plain text")).toBe("just plain text")
    })

    it("handles a heading as the first block", () => {
        const headingDoc = JSON.stringify({
            type: "doc",
            content: [{type: "heading", content: [{type: "text", text: "Chapter One"}]}],
        })
        expect(firstParagraphText(headingDoc)).toBe("Chapter One")
    })
})
