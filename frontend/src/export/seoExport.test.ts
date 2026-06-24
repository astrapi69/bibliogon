/** SEO metadata across the client-side export formats (#605). */
import { describe, it, expect } from "vitest";

import type { Article, BookDetail, Chapter } from "../api/client";
import { buildArticleDocument, buildBookDocument } from "./buildExportDocument";
import { toHtml } from "./formatHtml";
import { toMarkdown } from "./formatMarkdown";
import { toLatex } from "./formatLatex";
import type { ExportDocument } from "./documentModel";

const CHAPTER = {
    id: "c1",
    title: "Kapitel 1",
    position: 0,
    content: JSON.stringify({ type: "doc", content: [] }),
} as unknown as Chapter;

const BOOK = {
    title: "Die Souveränität des Musters",
    subtitle: "Ein Essay",
    author: "Asterios Raptis",
    language: "de",
    description: "Ein Buch über Muster und Souveränität.",
    genre: "Sachbuch",
    keywords: ["Muster", "Design"],
    categories: ["Philosophie"],
    isbn_ebook: "9781234567897",
    isbn_paperback: "",
    isbn_hardcover: "",
    publish_date: "2025",
    publisher: "Conscious Path Publishing",
} as unknown as BookDetail;

const ARTICLE = {
    title: "Wie ich schreibe",
    author: "Asterios Raptis",
    language: "de",
    seo_description: "Mein Schreibprozess.",
    excerpt: "Kurzfassung",
    topic: "Schreiben",
    tags: ["Handwerk", "Routine"],
    content_json: JSON.stringify({ type: "doc", content: [] }),
} as unknown as Article;

describe("buildExportDocument SEO mapping", () => {
    it("buildBookDocument carries description / keywords / isbn / date / publisher", () => {
        const doc = buildBookDocument(BOOK, [CHAPTER]);
        expect(doc.description).toBe("Ein Buch über Muster und Souveränität.");
        expect(doc.keywords).toEqual(["Muster", "Design", "Philosophie"]);
        expect(doc.isbn).toBe("9781234567897");
        expect(doc.publishDate).toBe("2025");
        expect(doc.publisher).toBe("Conscious Path Publishing");
        expect(doc.genre).toBe("Sachbuch");
    });

    it("buildArticleDocument carries description (seo) / tags / topic", () => {
        const doc = buildArticleDocument(ARTICLE);
        expect(doc.description).toBe("Mein Schreibprozess.");
        expect(doc.keywords).toEqual(["Handwerk", "Routine"]);
        expect(doc.genre).toBe("Schreiben");
        expect(doc.kind).toBe("article");
    });
});

describe("toHtml SEO head", () => {
    const html = toHtml(buildBookDocument(BOOK, [CHAPTER]));

    it("emits description / author / keywords + Open Graph + book:* tags", () => {
        expect(html).toContain('<meta name="description" content="Ein Buch über Muster und Souveränität." />');
        expect(html).toContain('<meta name="author" content="Asterios Raptis" />');
        expect(html).toContain('<meta property="og:title" content="Die Souveränität des Musters" />');
        expect(html).toContain('<meta property="og:type" content="book" />');
        expect(html).toContain('<meta property="book:isbn" content="9781234567897" />');
        expect(html).toContain('<meta property="book:release_date" content="2025" />');
        expect(html).toContain("Die Souveränität des Musters - von Asterios Raptis");
    });

    it("emits a valid schema.org Book JSON-LD block", () => {
        const m = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
        expect(m).not.toBeNull();
        const ld = JSON.parse(m![1].replace(/\\u003c/g, "<"));
        expect(ld["@context"]).toBe("https://schema.org");
        expect(ld["@type"]).toBe("Book");
        expect(ld.name).toBe("Die Souveränität des Musters");
        expect(ld.author).toEqual({ "@type": "Person", name: "Asterios Raptis" });
        expect(ld.isbn).toBe("9781234567897");
        expect(ld.inLanguage).toBe("de");
    });

    it("uses og:type=article + Article JSON-LD for articles", () => {
        const aHtml = toHtml(buildArticleDocument(ARTICLE));
        expect(aHtml).toContain('<meta property="og:type" content="article" />');
        const m = aHtml.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
        const ld = JSON.parse(m![1].replace(/\\u003c/g, "<"));
        expect(ld["@type"]).toBe("Article");
    });
});

describe("toMarkdown front-matter", () => {
    it("prepends YAML front-matter with title / author / categories / generator", () => {
        const md = toMarkdown(buildBookDocument(BOOK, [CHAPTER]));
        expect(md.startsWith("---\n")).toBe(true);
        expect(md).toContain('title: "Die Souveränität des Musters"');
        expect(md).toContain('author: "Asterios Raptis"');
        expect(md).toContain('isbn: "9781234567897"');
        expect(md).toContain("categories:");
        expect(md).toContain('  - "Philosophie"');
        expect(md).toContain('generator: "Bibliogon"');
    });
});

describe("toLatex hypersetup", () => {
    it("emits \\hypersetup with pdftitle / pdfauthor / pdfkeywords", () => {
        const tex = toLatex(buildBookDocument(BOOK, [CHAPTER]));
        expect(tex).toContain("\\hypersetup{");
        expect(tex).toContain("pdftitle={Die Souveränität des Musters}");
        expect(tex).toContain("pdfauthor={Asterios Raptis}");
        expect(tex).toContain("pdfcreator={Bibliogon}");
    });
});

describe("missing-metadata safety", () => {
    it("a bare document emits no empty SEO tags + still has valid JSON-LD", () => {
        const bare: ExportDocument = { title: "Nur Titel", kind: "book", sections: [] };
        const html = toHtml(bare);
        expect(html).not.toContain('content="" ');
        const m = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
        const ld = JSON.parse(m![1].replace(/\\u003c/g, "<"));
        expect(ld.name).toBe("Nur Titel");
    });
});
