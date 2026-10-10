import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../storage", () => ({ getStorage: vi.fn() }));

import { getStorage } from "../storage";
import { TemplateSchemaError } from "../lib/ai/template/models";
import { parseTemplate } from "../lib/ai/template/yaml";
import { exportTemplateOffline, importTemplateOffline } from "./templateFileIo";

// #745 stage 3: the seam half of the offline round-trip. What the file
// says and what it does to a record is pinned against the endpoints in
// `lib/ai/template/factories.parity.test.ts`; this covers the part that
// needs the app - reading through the seam, writing the patch back, and
// answering in the shape the panel already renders.

const articleRow = {
    id: "ar1",
    title: "Warum Katzen klettern",
    language: "de",
    topic: "natur",
    tags: ["katzen"],
    seo_title: null,
    seo_description: null,
    excerpt: null,
    featured_image_prompt: null,
    inline_image_prompts: [],
    content_json: JSON.stringify({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Ein Absatz." }] }],
    }),
};

const bookRow = {
    id: "b1",
    title: "Der Kater auf dem Dach",
    language: "de",
    subtitle: null,
    description: "Steht schon da.",
    genre: null,
    keywords: [],
    html_description: null,
    backpage_description: null,
    backpage_author_bio: null,
    cover_image_prompt: null,
    chapter_summaries: [],
};

const chapters = [
    { id: "c1", title: "Erstes Kapitel", content: "{}" },
    { id: "c2", title: "Zweites Kapitel", content: "{}" },
];

const articlesGet = vi.fn(async () => ({ ...articleRow }));
const articlesUpdate = vi.fn(async (_id: string, _data: unknown) => ({}));
const booksGet = vi.fn(async () => ({ ...bookRow }));
const booksUpdate = vi.fn(async (_id: string, _data: unknown) => ({}));
const chaptersList = vi.fn(async () => chapters.map((c) => ({ ...c })));

beforeEach(() => {
    [articlesGet, articlesUpdate, booksGet, booksUpdate, chaptersList].forEach((m) =>
        m.mockClear(),
    );
    vi.mocked(getStorage).mockReturnValue({
        articles: { get: articlesGet, update: articlesUpdate },
        books: { get: booksGet, update: booksUpdate },
        chapters: { list: chaptersList },
    } as unknown as ReturnType<typeof getStorage>);
});

/** The YAML of an export, as text. */
async function exportedText(kind: "article" | "book", id: string): Promise<string> {
    const { blob } = await exportTemplateOffline(kind, id);
    return await blob.text();
}

describe("exportTemplateOffline", () => {
    it("builds the article template from the record the seam returns", async () => {
        const { filename } = await exportTemplateOffline("article", "ar1");
        expect(articlesGet).toHaveBeenCalledWith("ar1");
        expect(filename).toBe("warum-katzen-klettern.biblio.yaml");
        const template = parseTemplate(await exportedText("article", "ar1"));
        expect(template.type).toBe("article");
        expect((template.title as { current_value: unknown }).current_value).toBe(
            "Warum Katzen klettern",
        );
        // The reference block is what the assistant reads for context,
        // and it comes from the record rather than from the file's shape.
        expect(template.reference).toMatchObject({ id: "ar1", language: "de" });
    });

    it("gives the file the rules header, which is the whole instruction offline", async () => {
        expect(await exportedText("article", "ar1")).toContain("RULES FOR AI ASSISTANTS");
    });

    it("reads a book's chapters so the preview is the book's, not the first chapter's", async () => {
        await exportTemplateOffline("book", "b1");
        expect(booksGet).toHaveBeenCalledWith("b1");
        expect(chaptersList).toHaveBeenCalledWith("b1");
    });
});

describe("importTemplateOffline", () => {
    /**
     * A template for the record, with `values` written into the matching
     * `current_value` lines - the edit an assistant makes.
     *
     * Done by index rather than by a built regex: the field name would
     * be interpolated into the pattern, and a string search says what
     * this means more directly anyway.
     */
    async function filledFor(
        kind: "article" | "book",
        id: string,
        values: Record<string, unknown>,
    ): Promise<string> {
        let out = await exportedText(kind, id);
        for (const [field, value] of Object.entries(values)) {
            const fieldAt = out.indexOf(`\n${field}:\n`);
            if (fieldAt < 0) throw new Error(`field ${field} is not in the template`);
            const valueAt = out.indexOf("  current_value:", fieldAt);
            if (valueAt < 0) throw new Error(`field ${field} has no current_value`);
            const lineEnd = out.indexOf("\n", valueAt);
            out =
                out.slice(0, valueAt) +
                `  current_value: ${JSON.stringify(value)}` +
                out.slice(lineEnd);
        }
        return out;
    }

    it("writes only the fields it updated, through the seam", async () => {
        const filled = await filledFor("article", "ar1", { seo_title: "Ein SEO-Titel" });
        const result = await importTemplateOffline("article", "ar1", filled, false);
        expect(result.updated_fields).toContain("seo_title");
        expect(articlesUpdate).toHaveBeenCalledTimes(1);
        const [id, patch] = articlesUpdate.mock.calls[0] as [string, Record<string, unknown>];
        expect(id).toBe("ar1");
        expect(patch.seo_title).toBe("Ein SEO-Titel");
        // `title` is populated on the record and the file carries it
        // unchanged, so force=false must leave it out of the patch.
        expect(Object.keys(patch)).not.toContain("title");
    });

    it("answers in the endpoint's shape, so the panel needs no offline branch", async () => {
        const filled = await filledFor("article", "ar1", { seo_title: "Titel" });
        const result = await importTemplateOffline("article", "ar1", filled, false);
        expect(result.article_id).toBe("ar1");
        expect(result.force).toBe(false);
        expect(result.skip_reasons.title).toBe("field-already-populated");
        expect(result.skipped_fields).toContain("title");
    });

    it("overwrites a populated column only with force", async () => {
        const filled = await filledFor("article", "ar1", { topic: "Ein anderes Thema" });
        const soft = await importTemplateOffline("article", "ar1", filled, false);
        expect(soft.updated_fields).not.toContain("topic");

        articlesUpdate.mockClear();
        const forced = await importTemplateOffline("article", "ar1", filled, true);
        expect(forced.updated_fields).toContain("topic");
        const [, patch] = articlesUpdate.mock.calls[0] as [string, Record<string, unknown>];
        expect(patch.topic).toBe("Ein anderes Thema");
    });

    it("does not touch the seam when nothing was updated", async () => {
        const untouched = await exportedText("article", "ar1");
        const result = await importTemplateOffline("article", "ar1", untouched, false);
        expect(result.updated_fields).toEqual([]);
        // A write of {} would bump `updated_at` for no reason and make
        // the article look edited in every list sorted by it.
        expect(articlesUpdate).not.toHaveBeenCalled();
    });

    it("reconciles chapter summaries against the book's chapters", async () => {
        const filled = await filledFor("book", "b1", {
            genre: "Belletristik",
        });
        const withSummaries = filled.replace(
            /(chapter_summaries:(?:.|\n)*?)current_value: \[\]/,
            "$1current_value:\n" +
                "    - chapter_id: c1\n" +
                "      title: egal\n" +
                "      summary: Eins.\n" +
                "    - title: '  zweites   KAPITEL '\n" +
                "      summary: Zwei.\n" +
                "    - chapter_id: nope\n" +
                "      title: Gibt es nicht\n" +
                "      summary: Verwaist.\n",
        );
        expect(withSummaries).not.toBe(filled);
        const result = await importTemplateOffline("book", "b1", withSummaries, false);
        const [, patch] = booksUpdate.mock.calls[0] as [string, Record<string, unknown>];
        // Matched by id and by a loosely-spelled title; the third names
        // no chapter and is reported rather than written.
        expect(patch.chapter_summaries).toEqual([
            { chapter_id: "c1", title: "Erstes Kapitel", summary: "Eins." },
            { chapter_id: "c2", title: "Zweites Kapitel", summary: "Zwei." },
        ]);
        expect(result.dropped_chapter_summaries).toEqual([
            { reason: "no-matching-chapter", chapter_id: "nope", title: "Gibt es nicht" },
        ]);
    });

    it("refuses a template of the other kind, and writes nothing", async () => {
        const bookTemplate = await exportedText("book", "b1");
        await expect(
            importTemplateOffline("article", "ar1", bookTemplate, false),
        ).rejects.toThrow(TemplateSchemaError);
        expect(articlesUpdate).not.toHaveBeenCalled();
    });

    it("refuses a malformed file with a message that names the problem", async () => {
        await expect(
            importTemplateOffline("article", "ar1", "type: article\n", false),
        ).rejects.toThrow(/schema_version/);
        expect(articlesUpdate).not.toHaveBeenCalled();
    });
});
