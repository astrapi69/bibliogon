import { describe, it, expect } from "vitest";
import { pluginsForContentKind } from "./editor-gates";

describe("pluginsForContentKind", () => {
    it("hides audiobook for articles", () => {
        const gates = pluginsForContentKind("article");
        expect(gates.showAudiobook).toBe(false);
    });

    it("enables audiobook for book chapters", () => {
        const gates = pluginsForContentKind("book-chapter");
        expect(gates.showAudiobook).toBe(true);
    });

    it("enables grammar, style check, AI panel, search, focus, markdown for both kinds", () => {
        for (const kind of ["article", "book-chapter"] as const) {
            const gates = pluginsForContentKind(kind);
            expect(gates.showGrammar).toBe(true);
            expect(gates.showStyleCheck).toBe(true);
            expect(gates.showAiPanel).toBe(true);
            expect(gates.showSearch).toBe(true);
            expect(gates.showFocus).toBe(true);
            expect(gates.showMarkdownMode).toBe(true);
        }
    });
});
