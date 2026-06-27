/**
 * Client-side built-in book templates (offline / Maximal-Offline path).
 *
 * The online template feature is backend-driven (``api.templates.list`` +
 * ``POST /api/books/from-template``) and prose-only. This module provides a
 * client-side catalog that powers the existing "Aus Vorlage" tab in offline
 * (Dexie) mode, instantiating the book + its chapters/pages through the
 * ``getStorage()`` seam so the backendless PWA can start from a template with
 * zero ``/api`` calls.
 *
 * Built-in catalog (Stufe 1):
 *   - Roman (3-Akt) — prose: Prolog, three acts (part headers + chapters), Epilog
 *   - Sachbuch — prose: Vorwort, Einleitung, 8 Kapitel, Zusammenfassung, Anhang
 *   - Kurzgeschichte — prose: a single chapter
 *   - Lyrik / Gedichte — prose: 20 Gedicht-Kapitel
 *   - Kinderbuch — picture_book: 12 image+text pages
 *   - Comic — comic_book: 22 comic pages
 *
 * Names, descriptions and chapter titles are i18n keys (resolved by the caller
 * via ``t``), so the catalog localizes across all 8 catalogs. The created
 * chapters/pages are normal, fully-editable rows — the template only seeds the
 * structure.
 *
 * @example
 * const catalog = clientTemplateCatalog("prose", t);
 * const tpl = findClientTemplate("client-roman-3akt");
 * const book = await instantiateClientBookTemplate(getStorage(), tpl!, payload, t);
 */

import type {
    Book,
    BookCreate,
    BookFromTemplateCreate,
    BookTemplate,
    BookType,
    ChapterCreate,
    ChapterType,
    PageCreate,
    PageLayout,
} from "../api/client";

/** Prefix marking a template id as a client-side (offline) built-in. The
 *  create page branches on this to route through the storage seam instead of
 *  the backend ``/books/from-template`` endpoint. */
export const CLIENT_TEMPLATE_ID_PREFIX = "client-";

/** True when ``id`` belongs to a client-side built-in template. */
export function isClientTemplateId(id: string): boolean {
    return id.startsWith(CLIENT_TEMPLATE_ID_PREFIX);
}

/** A translate function shaped like ``useI18n``'s ``t`` (key + fallback). */
export type Translate = (key: string, fallback: string) => string;

/** One chapter entry of a prose template. ``number`` (when present) is
 *  appended to the resolved title as " {n}" for numbered chapters. */
export interface TemplateChapter {
    titleKey: string;
    titleFallback: string;
    number?: number;
    chapterType: ChapterType;
}

interface ProseTemplateBody {
    kind: "prose";
    chapters: TemplateChapter[];
}

interface PageTemplateBody {
    kind: "pages";
    pageCount: number;
    pageLayout: PageLayout;
}

/** A built-in client-side book template. */
export interface ClientBookTemplate {
    /** Stable id, ``client-``-prefixed (see {@link CLIENT_TEMPLATE_ID_PREFIX}). */
    id: string;
    bookType: BookType;
    nameKey: string;
    nameFallback: string;
    descriptionKey: string;
    descriptionFallback: string;
    /** i18n key for the genre badge (reuses ``ui.genres.*`` where it fits). */
    genreKey: string;
    genreFallback: string;
    /** Default language pre-filled into the create form. */
    language: string;
    body: ProseTemplateBody | PageTemplateBody;
}

/**
 * User-saved book template (Stufe 2 — interface prepared, no UI yet).
 *
 * The online "Save as template" flow persists to the backend
 * (``api.templates.create``). The offline counterpart would persist a
 * ``UserBookTemplate`` to a future Dexie ``userBookTemplates`` table behind a
 * new ``IStorageService`` member; it is intentionally NOT wired here to avoid a
 * half-wired (write-without-consumer) surface. This interface documents the
 * intended shape so the offline save path can be added later without churn.
 */
export interface UserBookTemplate {
    id: string;
    name: string;
    description: string;
    bookType: BookType;
    genre: string;
    language: string;
    /** Resolved (already-localized) chapter entries — user templates are not
     *  i18n keys, they are concrete authored structures. */
    chapters: Array<{ title: string; chapterType: ChapterType; content?: string }>;
    /** Page count + layout for picture-book / comic user templates. */
    pages?: { count: number; layout: PageLayout };
    createdAt: string;
}

const TITLE = "ui.book_templates.title.";

function titled(
    key: string,
    fallback: string,
    chapterType: ChapterType,
    number?: number,
): TemplateChapter {
    return { titleKey: TITLE + key, titleFallback: fallback, chapterType, number };
}

/** A contiguous run of numbered chapters (``from``..``to`` inclusive). */
function chapterRange(from: number, to: number): TemplateChapter[] {
    const out: TemplateChapter[] = [];
    for (let n = from; n <= to; n++) {
        out.push(titled("chapter", "Kapitel", "chapter", n));
    }
    return out;
}

const ROMAN_3AKT: ClientBookTemplate = {
    id: "client-roman-3akt",
    bookType: "prose",
    nameKey: "ui.book_templates.name.roman_3act",
    nameFallback: "Roman (3-Akt)",
    descriptionKey: "ui.book_templates.desc.roman_3act",
    descriptionFallback:
        "Romanstruktur in drei Akten mit Prolog, Aktüberschriften, elf Kapiteln und Epilog.",
    genreKey: "ui.genres.novel",
    genreFallback: "Roman",
    language: "de",
    body: {
        kind: "prose",
        chapters: [
            titled("prologue", "Prolog", "prologue"),
            titled("act", "Akt", "part", 1),
            ...chapterRange(1, 3),
            titled("act", "Akt", "part", 2),
            ...chapterRange(4, 8),
            titled("act", "Akt", "part", 3),
            ...chapterRange(9, 11),
            titled("epilogue", "Epilog", "epilogue"),
        ],
    },
};

const SACHBUCH: ClientBookTemplate = {
    id: "client-sachbuch",
    bookType: "prose",
    nameKey: "ui.book_templates.name.sachbuch",
    nameFallback: "Sachbuch",
    descriptionKey: "ui.book_templates.desc.sachbuch",
    descriptionFallback:
        "Sachbuch mit Vorwort, Einleitung, acht Kapiteln, Zusammenfassung und Anhang.",
    genreKey: "ui.genres.non_fiction",
    genreFallback: "Sachbuch",
    language: "de",
    body: {
        kind: "prose",
        chapters: [
            titled("foreword", "Vorwort", "foreword"),
            titled("introduction", "Einleitung", "introduction"),
            ...chapterRange(1, 8),
            titled("summary", "Zusammenfassung", "afterword"),
            titled("appendix", "Anhang", "appendix"),
        ],
    },
};

const KURZGESCHICHTE: ClientBookTemplate = {
    id: "client-kurzgeschichte",
    bookType: "prose",
    nameKey: "ui.book_templates.name.kurzgeschichte",
    nameFallback: "Kurzgeschichte",
    descriptionKey: "ui.book_templates.desc.kurzgeschichte",
    descriptionFallback: "Eine einzelne Kurzgeschichte in einem Kapitel.",
    genreKey: "ui.genres.short_stories",
    genreFallback: "Kurzgeschichten",
    language: "de",
    body: {
        kind: "prose",
        chapters: [titled("story", "Geschichte", "chapter")],
    },
};

const LYRIK: ClientBookTemplate = {
    id: "client-lyrik",
    bookType: "prose",
    nameKey: "ui.book_templates.name.lyrik",
    nameFallback: "Lyrik / Gedichte",
    descriptionKey: "ui.book_templates.desc.lyrik",
    descriptionFallback: "Gedichtband mit zwanzig Gedicht-Kapiteln.",
    genreKey: "ui.genres.poetry",
    genreFallback: "Lyrik",
    language: "de",
    body: {
        kind: "prose",
        chapters: Array.from({ length: 20 }, (_, i) =>
            titled("poem", "Gedicht", "chapter", i + 1),
        ),
    },
};

const KINDERBUCH: ClientBookTemplate = {
    id: "client-kinderbuch",
    bookType: "picture_book",
    nameKey: "ui.book_templates.name.kinderbuch",
    nameFallback: "Kinderbuch",
    descriptionKey: "ui.book_templates.desc.kinderbuch",
    descriptionFallback: "Bilderbuch mit zwölf Seiten (Bild und Text).",
    genreKey: "ui.genres.children",
    genreFallback: "Kinderbuch",
    language: "de",
    body: { kind: "pages", pageCount: 12, pageLayout: "image_top_text_bottom" },
};

const COMIC: ClientBookTemplate = {
    id: "client-comic",
    bookType: "comic_book",
    nameKey: "ui.book_templates.name.comic",
    nameFallback: "Comic",
    descriptionKey: "ui.book_templates.desc.comic",
    descriptionFallback: "Comic-Heft mit zweiundzwanzig Seiten im Standardformat.",
    genreKey: "ui.genres.other",
    genreFallback: "Comic",
    language: "de",
    body: { kind: "pages", pageCount: 22, pageLayout: "comic_panel_grid" },
};

/** The full built-in catalog, in display order. */
export const BUILTIN_BOOK_TEMPLATES: ClientBookTemplate[] = [
    ROMAN_3AKT,
    SACHBUCH,
    KURZGESCHICHTE,
    LYRIK,
    KINDERBUCH,
    COMIC,
];

/** Number of structural items (chapters or pages) a template seeds. */
export function clientTemplateItemCount(template: ClientBookTemplate): number {
    return template.body.kind === "prose"
        ? template.body.chapters.length
        : template.body.pageCount;
}

/** Look up a built-in client template by its (``client-``-prefixed) id. */
export function findClientTemplate(id: string): ClientBookTemplate | undefined {
    return BUILTIN_BOOK_TEMPLATES.find((t) => t.id === id);
}

/**
 * Map the built-in templates for one book type into the ``BookTemplate`` UI
 * shape the existing template picker renders. Names/descriptions/genre are
 * resolved through ``translate`` here; ``chapters`` is a length-only stub
 * because the picker only reads ``chapters.length`` for the count badge.
 */
export function clientTemplateCatalog(
    bookType: BookType,
    translate: Translate,
): BookTemplate[] {
    return BUILTIN_BOOK_TEMPLATES.filter((t) => t.bookType === bookType).map((t) => ({
        id: t.id,
        name: translate(t.nameKey, t.nameFallback),
        description: translate(t.descriptionKey, t.descriptionFallback),
        genre: translate(t.genreKey, t.genreFallback),
        language: t.language,
        is_builtin: true,
        created_at: "",
        updated_at: "",
        chapters: Array.from({ length: clientTemplateItemCount(t) }, (_, i) => ({
            position: i,
            title: "",
            chapter_type: "chapter" as ChapterType,
            content: null,
        })),
    }));
}

function resolveChapterTitle(translate: Translate, chapter: TemplateChapter): string {
    const base = translate(chapter.titleKey, chapter.titleFallback);
    return chapter.number != null ? `${base} ${chapter.number}` : base;
}

/** Minimal storage surface the instantiation needs. Both ``ApiStorage`` and
 *  ``DexieStorage`` (via ``getStorage()``) satisfy it structurally; tests pass
 *  a fake so the helper is unit-testable without a backend. */
export interface TemplateInstantiationStorage {
    books: { create: (data: BookCreate) => Promise<Book> };
    chapters: { create: (bookId: string, data: ChapterCreate) => Promise<unknown> };
    pages: { create: (bookId: string, data: PageCreate) => Promise<unknown> };
}

/**
 * Create a book from a client-side template through the storage seam. Creates
 * the book first, then its chapters (prose) or pages (picture-book / comic) in
 * order. Returns the created book so the caller can navigate to it.
 */
export async function instantiateClientBookTemplate(
    storage: TemplateInstantiationStorage,
    template: ClientBookTemplate,
    meta: BookFromTemplateCreate,
    translate: Translate,
): Promise<Book> {
    const book = await storage.books.create({
        title: meta.title,
        author: meta.author,
        language: meta.language,
        genre: meta.genre,
        subtitle: meta.subtitle,
        description: meta.description,
        series: meta.series,
        series_index: meta.series_index,
        ...(template.bookType !== "prose" ? { book_type: template.bookType } : {}),
    });

    if (template.body.kind === "prose") {
        let position = 0;
        for (const chapter of template.body.chapters) {
            await storage.chapters.create(book.id, {
                title: resolveChapterTitle(translate, chapter),
                chapter_type: chapter.chapterType,
                position,
            });
            position += 1;
        }
    } else {
        for (let i = 0; i < template.body.pageCount; i += 1) {
            await storage.pages.create(book.id, {
                layout: template.body.pageLayout,
                text_content: null,
            });
        }
    }

    return book;
}
