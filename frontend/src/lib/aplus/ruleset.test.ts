/**
 * #890: the seeded ruleset behaves like the Python loader it mirrors.
 *
 * The three resolver functions here are ports of `Ruleset.for_language`,
 * `LanguageRules.escalated_words` and `ImageStyleRules.style_for`. Each
 * case names the Python behaviour it pins, because the validator port
 * that follows is only correct if these fall back the same way.
 */

import { describe, expect, it } from "vitest";

import {
    escalatedWords,
    getAplusRuleset,
    imageStyleFor,
    languageRules,
} from "./ruleset";
import { APLUS_LANGUAGES } from "../../api/platform/aplus";

describe("getAplusRuleset", () => {
    it("carries a version, which a cached package stamps", () => {
        expect(getAplusRuleset().version).toMatch(/^\d+$/);
    });

    it("carries the Amazon field caps the validator measures against", () => {
        // From the A+ Content API model (aplusContent_2020-11-01.json);
        // alt_text is ImageComponent.altText's maxLength (#896).
        expect(getAplusRuleset().schema_limits).toEqual({
            short_description: 300,
            bullet_heading: 160,
            bullet_body: 1000,
            alt_text: 100,
        });
    });

    it("agrees with the API client's language literal", () => {
        // APLUS_LANGUAGES is an `as const` tuple so its members stay
        // literal types; it cannot be derived from JSON without losing
        // that. This is the drift pin instead.
        expect(getAplusRuleset().supported_languages).toEqual([
            ...APLUS_LANGUAGES,
        ]);
    });

    it("seeds a rule set for every supported language", () => {
        const ruleset = getAplusRuleset();
        for (const language of ruleset.supported_languages) {
            expect(Object.keys(ruleset.languages)).toContain(language);
        }
    });
});

describe("languageRules", () => {
    it("returns the asked-for language", () => {
        const rules = languageRules(getAplusRuleset(), "de");
        expect(rules.marketing_imperatives).toContain("Lernen Sie");
    });

    it("falls back to the default language rather than throwing", () => {
        // Mirrors Ruleset.for_language: a typo in a book's language
        // should still get a sensible check.
        const ruleset = getAplusRuleset();
        expect(languageRules(ruleset, "xx")).toBe(
            ruleset.languages[ruleset.default_language],
        );
    });

    it("gives English the leading-only list that other languages lack", () => {
        // #828: English has no imperative inflection, so "build" / "get"
        // are only blocked as the first word of a field.
        const english = languageRules(getAplusRuleset(), "en");
        expect(english.leading_only_imperatives.length).toBeGreaterThan(0);
    });
});

describe("escalatedWords", () => {
    it("is empty without a genre", () => {
        const rules = languageRules(getAplusRuleset(), "de");
        expect(escalatedWords(rules, null)).toEqual([]);
        expect(escalatedWords(rules, undefined)).toEqual([]);
        expect(escalatedWords(rules, "")).toEqual([]);
    });

    it("is empty for a genre with no escalation", () => {
        const rules = languageRules(getAplusRuleset(), "de");
        expect(escalatedWords(rules, "not-a-genre")).toEqual([]);
    });

    it("returns the hard-error words for a genre that has them", () => {
        const rules = languageRules(getAplusRuleset(), "de");
        const genre = Object.keys(rules.genre_escalations)[0];
        expect(genre).toBeTruthy();
        expect(escalatedWords(rules, genre).length).toBeGreaterThan(0);
    });
});

describe("imageStyleFor", () => {
    it("falls back to the default style for no genre", () => {
        const style = getAplusRuleset().image_style;
        expect(imageStyleFor(style, null)).toEqual({
            modelHint: style.default_model_hint,
            styleFlags: style.default_style_flags,
        });
    });

    it("falls back to the default style for an unknown genre", () => {
        const style = getAplusRuleset().image_style;
        expect(imageStyleFor(style, "not-a-genre").modelHint).toBe(
            style.default_model_hint,
        );
    });

    it("returns the override for a genre that has one", () => {
        const style = getAplusRuleset().image_style;
        const genre = Object.keys(style.genre_model_hints)[0];
        expect(genre).toBeTruthy();
        const resolved = imageStyleFor(style, genre);
        expect(resolved.modelHint).toBe(style.genre_model_hints[genre]);
        expect(resolved.styleFlags).toEqual(style.genre_style_flags[genre]);
    });
});
