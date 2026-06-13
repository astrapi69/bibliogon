import { describe, it, expect } from "vitest";

import type { ExportDocument } from "./documentModel";
import { escapeLatex, stripMarkdownAnchor, toLatex } from "./formatLatex";

function para(text: string, marks?: Record<string, unknown>[]): Record<string, unknown> {
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
    expect(escapeLatex("100% & #1_value {x}")).toBe("100\\% \\& \\#1\\_value \\{x\\}");
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

describe("toLatex (v3 math nodes)", () => {
  it("serializes inlineMath + blockMath nodes to $...$ / $$...$$", () => {
    const doc: ExportDocument = {
      title: "Math",
      kind: "article",
      sections: [
        {
          heading: "",
          doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  { type: "text", text: "Energy " },
                  { type: "inlineMath", attrs: { latex: "E = mc^2" } },
                  { type: "text", text: " indeed." },
                ],
              },
              { type: "blockMath", attrs: { latex: "\\int_0^1 f(x)\\,dx" } },
            ],
          },
        },
      ],
    };
    const tex = toLatex(doc);
    expect(tex).toContain("Energy $E = mc^2$ indeed.");
    expect(tex).toContain("$$\\int_0^1 f(x)\\,dx$$");
  });
});

function heading(level: number, text: string): Record<string, unknown> {
  return {
    type: "heading",
    attrs: { level },
    content: [{ type: "text", text }],
  };
}

describe("markdown-import artifacts (issue #93)", () => {
  it("Bug 1: strips markdown heading-ID anchors from chapter titles", () => {
    const tex = toLatex({
      title: "T",
      kind: "book",
      sections: [
        {
          heading: "Chapter 1: The Invasion {#chapter-1}",
          doc: { type: "doc", content: [para("Body.")] },
        },
      ],
    });
    expect(tex).toContain("\\chapter{Chapter 1: The Invasion}");
    expect(tex).not.toContain("\\{\\#");
    expect(tex).not.toContain("chapter-1");
  });

  it("Bug 1: strips anchors from in-body headings too", () => {
    const tex = toLatex({
      title: "T",
      kind: "book",
      sections: [
        {
          heading: "Ch",
          doc: {
            type: "doc",
            content: [heading(2, "A Section {#a-section}"), para("x")],
          },
        },
      ],
    });
    expect(tex).toContain("\\section{A Section}");
    expect(tex).not.toContain("a-section");
  });

  it("Bug 2: rewrites /api asset URLs to relative images/ paths", () => {
    const tex = toLatex({
      title: "T",
      kind: "book",
      sections: [
        {
          heading: "Ch",
          doc: {
            type: "doc",
            content: [
              {
                type: "imageFigure",
                attrs: {
                  src: "/api/books/1d11cd16/assets/file/chapter_02_entdeckung.jpg",
                  alt: "Alien cocoon",
                },
                content: [{ type: "text", text: "Alien cocoon" }],
              },
            ],
          },
        },
      ],
    });
    expect(tex).toContain("images/chapter_02_entdeckung.jpg");
    expect(tex).toContain("\\IfFileExists{images/chapter_02_entdeckung.jpg}");
    expect(tex).not.toContain("/api/");
  });

  it("Bug 3: skips a manual Table-of-Contents chapter", () => {
    const tex = toLatex({
      title: "T",
      kind: "book",
      sections: [
        {
          heading: "Table of Contents",
          doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Prologue",
                    marks: [{ type: "link", attrs: { href: "#prolog" } }],
                  },
                ],
              },
            ],
          },
        },
        { heading: "Inhaltsverzeichnis", doc: { type: "doc", content: [] } },
        { heading: "Real Chapter", doc: { type: "doc", content: [para("x")] } },
      ],
    });
    expect(tex).not.toContain("\\chapter{Table of Contents}");
    expect(tex).not.toContain("\\chapter{Inhaltsverzeichnis}");
    expect(tex).toContain("\\chapter{Real Chapter}");
    // \tableofcontents (auto-generated) stays; the manual one is gone.
    expect(tex.match(/\\tableofcontents/g)?.length).toBe(1);
  });

  it("Bug 4: drops \\href wrappers for #-fragment links, keeps real URLs", () => {
    const tex = toLatex({
      title: "T",
      kind: "article",
      sections: [
        {
          heading: "",
          doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Jump",
                    marks: [{ type: "link", attrs: { href: "#chapter-1" } }],
                  },
                  { type: "text", text: " and " },
                  {
                    type: "text",
                    text: "site",
                    marks: [
                      {
                        type: "link",
                        attrs: { href: "https://example.com" },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      ],
    });
    expect(tex).not.toContain("\\href{#chapter-1}");
    expect(tex).toContain("Jump");
    expect(tex).toContain("\\href{https://example.com}{site}");
  });

  it("Bug 5: converts long em-dash runs to a rule, leaks no em-dash chars", () => {
    const emDashRun = "\u2014".repeat(24);
    const tex = toLatex({
      title: "T",
      kind: "book",
      sections: [
        {
          heading: "Ch",
          doc: { type: "doc", content: [para(emDashRun)] },
        },
      ],
    });
    expect(tex).toContain("\\rule{\\textwidth}{0.4pt}");
    expect(tex).not.toContain("\u2014\u2014\u2014");
  });

  it("Bug 6: deduplicates a leading body heading that repeats the chapter title", () => {
    const title = "Chapter 2: The Truth About Miriam";
    const tex = toLatex({
      title: "T",
      kind: "book",
      sections: [
        {
          heading: title,
          doc: {
            type: "doc",
            content: [heading(1, `${title} {#chapter-2}`), para("Body.")],
          },
        },
      ],
    });
    expect(tex.match(/\\chapter\{Chapter 2: The Truth About Miriam\}/g)?.length).toBe(1);
    expect(tex).toContain("Body.");
  });
});

describe("stripMarkdownAnchor", () => {
  it("removes a trailing anchor with its leading whitespace", () => {
    expect(stripMarkdownAnchor("About the Author {#-ueber-den-autor}")).toBe("About the Author");
  });

  it("is a no-op for plain text", () => {
    expect(stripMarkdownAnchor("Plain Title")).toBe("Plain Title");
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
