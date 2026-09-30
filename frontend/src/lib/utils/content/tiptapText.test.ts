import { describe, expect, it } from "vitest";

import { flattenTipTapText } from "./tiptapText";

const doc = (...content: unknown[]) => ({ type: "doc", content });
const para = (...content: unknown[]) => ({ type: "paragraph", content });
const text = (value: string, marked = false) =>
    marked ? { type: "text", marks: [{ type: "bold" }], text: value } : { type: "text", text: value };

describe("flattenTipTapText", () => {
    // TipTap keeps the whitespace INSIDE the text node: "sehr wichtig"
    // with a bold "wichtig" is ["sehr ", "wichtig"]. Joining inline
    // siblings with a space would double it.
    it("does not invent a space between marked runs", () => {
        expect(flattenTipTapText(doc(para(text("sehr "), text("wichtig", true))))).toBe(
            "sehr wichtig",
        );
    });

    it("keeps genuinely adjacent runs adjacent", () => {
        expect(flattenTipTapText(doc(para(text("Hallo"), text("Welt", true))))).toBe("HalloWelt");
    });

    it("preserves a leading space carried by a trailing run", () => {
        expect(flattenTipTapText(doc(para(text("a "), text("b", true), text(" c"))))).toBe("a b c");
    });

    it("joins block nodes with a newline", () => {
        expect(flattenTipTapText(doc(para(text("Eins")), para(text("Zwei"))))).toBe("Eins\nZwei");
    });

    it("treats every heading level as a block", () => {
        const node = doc({ type: "heading", attrs: { level: 3 }, content: [text("Titel")] }, para(text("Text")));
        expect(flattenTipTapText(node)).toBe("Titel\nText");
    });

    // A hardBreak is an inline node with neither text nor content, so
    // both previous join characters lost it: "" glued the lines together
    // and " " turned a line break into a space.
    it("renders a hard break as a newline", () => {
        expect(flattenTipTapText(doc(para(text("Zeile1"), { type: "hardBreak" }, text("Zeile2"))))).toBe(
            "Zeile1\nZeile2",
        );
    });

    it("renders consecutive hard breaks as separate newlines", () => {
        expect(
            flattenTipTapText(
                doc(para(text("vor"), { type: "hardBreak" }, { type: "hardBreak" }, text("nach"))),
            ),
        ).toBe("vor\n\nnach");
    });

    it("returns an empty string for a non-node", () => {
        expect(flattenTipTapText(null)).toBe("");
        expect(flattenTipTapText("nope")).toBe("");
        expect(flattenTipTapText({})).toBe("");
    });

    it("walks nested structures", () => {
        const node = doc({
            type: "bulletList",
            content: [
                { type: "listItem", content: [para(text("Eins"))] },
                { type: "listItem", content: [para(text("Zwei"))] },
            ],
        });
        expect(flattenTipTapText(node)).toBe("Eins\nZwei");
    });
});
