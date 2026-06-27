import { describe, it, expect, vi } from "vitest";

import type { Book, BookCreate, ChapterCreate, PageCreate } from "../api/client";
import {
    BUILTIN_BOOK_TEMPLATES,
    CLIENT_TEMPLATE_ID_PREFIX,
    clientTemplateCatalog,
    clientTemplateItemCount,
    findClientTemplate,
    instantiateClientBookTemplate,
    isClientTemplateId,
    type TemplateInstantiationStorage,
} from "./bookTemplates";

/** Identity translate (returns the fallback) — the catalog/instantiation logic
 *  is what we test, not the catalog strings. */
const t = (_key: string, fallback: string) => fallback;

interface Recorded {
    books: BookCreate[];
    chapters: Array<{ bookId: string; data: ChapterCreate }>;
    pages: Array<{ bookId: string; data: PageCreate }>;
    storage: TemplateInstantiationStorage;
}

function fakeStorage(): Recorded {
    const rec: Recorded = {
        books: [],
        chapters: [],
        pages: [],
        // assigned below
        storage: undefined as unknown as TemplateInstantiationStorage,
    };
    rec.storage = {
        books: {
            create: vi.fn(async (data: BookCreate) => {
                rec.books.push(data);
                return { id: "book-1", title: data.title } as unknown as Book;
            }),
        },
        chapters: {
            create: vi.fn(async (bookId: string, data: ChapterCreate) => {
                rec.chapters.push({ bookId, data });
                return {};
            }),
        },
        pages: {
            create: vi.fn(async (bookId: string, data: PageCreate) => {
                rec.pages.push({ bookId, data });
                return {};
            }),
        },
    };
    return rec;
}

const baseMeta = (templateId: string) => ({
    template_id: templateId,
    title: "My Book",
    author: "Asterios",
    language: "de",
});

describe("client book template catalog", () => {
    it("isClientTemplateId recognizes the prefix", () => {
        expect(isClientTemplateId(`${CLIENT_TEMPLATE_ID_PREFIX}roman-3akt`)).toBe(true);
        expect(isClientTemplateId("db-uuid-1234")).toBe(false);
    });

    it("every built-in id carries the client prefix and is findable", () => {
        for (const tpl of BUILTIN_BOOK_TEMPLATES) {
            expect(isClientTemplateId(tpl.id)).toBe(true);
            expect(findClientTemplate(tpl.id)).toBe(tpl);
        }
    });

    it("clientTemplateCatalog filters by book type", () => {
        const prose = clientTemplateCatalog("prose", t);
        const picture = clientTemplateCatalog("picture_book", t);
        const comic = clientTemplateCatalog("comic_book", t);
        expect(prose.map((c) => c.id)).toEqual([
            "client-roman-3akt",
            "client-sachbuch",
            "client-kurzgeschichte",
            "client-lyrik",
        ]);
        expect(picture.map((c) => c.id)).toEqual(["client-kinderbuch"]);
        expect(comic.map((c) => c.id)).toEqual(["client-comic"]);
        // Catalog cards are flagged builtin (Lock badge, no delete).
        expect(prose.every((c) => c.is_builtin)).toBe(true);
        // Card count badge reads chapters.length.
        expect(picture[0].chapters.length).toBe(12);
    });
});

describe("instantiateClientBookTemplate (Test 1 + 4: prose -> editable chapters)", () => {
    it("creates a book then its chapters in order through the seam", async () => {
        const rec = fakeStorage();
        const tpl = findClientTemplate("client-sachbuch")!;
        const book = await instantiateClientBookTemplate(
            rec.storage,
            tpl,
            baseMeta(tpl.id),
            t,
        );

        expect(book.id).toBe("book-1");
        // One book create, no book_type for prose.
        expect(rec.books).toHaveLength(1);
        expect(rec.books[0]).toMatchObject({ title: "My Book", author: "Asterios" });
        expect(rec.books[0].book_type).toBeUndefined();
        // No pages for a prose template.
        expect(rec.pages).toHaveLength(0);

        // Sachbuch: Vorwort, Einleitung, 8 chapters, Zusammenfassung, Anhang = 12.
        expect(rec.chapters).toHaveLength(12);
        expect(rec.chapters[0].data.title).toBe("Vorwort");
        expect(rec.chapters[1].data.title).toBe("Einleitung");
        expect(rec.chapters[2].data.title).toBe("Kapitel 1");
        expect(rec.chapters[9].data.title).toBe("Kapitel 8");
        expect(rec.chapters[10].data.title).toBe("Zusammenfassung");
        expect(rec.chapters[11].data.title).toBe("Anhang");

        // Positions are sequential and every chapter is a normal, editable row
        // (a title + chapter_type, no locked flag / no preset content).
        rec.chapters.forEach((c, i) => {
            expect(c.bookId).toBe("book-1");
            expect(c.data.position).toBe(i);
            expect(typeof c.data.title).toBe("string");
            expect(c.data.chapter_type).toBeTruthy();
            expect("content" in c.data).toBe(false);
        });
    });
});

describe("Roman 3-act structure (Test 2)", () => {
    it("seeds prologue + 3 act headers + 11 chapters + epilogue", async () => {
        const rec = fakeStorage();
        const tpl = findClientTemplate("client-roman-3akt")!;
        await instantiateClientBookTemplate(rec.storage, tpl, baseMeta(tpl.id), t);

        const types = rec.chapters.map((c) => c.data.chapter_type);
        const titles = rec.chapters.map((c) => c.data.title);

        expect(titles[0]).toBe("Prolog");
        expect(types[0]).toBe("prologue");
        expect(titles[titles.length - 1]).toBe("Epilog");
        expect(types[types.length - 1]).toBe("epilogue");

        // Three act headers (part) titled Akt 1/2/3.
        const acts = rec.chapters.filter((c) => c.data.chapter_type === "part");
        expect(acts.map((a) => a.data.title)).toEqual(["Akt 1", "Akt 2", "Akt 3"]);

        // Eleven numbered chapters across the three acts.
        const chapters = rec.chapters.filter((c) => c.data.chapter_type === "chapter");
        expect(chapters).toHaveLength(11);
        expect(chapters[0].data.title).toBe("Kapitel 1");
        expect(chapters[10].data.title).toBe("Kapitel 11");
        expect(clientTemplateItemCount(tpl)).toBe(rec.chapters.length);
    });
});

describe("Kinderbuch picture-book pages (Test 3)", () => {
    it("creates the book with book_type and 12 image+text pages, no chapters", async () => {
        const rec = fakeStorage();
        const tpl = findClientTemplate("client-kinderbuch")!;
        await instantiateClientBookTemplate(rec.storage, tpl, baseMeta(tpl.id), t);

        expect(rec.books[0].book_type).toBe("picture_book");
        expect(rec.chapters).toHaveLength(0);
        expect(rec.pages).toHaveLength(12);
        rec.pages.forEach((p) => {
            expect(p.bookId).toBe("book-1");
            expect(p.data.layout).toBe("image_top_text_bottom");
        });
    });
});

describe("Comic pages", () => {
    it("creates 22 comic_panel_grid pages with comic_book type", async () => {
        const rec = fakeStorage();
        const tpl = findClientTemplate("client-comic")!;
        await instantiateClientBookTemplate(rec.storage, tpl, baseMeta(tpl.id), t);

        expect(rec.books[0].book_type).toBe("comic_book");
        expect(rec.pages).toHaveLength(22);
        expect(rec.pages.every((p) => p.data.layout === "comic_panel_grid")).toBe(true);
    });
});
