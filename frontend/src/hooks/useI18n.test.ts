import {describe, it, expect} from "vitest";

import {translate} from "./useI18n";

// Exercise the REAL resolver the provider's t() delegates to (no local
// copy that can drift). createT binds the strings tree so the existing
// cases read unchanged.
function createT(strings: Record<string, unknown>) {
    return (key: string, fallback?: string): string =>
        translate(strings, key, fallback);
}

describe("i18n t() function", () => {
    const strings = {
        ui: {
            common: {save: "Speichern", cancel: "Abbrechen"},
            editor: {saving: "Speichert...", saved: "Gespeichert"},
            chapter_types: {chapter: "Kapitel", preface: "Vorwort"},
        },
    };
    const t = createT(strings);

    it("resolves dot-notation keys", () => {
        expect(t("ui.common.save")).toBe("Speichern");
        expect(t("ui.editor.saving")).toBe("Speichert...");
    });

    it("resolves nested keys", () => {
        expect(t("ui.chapter_types.chapter")).toBe("Kapitel");
        expect(t("ui.chapter_types.preface")).toBe("Vorwort");
    });

    it("returns fallback for missing keys", () => {
        expect(t("ui.missing.key", "Fallback")).toBe("Fallback");
    });

    it("returns key as fallback when no fallback provided", () => {
        expect(t("ui.missing.key")).toBe("ui.missing.key");
    });

    it("handles partial path matches", () => {
        expect(t("ui.common", "Fallback")).toBe("Fallback");
    });

    it("handles empty strings", () => {
        expect(t("", "Fallback")).toBe("Fallback");
    });

    it("returns fallback for a non-string key instead of crashing", () => {
        // Regression pin: a registry entry whose label_key is undefined
        // (or any dynamic key that resolved to null) used to crash the
        // whole subtree on key.split(). It must degrade to the fallback.
        // Pre-fix this threw "Cannot read properties of undefined
        // (reading 'split')"; the article-list ErrorBoundary surfaced it
        // on the offline build.
        expect(
            translate(strings, undefined as unknown as string, "Fallback"),
        ).toBe("Fallback");
        expect(translate(strings, null as unknown as string)).toBe("");
    });
});
