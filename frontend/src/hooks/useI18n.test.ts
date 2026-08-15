import {describe, it, expect, vi, beforeEach} from "vitest";
import React from "react";
import {render, screen, act} from "@testing-library/react";

import {translate} from "./useI18n";

interface Deferred {
    promise: Promise<Record<string, unknown>>;
    resolve: (catalog: Record<string, unknown>) => void;
}

const catalogRequests: Record<string, Deferred[]> = {};

function deferredCatalog(langKey: string): Promise<Record<string, unknown>> {
    let resolveCatalog!: (catalog: Record<string, unknown>) => void;
    const promise = new Promise<Record<string, unknown>>((resolvePromise) => {
        resolveCatalog = resolvePromise;
    });
    (catalogRequests[langKey] ??= []).push({promise, resolve: resolveCatalog});
    return promise;
}

vi.mock("../storage", () => ({
    getStorage: () => ({
        settings: {
            getApp: async () => ({app: {default_language: "en"}}),
        },
        i18n: {
            get: (langKey: string) => deferredCatalog(langKey),
        },
    }),
}));

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

describe("I18nProvider catalog-load race (#713)", () => {
    beforeEach(() => {
        for (const langKey of Object.keys(catalogRequests)) {
            delete catalogRequests[langKey];
        }
        vi.resetModules();
    });

    /**
     * Regression pin for the TC-052 nightly flake: on boot the provider
     * fetches the "de" bootstrap catalog, then the saved language ("en")
     * arrives from settings and a second fetch fires. When the OLDER "de"
     * response resolves AFTER the "en" one, it must be discarded - not
     * applied last-write-wins, which left the whole UI German until the
     * next full remount.
     */
    it("ignores a stale bootstrap catalog resolving after the saved-language catalog", async () => {
        const {I18nProvider, useI18n: useI18nFresh} = await import("./useI18n");

        function Probe() {
            const {t, lang} = useI18nFresh();
            return React.createElement(
                "div",
                null,
                React.createElement("span", {"data-testid": "probe-lang"}, lang),
                React.createElement("span", {"data-testid": "probe-label"}, t("probe.label", "RAW")),
            );
        }

        render(React.createElement(I18nProvider, null, React.createElement(Probe, null)));

        // Boot: settings resolve "en" -> lang flips -> the "en" fetch fires.
        await act(async () => {});
        expect(screen.getByTestId("probe-lang").textContent).toBe("en");
        expect(catalogRequests["de"]?.length ?? 0).toBeGreaterThan(0);
        expect(catalogRequests["en"]?.length ?? 0).toBeGreaterThan(0);

        // The saved-language catalog resolves FIRST ...
        await act(async () => {
            for (const request of catalogRequests["en"]) {
                request.resolve({probe: {label: "EN"}});
            }
        });
        expect(screen.getByTestId("probe-label").textContent).toBe("EN");

        // ... and the stale "de" bootstrap response straggles in AFTER.
        await act(async () => {
            for (const request of catalogRequests["de"]) {
                request.resolve({probe: {label: "DE"}});
            }
        });

        // The straggler must be ignored: the UI stays in the saved language.
        expect(screen.getByTestId("probe-label").textContent).toBe("EN");
    });
});
