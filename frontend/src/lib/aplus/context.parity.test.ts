/**
 * #890: the port reproduces the Python context assembly.
 *
 * `context.parity.json` is recorded by
 * `backend/tests/test_aplus_context_parity.py` from real book rows
 * through `find_missing_fields`, `build_book_context`, the route's
 * language override, `compute_source_hash`, `build_style_context`,
 * `render_image_prompt` and `with_rendered_prompts`.
 *
 * Recorded at the route's boundary, from rows rather than from
 * hand-built contexts, because a record taken below the boundary cannot
 * see what the boundary adds - which is how #1042 happened.
 *
 * Each case carries the row twice: `book` as the ORM holds it (list
 * columns as JSON text) and `frontend_book` as the frontend's `Book`
 * type has it (decoded arrays). Both are fed through the port, because
 * both shapes reach it in production.
 */

import {describe, expect, it} from "vitest";

import record from "./context.parity.json";
import {
    JUVENILE_TEXT_MARKERS,
    type BookContext,
    type BookContextSource,
    buildBookContext,
    computeSourceHash,
    findMissingFields,
} from "./bookContext";
import {
    type RenderablePackage,
    buildStyleContext,
    renderImagePrompt,
    withRenderedPrompts,
} from "./imagePrompts";
import {getAplusRuleset} from "./ruleset";

interface RecordedCase {
    name: string;
    book: Record<string, string | null>;
    frontend_book: Record<string, unknown>;
    language_override: string | null;
    missing_fields: {field: string; reason: string}[];
    context: BookContext;
    source_hash: string;
}

const CASES = record.cases as unknown as RecordedCase[];
const RULESET_VERSION = record.ruleset_version as string;

/** The route applies the override after building the context. */
function withOverride(context: BookContext, override: string | null): BookContext {
    return override === null ? context : {...context, language: override};
}

describe("A+ context parity with the Python assembly", () => {
    it("records the ruleset version the seed carries", () => {
        expect(RULESET_VERSION).toBe(getAplusRuleset().version);
    });

    it.each(CASES.map((c) => [c.name, c] as const))(
        "%s — context and hash",
        async (_name, testCase) => {
            const source = testCase.book as unknown as BookContextSource;
            const context = withOverride(
                buildBookContext(source),
                testCase.language_override,
            );
            expect(context).toEqual(testCase.context);
            expect(await computeSourceHash(context, RULESET_VERSION)).toBe(
                testCase.source_hash,
            );
        },
    );

    it.each(CASES.map((c) => [c.name, c] as const))(
        "%s — the decoded frontend row agrees with the ORM row",
        async (_name, testCase) => {
            // The one real shape difference between the two storage
            // layers must not change the context or the cache key.
            const source = testCase.frontend_book as unknown as BookContextSource;
            const context = withOverride(
                buildBookContext(source),
                testCase.language_override,
            );
            expect(context).toEqual(testCase.context);
            expect(await computeSourceHash(context, RULESET_VERSION)).toBe(
                testCase.source_hash,
            );
        },
    );

    it.each(CASES.map((c) => [c.name, c] as const))(
        "%s — missing fields",
        (_name, testCase) => {
            const source = testCase.book as unknown as BookContextSource;
            expect(findMissingFields(source)).toEqual(testCase.missing_fields);
        },
    );

    it.each(
        (record.style_contexts as {genre_key: string | null; style: unknown}[]).map(
            (entry) => [entry.genre_key ?? "default", entry] as const,
        ),
    )("style context for %s", (_name, entry) => {
        expect(
            buildStyleContext(entry.genre_key, getAplusRuleset().image_style),
        ).toEqual(entry.style);
    });

    it.each(
        (record.rendered as {name: string; image: unknown; rendered: string}[]).map(
            (entry) => [entry.name, entry] as const,
        ),
    )("rendered prompt: %s", (_name, entry) => {
        expect(renderImagePrompt(entry.image as never)).toBe(entry.rendered);
    });

    it.each(
        (record.packages as {name: string; package: unknown; with_rendered: unknown}[]).map(
            (entry) => [entry.name, entry] as const,
        ),
    )("with rendered prompts: %s", (_name, entry) => {
        expect(withRenderedPrompts(entry.package as RenderablePackage))
            .toEqual(entry.with_rendered);
    });

    it("never mutates the package it renders", () => {
        const pkg = {
            module_header: {image: {prompt: "a cat", aspect_ratio: "97:60"}},
            module_three_images: [{image: {prompt: "one"}}],
        };
        const before = JSON.stringify(pkg);
        withRenderedPrompts(pkg);
        expect(JSON.stringify(pkg)).toBe(before);
    });

    it("carries the same juvenile-marker table, language for language", () => {
        // The genre cases above all happen to use ASCII-spelled markers,
        // so they cannot see an accent lost in transcription. The table
        // itself is compared instead, in both directions: a dropped
        // entry and an invented one both fail here.
        const recorded = record.juvenile_text_markers as Record<string, string[]>;
        const ported = Object.fromEntries(
            Object.entries(JUVENILE_TEXT_MARKERS).map(([lang, markers]) => [
                lang,
                [...markers],
            ]),
        );
        expect(ported).toEqual(recorded);
    });

    it.each(
        (
            record.marker_probes as {
                language: string;
                marker: string;
                variant: string;
                description: string;
                genre_key: string | null;
            }[]
        ).map((p) => [`${p.language} ${p.marker} (${p.variant})`, p] as const),
    )("marker probe: %s", (_name, probe) => {
        const context = buildBookContext({
            id: "book-1",
            title: "Ein Buch",
            author: "A",
            language: probe.language,
            description: probe.description,
        });
        expect(context.genre_key).toBe(probe.genre_key);
    });

    it("covers each genre tier and both missing-field rules", () => {
        const genres = new Set(CASES.map((c) => c.context.genre_key));
        expect(genres.has("kinderbuch")).toBe(true);
        expect(genres.has(null)).toBe(true);
        expect([...genres].filter((g) => g && g !== "kinderbuch").length)
            .toBeGreaterThan(0);

        const fields = new Set(
            CASES.flatMap((c) => c.missing_fields.map((m) => m.field)),
        );
        expect([...fields].sort()).toEqual(["author", "description"]);
    });
});
