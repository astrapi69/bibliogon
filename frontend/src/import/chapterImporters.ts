/**
 * Single-file -> book+chapter importers for the offline import path (#76).
 *
 * Each importer turns one loose document (`.md`, `.txt`, `.html`) into either
 * a brand-new prose book holding one chapter, or one chapter appended to an
 * existing book. All persistence goes through the `getStorage()` seam, so the
 * importers work identically online and offline (no `/api` in Dexie mode).
 *
 * Markdown is rendered to HTML by `marked`, then both Markdown and HTML reuse
 * the shared {@link htmlToTipTapDoc} walker; plain text is split into
 * paragraphs directly.
 */

import { marked } from "marked";

import { getStorage } from "../storage";
import type { TipTapDoc, TipTapNode } from "../medium-import/walker";
import { htmlToTipTapDoc } from "./htmlToTipTap";

/** Where an imported chapter lands. */
export type ChapterImportTarget =
    | { kind: "new-book" }
    | { kind: "existing-book"; bookId: string };

/** Outcome of a single-file chapter import. */
export interface ChapterImportResult {
    bookId: string;
    bookTitle: string;
    chapterId: string;
    chapterTitle: string;
    /** True when a new book was created, false when appended to an existing one. */
    createdBook: boolean;
}

/** A title derived from the source plus the TipTap body to store. */
interface DerivedChapter {
    title: string;
    doc: TipTapDoc;
}

function stemOf(filename: string): string {
    const base = filename.split(/[\\/]/).pop() ?? filename;
    const dot = base.lastIndexOf(".");
    const stem = dot > 0 ? base.slice(0, dot) : base;
    return stem.trim() || base;
}

function firstHeadingText(doc: TipTapDoc, level: number): string | null {
    const node = doc.content[0];
    if (
        node?.type === "heading" &&
        (node.attrs?.level as number | undefined) === level
    ) {
        return nodeText(node).trim() || null;
    }
    return null;
}

function nodeText(node: TipTapNode): string {
    if (node.text) return node.text;
    return (node.content ?? []).map(nodeText).join("");
}

function withoutLeadingHeading(doc: TipTapDoc): TipTapDoc {
    const content = doc.content.slice(1);
    return {
        type: "doc",
        content: content.length > 0 ? content : [{ type: "paragraph" }],
    };
}

function deriveFromMarkdown(text: string, filename: string): DerivedChapter {
    const html = marked.parse(text, { async: false }) as string;
    const doc = htmlToTipTapDoc(html);
    const headingTitle = firstHeadingText(doc, 1);
    if (headingTitle) {
        return { title: headingTitle, doc: withoutLeadingHeading(doc) };
    }
    return { title: stemOf(filename), doc };
}

function deriveFromHtml(text: string, filename: string): DerivedChapter {
    const parsed = new DOMParser().parseFromString(text, "text/html");
    const docTitle = parsed.querySelector("title")?.textContent?.trim() || "";
    const doc = htmlToTipTapDoc(text);
    if (docTitle) return { title: docTitle, doc };
    const headingTitle = firstHeadingText(doc, 1);
    if (headingTitle) {
        return { title: headingTitle, doc: withoutLeadingHeading(doc) };
    }
    return { title: stemOf(filename), doc };
}

function deriveFromText(text: string, filename: string): DerivedChapter {
    const blocks = text
        .split(/\n[ \t]*\n/)
        .map((block) => block.replace(/\s*\n\s*/g, " ").trim())
        .filter((block) => block.length > 0);
    const content: TipTapNode[] = blocks.map((block) => ({
        type: "paragraph",
        content: [{ type: "text", text: block }],
    }));
    return {
        title: stemOf(filename),
        doc: {
            type: "doc",
            content: content.length > 0 ? content : [{ type: "paragraph" }],
        },
    };
}

async function persist(
    derived: DerivedChapter,
    target: ChapterImportTarget,
): Promise<ChapterImportResult> {
    const storage = getStorage();
    const content = JSON.stringify(derived.doc);

    if (target.kind === "new-book") {
        const book = await storage.books.create({
            title: derived.title,
            book_type: "prose",
        });
        const chapter = await storage.chapters.create(book.id, {
            title: derived.title,
            content,
            position: 0,
        });
        return {
            bookId: book.id,
            bookTitle: book.title,
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            createdBook: true,
        };
    }

    const existing = await storage.chapters.list(target.bookId);
    const chapter = await storage.chapters.create(target.bookId, {
        title: derived.title,
        content,
        position: existing.length,
    });
    const book = await storage.books.get(target.bookId);
    return {
        bookId: target.bookId,
        bookTitle: book.title,
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        createdBook: false,
    };
}

/** Import a `.md`/`.markdown` file. The first `# H1` becomes the title. */
export async function importMarkdownAsChapter(
    file: File,
    target: ChapterImportTarget,
): Promise<ChapterImportResult> {
    return persist(deriveFromMarkdown(await file.text(), file.name), target);
}

/** Import a `.txt` file. The filename (without extension) becomes the title. */
export async function importTextAsChapter(
    file: File,
    target: ChapterImportTarget,
): Promise<ChapterImportResult> {
    return persist(deriveFromText(await file.text(), file.name), target);
}

/** Import an `.html`/`.htm` file. `<title>` or the first `<h1>` becomes the title. */
export async function importHtmlAsChapter(
    file: File,
    target: ChapterImportTarget,
): Promise<ChapterImportResult> {
    return persist(deriveFromHtml(await file.text(), file.name), target);
}
