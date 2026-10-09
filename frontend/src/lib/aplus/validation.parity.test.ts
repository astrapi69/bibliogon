/**
 * #890: the port reproduces what the Python validator actually does.
 *
 * `validation.test.ts` beside this file asserts the behaviour the port's
 * author believed the original has. This one asserts the behaviour the
 * original was RECORDED producing: `validation.parity.json` is written
 * by `backend/tests/test_aplus_validator_parity.py` from the real
 * `bibliogon_aplus.validation`, over inputs chosen to reach every
 * finding code in all four languages, and the pytest beside it fails if
 * the Python side ever stops producing it.
 *
 * So the two halves cannot drift apart silently: a rule change in
 * Python fails that pytest until the fixture is regenerated, and the
 * regenerated fixture fails this test until the port follows.
 *
 * Three of the recorded cases are the ones a literal transcription gets
 * wrong, and they are worth knowing by name:
 *
 * - `astral-at-the-limit` - 300 emoji is 300 code points and 600 UTF-16
 *   units. Measured with `.length` it would be over the limit; Python
 *   says it is exactly at it, so there is no length finding.
 * - `diacritic-adjacent-to-a-soft-word` - `\b` in JavaScript is
 *   ASCII-only, so `\bstreit\b` matches inside "Straßenstreit". Python's
 *   `\b` does not, so there is no finding.
 * - `lone-surrogate` - fails to encode as UTF-8 AND is category Cs, so
 *   both the invalid-character and the hidden-character rules fire.
 */

import { describe, expect, it } from "vitest";

import type { AplusBullet, AplusModule, AplusPackage } from "../../api/platform/aplus";

import parity from "./validation.parity.json";
import { getAplusRuleset } from "./ruleset";
import { validateAplusPackage } from "./validation";

interface RecordedFinding {
    field: string;
    severity: string;
    code: string;
    params: Record<string, string>;
}

interface RecordedCase {
    name: string;
    language: string;
    genre_key: string | null;
    package: {
        short_description?: string;
        /**
         * The text as code units, for a case whose string cannot survive
         * the fixture: an unpaired surrogate has no valid UTF-8 encoding,
         * and while `\ud800` is a legal JSON escape, Vite's JSON loader
         * rejects an unpaired one and takes the whole file down with a
         * parse error. Both sides rebuild the same string from these.
         */
        short_description_code_units?: number[];
        bullets?: AplusBullet[];
        header_text?: string;
        header_alt?: string;
        three_images?: Array<{ text: string; alt_text: string }>;
    };
    findings: RecordedFinding[];
}

const RECORD = parity as unknown as {
    ruleset_version: string;
    cases: RecordedCase[];
};

const CLEAN_BULLETS: AplusBullet[] = [
    { heading: "Clear structure", body: "Chapters build on each other." },
    { heading: "Real examples", body: "Every idea comes with a concrete case." },
    { heading: "Practical takeaways", body: "Readers leave with something usable." },
];

const CLEAN_IMAGES = [
    { text: "A supporting idea from the book.", alt_text: "Icon representing concept one" },
    { text: "Another supporting idea.", alt_text: "Icon representing concept two" },
    { text: "A final supporting idea.", alt_text: "Icon representing concept three" },
];

function image() {
    return { prompt: "minimalist, flat colors", aspect_ratio: "", size: "", style_flags: [] };
}

/** The same fixture the pytest builds, from the same recorded spec. */
function buildPackage(entry: RecordedCase): AplusPackage {
    const spec = entry.package;
    const images = spec.three_images ?? CLEAN_IMAGES;
    const modules: AplusModule[] = images.map((item, index) => ({
        title: `Concept ${index + 1}`,
        text: item.text,
        image: image(),
        alt_text: item.alt_text,
    }));
    const shortDescription =
        spec.short_description_code_units !== undefined
            ? String.fromCharCode(...spec.short_description_code_units)
            : (spec.short_description ??
              "A clear, engaging description of the book's premise.");
    return {
        short_description: shortDescription,
        bullets: spec.bullets ?? CLEAN_BULLETS,
        module_header: {
            title: "Overview",
            text:
                spec.header_text ??
                "An inviting overview of what the reader will find inside.",
            image: image(),
            alt_text: spec.header_alt ?? "Illustration of the book's theme",
        },
        module_three_images: modules,
        validation: [],
        meta: {
            book_id: "b1",
            language: entry.language,
            model: "",
            ruleset_version: RECORD.ruleset_version,
            generated_at: "2026-09-15T00:00:00Z",
        },
    };
}

describe("the recorded Python findings", () => {
    it("were recorded against the ruleset this build seeds", () => {
        // A fixture recorded against an older ruleset would compare
        // against rules this build no longer has.
        expect(RECORD.ruleset_version).toBe(getAplusRuleset().version);
    });

    it("cover more than a handful of cases", () => {
        expect(RECORD.cases.length).toBeGreaterThan(20);
    });

    it.each(RECORD.cases.map((entry) => [entry.name, entry] as const))(
        "are reproduced for %s",
        (_name, entry) => {
            const findings = validateAplusPackage(buildPackage(entry), {
                language: entry.language,
                genreKey: entry.genre_key,
            });
            expect(
                findings.map((f) => ({
                    field: f.field,
                    severity: f.severity,
                    code: f.code,
                    params: f.params ?? {},
                })),
            ).toEqual(entry.findings);
        },
    );
});
