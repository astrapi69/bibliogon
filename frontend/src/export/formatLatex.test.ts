import { describe, it, expect } from "vitest";

import type { ExportDocument } from "./documentModel";
import { escapeLatex, toLatex } from "./formatLatex";

function para(
  text: string,
  marks?: Record<string, unknown>[],
): Record<string, unknown> {
  return {
    type: "paragraph",
    content: [{ type: "text", text, ...(marks ? { marks } : {}) }],
  };
}

const BOOK: ExportDocument = {
  title: "Mein Buch",
  subtitle: "Ein Test",
  author: "Asterios Raptis",
  language: "de",
  kind: "book",
  sections: [
    {
      heading: "Kapitel 1",
      doc: {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "Anfang" }],
          },
          para("Fett", [{ type: "bold" }]),
          para("Kursiv", [{ type: "italic" }]),
          {
            type: "bulletList",
            content: [
              { type: "listItem", content: [para("eins")] },
              { type: "listItem", content: [para("zwei")] },
            ],
          },
          para("Energie: $E = mc^2$ heute."),
          para("$$\\int_0^1 f(x)\\,dx$$"),
        ],
      },
    },
    { heading: "Kapitel 2", doc: { type: "doc", content: [para("Ende.")] } },
  ],
};

const ARTICLE: ExportDocument = {
  title: "Mein Artikel",
  author: "Aster",
  kind: "article",
  sections: [
    {
      heading: "",
      doc: {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 1 },
            content: [{ type: "text", text: "Abschnitt" }],
          },
          para("Inhalt."),
        ],
      },
    },
  ],
};

describe("escapeLatex", () => {
  it("escapes LaTeX-significant prose characters", () => {
    expect(escapeLatex("100% & #1_value {x}")).toBe(
      "100\\% \\& \\#1\\_value \\{x\\}",
    );
  });

  it("escapes a lone backslash without re-escaping its braces", () => {
    expect(escapeLatex("a\\b")).toBe("a\\textbackslash{}b");
  });

  it("passes inline math through verbatim", () => {
    expect(escapeLatex("x = $a_1^2$ end")).toBe("x = $a_1^2$ end");
  });

  it("passes block math through verbatim", () => {
    expect(escapeLatex("$$\\int_0^1 x\\,dx$$")).toBe("$$\\int_0^1 x\\,dx$$");
  });
});

describe("toLatex (book)", () => {
  const tex = toLatex(BOOK);

  it("wraps in book documentclass + preamble + document env", () => {
    expect(tex).toContain("\\documentclass[12pt,a4paper]{book}");
    expect(tex).toContain("\\usepackage{amsmath}");
    expect(tex).toContain("\\begin{document}");
    expect(tex).toContain("\\maketitle");
    expect(tex).toContain("\\tableofcontents");
    expect(tex.trimEnd().endsWith("\\end{document}")).toBe(true);
  });

  it("renders title (with subtitle) + author", () => {
    expect(tex).toContain("\\title{Mein Buch \\\\ \\large Ein Test}");
    expect(tex).toContain("\\author{Asterios Raptis}");
  });

  it("renders each chapter heading as \\chapter and in-body h2 as \\section", () => {
    expect(tex).toContain("\\chapter{Kapitel 1}");
    expect(tex).toContain("\\chapter{Kapitel 2}");
    expect(tex).toContain("\\section{Anfang}");
  });

  it("renders marks + lists", () => {
    expect(tex).toContain("\\textbf{Fett}");
    expect(tex).toContain("\\textit{Kursiv}");
    expect(tex).toContain("\\begin{itemize}");
    expect(tex).toContain("\\item eins");
  });

  it("passes inline + block math through verbatim", () => {
    expect(tex).toContain("Energie: $E = mc^2$ heute.");
    expect(tex).toContain("$$\\int_0^1 f(x)\\,dx$$");
  });
});

describe("toLatex (article)", () => {
  const tex = toLatex(ARTICLE);

  it("uses the article documentclass and no \\tableofcontents", () => {
    expect(tex).toContain("\\documentclass[12pt,a4paper]{article}");
    expect(tex).not.toContain("\\tableofcontents");
  });

  it("shifts an in-body h1 down to \\section (no \\chapter in article)", () => {
    expect(tex).toContain("\\section{Abschnitt}");
    expect(tex).not.toContain("\\chapter{");
  });
});
