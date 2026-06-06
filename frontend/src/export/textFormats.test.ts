/**
 * Client-side export — text formats + model mappers (Maximal-Offline P2).
 *
 * Covers the dep-light path (HTML walker, Markdown via turndown, plain text)
 * and the Book/Article -> ExportDocument mappers. The binary formats
 * (PDF/EPUB/DOCX) are covered in binaryFormats.test.ts.
 */

import { describe, it, expect } from "vitest";

import type { Article, BookDetail, Chapter } from "../api/client";
import {
  buildBookDocument,
  buildArticleDocument,
} from "./buildExportDocument";
import { parseTipTap, type ExportDocument } from "./documentModel";
import { toHtml, documentToBodyHtml } from "./formatHtml";
import { toMarkdown } from "./formatMarkdown";
import { toText } from "./formatText";
import { escapeHtml, nodeToHtml } from "./tiptapToHtml";

function para(text: string, marks?: Record<string, unknown>[]): Record<string, unknown> {
  return {
    type: "paragraph",
    content: [{ type: "text", text, ...(marks ? { marks } : {}) }],
  };
}

const DOC: ExportDocument = {
  title: "Mein Buch",
  subtitle: "Ein Test",
  author: "Asterios Raptis",
  language: "de",
  sections: [
    {
      heading: "Kapitel 1",
      doc: {
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Anfang" }] },
          para("Fett und kursiv.", undefined),
          para("Bold", [{ type: "bold" }]),
          {
            type: "bulletList",
            content: [
              { type: "listItem", content: [para("eins")] },
              { type: "listItem", content: [para("zwei")] },
            ],
          },
        ],
      },
    },
    {
      heading: "Kapitel 2",
      doc: { type: "doc", content: [para("Zweites Kapitel.")] },
    },
  ],
};

describe("tiptapToHtml", () => {
  it("escapes HTML-significant characters", () => {
    expect(escapeHtml(`a<b>&"c'`)).toBe("a&lt;b&gt;&amp;&quot;c&#39;");
  });

  it("renders marks + lists + headings", () => {
    const html = nodeToHtml(DOC.sections[0].doc);
    expect(html).toContain("<h2>Anfang</h2>");
    expect(html).toContain("<strong>Bold</strong>");
    expect(html).toContain("<ul><li><p>eins</p></li><li><p>zwei</p></li></ul>");
  });

  it("never drops text from an unknown node type", () => {
    const html = nodeToHtml({
      type: "doc",
      content: [{ type: "weirdCustom", content: [{ type: "text", text: "keep me" }] }],
    });
    expect(html).toContain("keep me");
  });
});

describe("toHtml", () => {
  it("produces a standalone document with title + sections", () => {
    const html = toHtml(DOC);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('<html lang="de">');
    expect(html).toContain("<title>Mein Buch</title>");
    expect(html).toContain("<h1>Mein Buch</h1>");
    expect(html).toContain("<h2>Kapitel 1</h2>");
    expect(html).toContain("<h2>Kapitel 2</h2>");
  });

  it("body HTML includes subtitle + author", () => {
    const body = documentToBodyHtml(DOC);
    expect(body).toContain("<em>Ein Test</em>");
    expect(body).toContain("Asterios Raptis");
  });
});

describe("toMarkdown (turndown)", () => {
  it("renders headings, emphasis and lists as Markdown", () => {
    const md = toMarkdown(DOC);
    expect(md).toContain("# Mein Buch");
    expect(md).toContain("## Kapitel 1");
    expect(md).toContain("**Bold**");
    expect(md).toMatch(/- +eins/);
  });
});

describe("toText", () => {
  it("strips formatting and underlines section headings", () => {
    const text = toText(DOC);
    expect(text).toContain("Mein Buch");
    expect(text).toContain("Kapitel 1\n=========");
    expect(text).not.toContain("**");
    expect(text).not.toContain("<");
  });
});

describe("buildBookDocument", () => {
  const book = {
    id: "b1",
    title: "Buch",
    subtitle: null,
    author: "A",
    language: "en",
    chapters: [],
  } as unknown as BookDetail;
  const chapters = [
    { id: "c2", title: "Zwei", position: 1, content: '{"type":"doc","content":[]}' },
    { id: "c1", title: "Eins", position: 0, content: '{"type":"doc","content":[]}' },
  ] as unknown as Chapter[];

  it("orders sections by chapter position", () => {
    const doc = buildBookDocument(book, chapters);
    expect(doc.sections.map((s) => s.heading)).toEqual(["Eins", "Zwei"]);
    expect(doc.author).toBe("A");
  });
});

describe("buildArticleDocument", () => {
  it("maps an article to a single body section", () => {
    const article = {
      id: "a1",
      title: "Artikel",
      subtitle: null,
      author: null,
      language: "de",
      content_json: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hi"}]}]}',
    } as unknown as Article;
    const doc = buildArticleDocument(article);
    expect(doc.sections).toHaveLength(1);
    expect(doc.sections[0].heading).toBe("");
    expect(toText(doc)).toContain("Hi");
  });
});

describe("parseTipTap", () => {
  it("returns an empty doc for malformed / empty input", () => {
    expect(parseTipTap("")).toEqual({ type: "doc", content: [] });
    expect(parseTipTap("not json")).toEqual({ type: "doc", content: [] });
    expect(parseTipTap(null)).toEqual({ type: "doc", content: [] });
  });

  it("passes through an already-parsed object", () => {
    const obj = { type: "doc", content: [] };
    expect(parseTipTap(obj)).toBe(obj);
  });
});
