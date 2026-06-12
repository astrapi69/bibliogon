import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { api } from "./client";

/**
 * Wiring pin: in backendless/Dexie mode the help + getstarted api methods
 * must resolve from the bundled seed and fire ZERO network requests. Before
 * this they hit `/api/help/*` which the offline guard rejected, leaving the
 * help page / panel / onboarding empty.
 */
describe("api.help / api.getStarted offline", () => {
    let fetchSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        localStorage.setItem("bibliogon.storage_mode", "dexie");
        fetchSpy = vi.fn(() => {
            throw new Error("network must not be hit in offline mode");
        });
        vi.stubGlobal("fetch", fetchSpy);
    });

    afterEach(() => {
        localStorage.removeItem("bibliogon.storage_mode");
        vi.unstubAllGlobals();
    });

    it("shortcuts resolve from seed without fetch", async () => {
        const shortcuts = await api.help.shortcuts("de");
        expect(shortcuts.length).toBeGreaterThan(0);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("faq resolves from seed without fetch", async () => {
        const faq = await api.help.faq("de");
        expect(faq.length).toBeGreaterThan(0);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("navigation + page resolve from seed without fetch", async () => {
        const nav = await api.help.navigation("de");
        expect(nav.length).toBeGreaterThan(0);
        const page = await api.help.page("de", "getting-started");
        expect(page.content.length).toBeGreaterThan(0);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("getStarted.guide resolves from seed without fetch", async () => {
        const guide = await api.getStarted.guide("de");
        expect(guide.length).toBeGreaterThan(0);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("getStarted.sampleBook resolves from seed without fetch", async () => {
        const book = await api.getStarted.sampleBook("de", "prose");
        expect(book.book_type).toBe("prose");
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});
