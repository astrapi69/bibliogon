import { describe, it, expect } from "vitest";

import {
    DEFAULT_BOOK_LANGUAGES,
    DEFAULT_BOOK_LANGUAGE_VALUES,
    buildBookLanguageOptions,
    isDefaultBookLanguage,
} from "./bookLanguages";

describe("buildBookLanguageOptions", () => {
    it("returns the 8 defaults when there are no custom languages", () => {
        const options = buildBookLanguageOptions([]);
        expect(options).toHaveLength(DEFAULT_BOOK_LANGUAGES.length);
        expect(options.map((o) => o.value)).toEqual(
            DEFAULT_BOOK_LANGUAGE_VALUES,
        );
    });

    it("appends custom languages after the defaults", () => {
        const options = buildBookLanguageOptions(["Latin", "Sindarin"]);
        const values = options.map((o) => o.value);
        expect(values.slice(0, DEFAULT_BOOK_LANGUAGES.length)).toEqual(
            DEFAULT_BOOK_LANGUAGE_VALUES,
        );
        expect(values.slice(-2)).toEqual(["Latin", "Sindarin"]);
    });

    it("uses the custom string as both value and label", () => {
        const options = buildBookLanguageOptions(["Latin"]);
        const latin = options.find((o) => o.value === "Latin");
        expect(latin).toEqual({ value: "Latin", label: "Latin" });
    });

    it("dedupes custom entries against defaults (case-insensitive)", () => {
        const options = buildBookLanguageOptions(["EN", "de"]);
        expect(options).toHaveLength(DEFAULT_BOOK_LANGUAGES.length);
    });

    it("dedupes custom entries against each other (case-insensitive)", () => {
        const options = buildBookLanguageOptions(["Latin", "latin", "LATIN"]);
        const latinCount = options.filter(
            (o) => o.value.toLowerCase() === "latin",
        ).length;
        expect(latinCount).toBe(1);
    });

    it("ignores empty / whitespace-only custom entries", () => {
        const options = buildBookLanguageOptions(["", "   "]);
        expect(options).toHaveLength(DEFAULT_BOOK_LANGUAGES.length);
    });
});

describe("isDefaultBookLanguage", () => {
    it("is true for the fixed defaults", () => {
        expect(isDefaultBookLanguage("de")).toBe(true);
        expect(isDefaultBookLanguage("EN")).toBe(true);
    });

    it("is false for custom values", () => {
        expect(isDefaultBookLanguage("Latin")).toBe(false);
        expect(isDefaultBookLanguage("")).toBe(false);
    });
});
