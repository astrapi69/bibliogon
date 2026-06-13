/**
 * LaTeX (.tex) serializer for the client-side export engine.
 *
 * Walks the format-agnostic `ExportDocument` (the same shape every other
 * client format consumes) and emits a complete, compilable `.tex` source —
 * no Pandoc, no backend. Books become `\documentclass{book}` with one
 * `\chapter` per section; articles become `\documentclass{article}` with the
 * body at `\section` depth.
 *
 * Math is stored as plain `$...$` / `$$...$$` text in the TipTap document
 * (the KaTeX editor extension renders it as a decoration over that text), so
 * the serializer passes math spans through verbatim — they are already LaTeX
 * — and escapes only the surrounding prose.
 */

import type { ExportDocument, TipTapNode } from "./documentModel";

const PREAMBLE_PACKAGES = [
  "\\usepackage[utf8]{inputenc}",
  "\\usepackage[T1]{fontenc}",
  "\\usepackage{hyperref}",
  "\\usepackage{graphicx}",
  "\\usepackage[normalem]{ulem}",
  "\\usepackage{amsmath}",
].join("\n");

const MATH_SPAN = /(\$\$[\s\S]*?\$\$|\$[^$]*?\$)/g;
const BACKSLASH_SENTINEL = "\u0000";

const RULE_SENTINEL = String.fromCharCode(1);

/** Markdown heading-ID syntax (`{#chapter-1}`) that markdown-imported books
 *  carry inside heading text. It is an in-document anchor with no LaTeX
 *  meaning and must be stripped, not escaped. */
const MARKDOWN_ANCHOR = /\s*\{#[^}]*\}/g;

/** A run of 3+ em-dashes / horizontal bars - a scene break or horizontal rule
 *  pasted as Unicode. Rendered as a real LaTeX rule instead of leaking the
 *  raw characters into the output. */
const EM_DASH_RULE = /[\u2014\u2015]{3,}/g;
const RULE_LATEX = "\\bigskip\\noindent\\rule{\\textwidth}{0.4pt}\\bigskip";

/** Remove markdown heading-ID anchors (`{#...}`) from a string. Runs BEFORE
 *  escaping so the `{ # }` are dropped rather than turned into `\{\#...\}`
 *  artifacts. */
export function stripMarkdownAnchor(text: string): string {
  return text.replace(MARKDOWN_ANCHOR, "");
}

/** Normalize a heading for comparison (anchor-stripped, trimmed, lowercased). */
function normalizeHeading(text: string): string {
  return stripMarkdownAnchor(text).trim().toLowerCase();
}

/**
 * Escape a prose run for LaTeX, leaving inline/block math (`$...$`,
 * `$$...$$`) untouched — that content is already LaTeX and must compile
 * verbatim. The backslash is parked on a sentinel so the `{}` introduced by
 * the `\textbackslash{}` replacement is not itself escaped.
 */
export function escapeLatex(text: string): string {
  const parts = text.split(MATH_SPAN);
  return parts.map((part, index) => (index % 2 === 1 ? part : escapeLatexProse(part))).join("");
}

function escapeLatexProse(text: string): string {
  return text
    .replace(EM_DASH_RULE, RULE_SENTINEL)
    .replace(/\\/g, BACKSLASH_SENTINEL)
    .replace(/([&%$#_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}")
    .split(BACKSLASH_SENTINEL)
    .join("\\textbackslash{}")
    .split(RULE_SENTINEL)
    .join(RULE_LATEX);
}

function textNodeToLatex(node: TipTapNode): string {
  let out = escapeLatex((node.text as string) || "");
  const marks = node.marks as Record<string, unknown>[] | undefined;
  if (!marks) return out;
  for (const mark of marks) {
    const type = mark.type as string;
    if (type === "bold") out = `\\textbf{${out}}`;
    else if (type === "italic") out = `\\textit{${out}}`;
    else if (type === "strike") out = `\\sout{${out}}`;
    else if (type === "code") out = `\\texttt{${out}}`;
    else if (type === "underline") out = `\\underline{${out}}`;
    else if (type === "link") {
      const href = ((mark.attrs as Record<string, unknown>)?.href as string) || "";
      if (href && !href.startsWith("#")) out = `\\href{${href}}{${out}}`;
    }
  }
  return out;
}

function inlineToLatex(nodes: TipTapNode[]): string {
  return nodes.map((node) => nodeToLatex(node, 0)).join("");
}

/** Inline serializer for heading content: strips markdown heading-ID anchors
 *  (`{#...}`) from text nodes before escaping (Bug 1). Fragment-link marks are
 *  already reduced to plain text by `textNodeToLatex`. */
function headingInlineToLatex(nodes: TipTapNode[]): string {
  return nodes
    .map((node) =>
      node.type === "text"
        ? textNodeToLatex({
            ...node,
            text: stripMarkdownAnchor((node.text as string) || ""),
          })
        : nodeToLatex(node, 0),
    )
    .join("");
}

/** Concatenated plain text of an inline node list (marks/anchors ignored),
 *  used to compare a body heading against its section heading for dedup. */
function plainInlineText(nodes: TipTapNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === "text") return (node.text as string) || "";
      const childContent = node.content as TipTapNode[] | undefined;
      return childContent ? plainInlineText(childContent) : "";
    })
    .join("");
}

/** `images/<filename>` derived from a stored image `src` (which is an
 *  `/api/books/.../assets/file/<filename>` URL - meaningless to LaTeX). */
function imageFilename(src: string): string {
  const withoutFragment = src.split(/[?#]/)[0];
  return withoutFragment.split("/").pop() || "image";
}

/** `\includegraphics` against a relative `images/<filename>` path, wrapped in
 *  `\IfFileExists` so the document still compiles (showing an alt-text
 *  placeholder box) when the image file is not shipped alongside the `.tex`. */
function includeGraphicsWithFallback(src: string, alt: string): string {
  const filename = imageFilename(src);
  const path = `images/${filename}`;
  const placeholder = escapeLatex((alt || filename).trim());
  return (
    `\\IfFileExists{${path}}` +
    `{\\includegraphics[width=\\linewidth]{${path}}}` +
    `{\\fbox{\\parbox{0.8\\linewidth}{\\centering ${placeholder}}}}`
  );
}

/** Map an in-content heading level to a LaTeX sectioning command. Articles
 *  shift one level down (no `\chapter`). */
function headingCommand(level: number, kind: "book" | "article"): string {
  const bookLadder = ["chapter", "section", "subsection", "subsubsection"];
  const articleLadder = ["section", "subsection", "subsubsection", "paragraph"];
  const ladder = kind === "article" ? articleLadder : bookLadder;
  const clamped = Math.min(Math.max(level, 1), ladder.length);
  return ladder[clamped - 1];
}

function nodeToLatex(node: TipTapNode, depth: number, kind: "book" | "article" = "book"): string {
  if (!node) return "";
  const type = node.type as string;
  const content = (node.content as TipTapNode[] | undefined) || [];
  const attrs = node.attrs as Record<string, unknown> | undefined;

  switch (type) {
    case "doc":
      return content.map((n) => nodeToLatex(n, depth, kind)).join("");
    case "paragraph":
      return `${inlineToLatex(content)}\n\n`;
    case "heading": {
      const command = headingCommand((attrs?.level as number) || 1, kind);
      return `\\${command}{${headingInlineToLatex(content)}}\n\n`;
    }
    case "bulletList":
      return `\\begin{itemize}\n${content.map((n) => nodeToLatex(n, depth, kind)).join("")}\\end{itemize}\n\n`;
    case "orderedList":
      return `\\begin{enumerate}\n${content.map((n) => nodeToLatex(n, depth, kind)).join("")}\\end{enumerate}\n\n`;
    case "listItem":
      return `  \\item ${content
        .map((n) => nodeToLatex(n, depth, kind))
        .join("")
        .trim()}\n`;
    case "blockquote":
      return `\\begin{quote}\n${content.map((n) => nodeToLatex(n, depth, kind)).join("")}\\end{quote}\n\n`;
    case "codeBlock": {
      const code = content.map((n) => (n.text as string) || "").join("");
      return `\\begin{verbatim}\n${code}\n\\end{verbatim}\n\n`;
    }
    case "imageFigure":
    case "figure": {
      const src = (attrs?.src as string) || "";
      const alt = (attrs?.alt as string) || "";
      const caption = content.length ? inlineToLatex(content) : "";
      const captionLine = caption ? `\\caption{${caption}}\n` : "";
      return `\\begin{figure}[h]\n\\centering\n${includeGraphicsWithFallback(src, alt)}\n${captionLine}\\end{figure}\n\n`;
    }
    case "image": {
      const src = (attrs?.src as string) || "";
      const alt = (attrs?.alt as string) || "";
      return `${includeGraphicsWithFallback(src, alt)}\n\n`;
    }
    case "horizontalRule":
      return "\\hrule\n\n";
    case "hardBreak":
      return "\\\\\n";
    case "inlineMath":
      return `$${(attrs?.latex as string) || ""}$`;
    case "blockMath":
      return `$$${(attrs?.latex as string) || ""}$$\n\n`;
    case "text":
      return textNodeToLatex(node);
    default:
      return content.length ? inlineToLatex(content) : "";
  }
}

/** Set of localized "Table of Contents" chapter titles (the 8 i18n catalogs
 *  plus accented variants). A markdown-imported ToC chapter is a manual
 *  duplicate of the auto-generated `\tableofcontents` and is skipped. */
const TOC_HEADINGS = new Set([
  "table of contents",
  "inhaltsverzeichnis",
  "indice",
  "índice",
  "table des matieres",
  "table des matières",
  "πίνακας περιεχομένων",
  "sumario",
  "sumário",
  "icindekiler",
  "içindekiler",
  "目次",
]);

/** True when a chapter heading names a table-of-contents chapter (Bug 3). */
function isTableOfContentsHeading(heading: string): boolean {
  return TOC_HEADINGS.has(normalizeHeading(heading));
}

/**
 * Serialize a section body. When the body's first node is a heading that
 * repeats the section heading (markdown-imported books store the chapter title
 * both as the chapter title and as the body's first heading), that leading
 * heading is dropped so the chapter is not emitted twice (Bug 6).
 */
function bodyToLatex(doc: TipTapNode, kind: "book" | "article", sectionHeading = ""): string {
  let content = (doc.content as TipTapNode[] | undefined) || [];
  const first = content[0];
  if (
    sectionHeading.trim() &&
    first &&
    first.type === "heading" &&
    normalizeHeading(plainInlineText((first.content as TipTapNode[]) || [])) ===
      normalizeHeading(sectionHeading)
  ) {
    content = content.slice(1);
  }
  return content.map((node) => nodeToLatex(node, 0, kind)).join("");
}

/** Serialize an `ExportDocument` to a complete, compilable `.tex` source. */
export function toLatex(doc: ExportDocument): string {
  const kind = doc.kind === "article" ? "article" : "book";
  const documentClass = kind === "article" ? "article" : "book";
  const sectionCommand = kind === "article" ? "section" : "chapter";

  const titleLine = doc.subtitle
    ? `\\title{${escapeLatex(doc.title)} \\\\ \\large ${escapeLatex(doc.subtitle)}}`
    : `\\title{${escapeLatex(doc.title)}}`;
  const authorLine = `\\author{${escapeLatex(doc.author ?? "")}}`;

  const head = [
    `\\documentclass[12pt,a4paper]{${documentClass}}`,
    PREAMBLE_PACKAGES,
    "",
    titleLine,
    authorLine,
    "\\date{\\today}",
    "",
    "\\begin{document}",
    "\\maketitle",
    ...(kind === "book" ? ["\\tableofcontents"] : []),
    "",
  ].join("\n");

  const body = doc.sections
    .filter((section) => !isTableOfContentsHeading(section.heading))
    .map((section) => {
      const cleanHeading = stripMarkdownAnchor(section.heading);
      const heading = cleanHeading.trim()
        ? `\\${sectionCommand}{${escapeLatex(cleanHeading)}}\n\n`
        : "";
      return `${heading}${bodyToLatex(section.doc, kind, section.heading)}`;
    })
    .join("\n")
    .trimEnd();

  return `${head}\n${body}\n\n\\end{document}\n`;
}
