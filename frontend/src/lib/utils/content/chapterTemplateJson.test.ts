import { describe, expect, it } from "vitest";

import {
    CHAPTER_TEMPLATE_FORMAT,
    chapterTemplateFilename,
    parseChapterTemplateJson,
    serializeChapterTemplate,
} from "./chapterTemplateJson";

const TEMPLATE = {
    id: "t1",
    name: "Interview",
    description: "Frage-Antwort-Struktur",
    chapter_type: "chapter" as const,
    content: '{"type":"doc","content":[]}',
    language: "en",
    is_builtin: true,
    child_template_ids: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
};

describe("serializeChapterTemplate", () => {
    it("emits the format marker and the portable fields", () => {
        expect(serializeChapterTemplate(TEMPLATE)).toEqual({
            format: CHAPTER_TEMPLATE_FORMAT,
            format_version: "1.0",
            name: "Interview",
            description: "Frage-Antwort-Struktur",
            chapter_type: "chapter",
            content: '{"type":"doc","content":[]}',
            language: "en",
            child_template_ids: [],
        });
    });

    it("never serializes is_builtin, so a re-import lands as a user template", () => {
        expect(serializeChapterTemplate(TEMPLATE)).not.toHaveProperty("is_builtin");
        expect(serializeChapterTemplate(TEMPLATE)).not.toHaveProperty("id");
    });

    it("normalizes a null child list to an empty array", () => {
        expect(serializeChapterTemplate({ ...TEMPLATE, child_template_ids: ["a"] })
            .child_template_ids).toEqual(["a"]);
        expect(serializeChapterTemplate(TEMPLATE).child_template_ids).toEqual([]);
    });
});

describe("parseChapterTemplateJson", () => {
    const valid = JSON.stringify(serializeChapterTemplate(TEMPLATE));

    it("round-trips a serialized template", () => {
        expect(parseChapterTemplateJson(valid)).toEqual({
            name: "Interview",
            description: "Frage-Antwort-Struktur",
            chapter_type: "chapter",
            content: '{"type":"doc","content":[]}',
            language: "en",
            child_template_ids: [],
        });
    });

    it("defaults a missing language to en and a missing content to null", () => {
        const text = JSON.stringify({
            format: CHAPTER_TEMPLATE_FORMAT,
            name: "N",
            description: "D",
            chapter_type: "preface",
        });
        expect(parseChapterTemplateJson(text)).toMatchObject({
            language: "en",
            content: null,
            child_template_ids: [],
        });
    });

    it("rejects malformed JSON and a non-object root", () => {
        expect(() => parseChapterTemplateJson("{")).toThrow(/valid JSON/i);
        expect(() => parseChapterTemplateJson("[]")).toThrow(/object/i);
        expect(() => parseChapterTemplateJson('"text"')).toThrow(/object/i);
    });

    it("rejects a file without the Bibliogon format marker", () => {
        const text = JSON.stringify({ name: "N", description: "D", chapter_type: "chapter" });
        expect(() => parseChapterTemplateJson(text)).toThrow(/format/i);
        const wrong = JSON.stringify({
            format: "something-else",
            name: "N",
            description: "D",
            chapter_type: "chapter",
        });
        expect(() => parseChapterTemplateJson(wrong)).toThrow(/format/i);
    });

    it("rejects missing required fields, blank-after-trim included", () => {
        for (const partial of [
            { description: "D", chapter_type: "chapter" },
            { name: "N", chapter_type: "chapter" },
            { name: "N", description: "D" },
            { name: "   ", description: "D", chapter_type: "chapter" },
        ]) {
            const text = JSON.stringify({ format: CHAPTER_TEMPLATE_FORMAT, ...partial });
            expect(() => parseChapterTemplateJson(text)).toThrow(/required fields/i);
        }
    });

    it("trims name and description, like the endpoint", () => {
        const text = JSON.stringify({
            format: CHAPTER_TEMPLATE_FORMAT,
            name: "  Padded  ",
            description: "  Also padded  ",
            chapter_type: "chapter",
        });
        expect(parseChapterTemplateJson(text)).toMatchObject({
            name: "Padded",
            description: "Also padded",
        });
    });

    it("rejects an unknown chapter_type", () => {
        const text = JSON.stringify({
            format: CHAPTER_TEMPLATE_FORMAT,
            name: "N",
            description: "D",
            chapter_type: "not_a_type",
        });
        expect(() => parseChapterTemplateJson(text)).toThrow(/chapter_type/i);
    });

    it("rejects a child_template_ids that is not a list of strings", () => {
        for (const bad of [{ a: 1 }, [1, 2], ["ok", 3]]) {
            const text = JSON.stringify({
                format: CHAPTER_TEMPLATE_FORMAT,
                name: "N",
                description: "D",
                chapter_type: "chapter",
                child_template_ids: bad,
            });
            expect(() => parseChapterTemplateJson(text)).toThrow(/child_template_ids/i);
        }
    });
});

describe("chapterTemplateFilename", () => {
    it("slugifies the name the way the backend does", () => {
        expect(chapterTemplateFilename("Photo Report")).toBe(
            "photo-report.chapter-template.json",
        );
        expect(chapterTemplateFilename("FAQ")).toBe("faq.chapter-template.json");
    });

    it("keeps dots and underscores, replaces runs of anything else", () => {
        expect(chapterTemplateFilename("my_v1.2 template!!")).toBe(
            "my_v1.2-template.chapter-template.json",
        );
    });

    it("falls back when the name slugifies to nothing", () => {
        expect(chapterTemplateFilename("!!!")).toBe("chapter-template.chapter-template.json");
        expect(chapterTemplateFilename("")).toBe("chapter-template.chapter-template.json");
    });
});
