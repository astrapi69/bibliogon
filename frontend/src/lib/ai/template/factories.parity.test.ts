/**
 * #745 stage 2: the factories and the apply rules, against the endpoints.
 *
 * `backend/tests/test_ai_template_parity.py` records, per case, the
 * SOURCE row as the API returns it alongside the template the endpoint
 * built from it, and - for the apply half - a filled file, the record it
 * was POSTed onto, and the report that came back. So each half is
 * checked against what the server actually does rather than against a
 * reading of the router:
 *
 * - the field specs, character for character, because in the
 *   external-roundtrip workflow that text is the whole instruction;
 * - the factories, by building a template from the recorded source and
 *   comparing it to the recorded template;
 * - the apply rules, by running the recorded filled file onto the
 *   recorded row and comparing the report AND the resulting values.
 */

import { describe, it, expect } from "vitest";

import { applyTemplate, type ChapterRef } from "./apply";
import {
    buildArticleTemplateFromRecord,
    buildBookTemplateFromRecord,
    buildEmptyTemplate,
    type ArticleTemplateSource,
    type BookTemplateSource,
} from "./factories";
import { ARTICLE_FIELD_SPECS, BOOK_FIELD_SPECS } from "./fieldSpecs";
import { FIELD_ORDER, type TemplateKind } from "./models";
import record from "./aiTemplate.parity.json";
import { parseTemplate } from "./yaml";

interface ExportCase {
    key: string;
    kind: TemplateKind;
    yaml: string;
    source: Record<string, unknown>;
    chapter_contents?: (string | null)[];
}

interface ApplyCase {
    key: string;
    kind: TemplateKind;
    force: boolean;
    before: Record<string, unknown>;
    chapters: ChapterRef[];
    filled_yaml: string;
    response: {
        updated_fields: string[];
        skipped_fields: string[];
        skip_reasons: Record<string, string>;
        dropped_chapter_summaries?: unknown[];
    };
    after: Record<string, unknown>;
}

const CASES = record.cases as unknown as ExportCase[];
const APPLY_CASES = record.apply_cases as unknown as ApplyCase[];

/** The recorded template, parsed. */
function recordedTemplate(testCase: ExportCase): Record<string, unknown> {
    return parseTemplate(testCase.yaml) as unknown as Record<string, unknown>;
}

describe("the field specs are the backend's text", () => {
    it.each(["book", "article"] as const)("%s", (kind) => {
        const specs = kind === "book" ? BOOK_FIELD_SPECS : ARTICLE_FIELD_SPECS;
        const recorded = recordedTemplate(CASES.find((c) => c.kind === kind)!);
        for (const name of FIELD_ORDER[kind]) {
            const field = recorded[name] as Record<string, unknown>;
            // Character for character: a description that drifts changes
            // what a browser-exported file asks the assistant for.
            expect(specs[name].description, `${kind}.${name} description`).toBe(
                field.description,
            );
            expect(specs[name].example, `${kind}.${name} example`).toEqual(field.example);
        }
        // And no field the backend does not have.
        expect(Object.keys(specs).sort()).toEqual([...FIELD_ORDER[kind]].sort());
    });
});

describe("a template built from the source equals the one the endpoint built", () => {
    it.each(CASES.map((c) => [c.key, c] as const))("%s", (_key, testCase) => {
        const built =
            testCase.kind === "book"
                ? buildBookTemplateFromRecord(
                      testCase.source as unknown as BookTemplateSource,
                      testCase.chapter_contents ?? [],
                  )
                : buildArticleTemplateFromRecord(
                      testCase.source as unknown as ArticleTemplateSource,
                  );
        expect(built).toEqual(recordedTemplate(testCase));
    });

    it.each(CASES.map((c) => [c.key, c] as const))(
        "%s puts the fields in the recorded order",
        (_key, testCase) => {
            const built =
                testCase.kind === "book"
                    ? buildBookTemplateFromRecord(
                          testCase.source as unknown as BookTemplateSource,
                          testCase.chapter_contents ?? [],
                      )
                    : buildArticleTemplateFromRecord(
                          testCase.source as unknown as ArticleTemplateSource,
                      );
            expect(Object.keys(built)).toEqual(Object.keys(recordedTemplate(testCase)));
        },
    );

    it("carries the whole body when it is under the limit, and truncates above it", () => {
        const long = Array.from({ length: 12 }, (_, i) => `Wort${i}`).join(" ");
        const article = {
            id: "a1",
            language: "de",
            content_json: JSON.stringify({
                type: "doc",
                content: [{ type: "paragraph", content: [{ type: "text", text: long }] }],
            }),
        };
        const whole = buildArticleTemplateFromRecord(article) as unknown as {
            reference: { body_word_count: number; body_preview: string };
        };
        expect(whole.reference.body_word_count).toBe(12);
        expect(whole.reference.body_preview).toBe(long);

        const cut = buildArticleTemplateFromRecord(article, 5) as unknown as {
            reference: { body_word_count: number; body_preview: string };
        };
        // The count is of the WHOLE body, not of the preview: the
        // assistant needs to know how much it is NOT seeing.
        expect(cut.reference.body_word_count).toBe(12);
        expect(cut.reference.body_preview).toBe("Wort0 Wort1 Wort2 Wort3 Wort4 [...]");
    });
});

describe("the empty template is the new-idea shape", () => {
    it.each(["book", "article"] as const)("%s", (kind) => {
        const template = buildEmptyTemplate(kind, "de") as unknown as Record<string, unknown>;
        // `language` at the root and no reference block: the file alone
        // has to tell the assistant what language to answer in.
        expect(template.language).toBe("de");
        expect(template.reference).toBeUndefined();
        for (const name of FIELD_ORDER[kind]) {
            const field = template[name] as Record<string, unknown>;
            expect(Object.keys(field)).toEqual(["description", "example", "current_value"]);
        }
    });

    it("gives the list fields an empty list, not null", () => {
        const book = buildEmptyTemplate("book") as unknown as Record<
            string,
            { current_value: unknown }
        >;
        expect(book.keywords.current_value).toEqual([]);
        expect(book.chapter_summaries.current_value).toEqual([]);
        expect(book.title.current_value).toBeNull();
    });
});

describe("applying a filled file reports what the endpoint reports", () => {
    it.each(APPLY_CASES.map((c) => [c.key, c] as const))("%s", (_key, testCase) => {
        const template = parseTemplate(testCase.filled_yaml);
        const result = applyTemplate(template, testCase.before, {
            force: testCase.force,
            chapters: testCase.chapters,
        });
        expect(result.updated).toEqual(testCase.response.updated_fields);
        expect(Object.keys(result.skipped)).toEqual(testCase.response.skipped_fields);
        expect(result.skipped).toEqual(testCase.response.skip_reasons);
        if (testCase.kind === "book") {
            expect(result.droppedChapterSummaries).toEqual(
                testCase.response.dropped_chapter_summaries,
            );
        }
    });

    it.each(APPLY_CASES.map((c) => [c.key, c] as const))(
        "%s writes the values the endpoint wrote",
        (_key, testCase) => {
            const result = applyTemplate(parseTemplate(testCase.filled_yaml), testCase.before, {
                force: testCase.force,
                chapters: testCase.chapters,
            });
            // The patch is what the caller hands the storage seam, so
            // comparing it against the row the endpoint left behind is
            // the end-to-end check: same inputs, same stored values.
            for (const [column, value] of Object.entries(result.patch)) {
                expect(value, `column ${column}`).toEqual(testCase.after[column]);
            }
            // And every column the endpoint changed is in the patch -
            // a port that skipped one would otherwise pass the loop
            // above by writing less.
            for (const [column, value] of Object.entries(testCase.after)) {
                if (JSON.stringify(value) !== JSON.stringify(testCase.before[column])) {
                    expect(Object.keys(result.patch), `column ${column}`).toContain(column);
                }
            }
        },
    );

    it("leaves the record it was handed untouched", () => {
        const testCase = APPLY_CASES[0];
        const before = { ...testCase.before };
        applyTemplate(parseTemplate(testCase.filled_yaml), before, {
            force: testCase.force,
            chapters: testCase.chapters,
        });
        // The caller decides whether to persist; a mutation here would
        // leave a half-applied record behind when it decides not to.
        expect(before).toEqual(testCase.before);
    });
});
