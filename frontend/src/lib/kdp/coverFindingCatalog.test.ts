/**
 * #1037: every cover finding has a sentence in every language, and every
 * sentence keeps the numbers it is supposed to carry.
 *
 * The seed catalogs are what the offline PWA reads, so they are what is
 * checked here rather than the backend YAML they are generated from. A
 * code added to the validator without a translation would fall back to
 * English in all eight languages at once, and a translation that drops
 * a placeholder would read as a complete sentence while losing the
 * dimensions it is meant to report - neither shows up in a render test.
 */

import {describe, expect, it} from "vitest";

import {COVER_FINDING_CODES, type CoverFindingCode} from "./coverRequirements";
import {SEED_I18N} from "../../storage/seed";

/** The placeholders the component substitutes, per code. */
const REQUIRED_PLACEHOLDERS: Record<CoverFindingCode, readonly string[]> = {
    format_unsupported: ["format", "allowed"],
    file_size_exceeded: ["size", "max"],
    dimensions_too_small: ["width", "height", "min_width", "min_height"],
    dimensions_too_large: ["width", "height", "max_width", "max_height"],
    aspect_ratio_outside_range: ["ratio", "min", "max"],
};

const LANGUAGES = Object.keys(SEED_I18N);

function messagesFor(lang: string): Record<string, string> {
    const ui = SEED_I18N[lang].ui as Record<string, unknown>;
    const wizard = ui.kdp_publishing_wizard as Record<string, unknown>;
    return (wizard?.cover_finding ?? {}) as Record<string, string>;
}

describe("cover finding catalog", () => {
    it("covers all eight languages", () => {
        expect(LANGUAGES.sort()).toEqual(["de", "el", "en", "es", "fr", "ja", "pt", "tr"]);
    });

    it.each(LANGUAGES)("%s has a sentence for every code", (lang) => {
        const messages = messagesFor(lang);
        for (const code of COVER_FINDING_CODES) {
            expect(messages[code], `${lang} is missing ${code}`).toBeTruthy();
        }
    });

    it.each(LANGUAGES)("%s keeps every placeholder", (lang) => {
        const messages = messagesFor(lang);
        for (const code of COVER_FINDING_CODES) {
            // Checked before reading it, so a missing key reports itself
            // rather than failing the next assertion on undefined.
            const message = messages[code];
            expect(message, `${lang} is missing ${code}`).toBeTypeOf("string");
            for (const name of REQUIRED_PLACEHOLDERS[code]) {
                expect(message, `${lang} ${code} dropped {${name}}`).toContain(
                    `{${name}}`,
                );
            }
        }
    });

    it.each(LANGUAGES)("%s introduces no unknown placeholder", (lang) => {
        const messages = messagesFor(lang);
        for (const code of COVER_FINDING_CODES) {
            const message = messages[code];
            expect(message, `${lang} is missing ${code}`).toBeTypeOf("string");
            const used = [...message.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]);
            const known = new Set<string>(REQUIRED_PLACEHOLDERS[code]);
            for (const name of used) {
                expect(
                    known.has(name),
                    `${lang} ${code} uses {${name}}, which nothing substitutes`,
                ).toBe(true);
            }
        }
    });
});
