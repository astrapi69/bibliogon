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

/**
 * Escape a prose run for LaTeX, leaving inline/block math (`$...$`,
 * `$$...$$`) untouched — that content is already LaTeX and must compile
 * verbatim. The backslash is parked on a sentinel so the `{}` introduced by
 * the `\textbackslash{}` replacement is not itself escaped.
 */
export function escapeLatex(text: string): string {
  const parts = text.split(MATH_SPAN);
  return parts
    .map((part, index) => (index % 2 === 1 ? part : escapeLatexProse(part)))
    .join("");
}

function escapeLatexProse(text: string): string {
  return text
    .replace(/\\/g, BACKSLASH_SENTINEL)
    .replace(/([&%$#_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}")
    .replace(new RegExp(BACKSLASH_SENTINEL, "g"), "\\textbackslash{}");
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
      out = `\\href{${href}}{${out}}`;
    }
  }
  return out;
}

function inlineToLatex(nodes: TipTapNode[]): string {
  return nodes.map((node) => nodeToLatex(node, 0)).join("");
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
      return `\\${command}{${inlineToLatex(content)}}\n\n`;
    }
    case "bulletList":
      return `\\begin{itemize}\n${content.map((n) => nodeToLatex(n, depth, kind)).join("")}\\end{itemize}\n\n`;
    case "orderedList":
      return `\\begin{enumerate}\n${content.map((n) => nodeToLatex(n, depth, kind)).join("")}\\end{enumerate}\n\n`;
    case "listItem":
      return `  \\item ${content.map((n) => nodeToLatex(n, depth, kind)).join("").trim()}\n`;
    case "blockquote":
      return `\\begin{quote}\n${content.map((n) => nodeToLatex(n, depth, kind)).join("")}\\end{quote}\n\n`;
    case "codeBlock": {
      const code = content.map((n) => (n.text as string) || "").join("");
      return `\\begin{verbatim}\n${code}\n\\end{verbatim}\n\n`;
    }
    case "imageFigure":
    case "figure": {
      const src = (attrs?.src as string) || "";
      const caption = content.length ? inlineToLatex(content) : "";
      const captionLine = caption ? `\\caption{${caption}}\n` : "";
      return `\\begin{figure}[h]\n\\centering\n\\includegraphics[width=\\linewidth]{${src}}\n${captionLine}\\end{figure}\n\n`;
    }
    case "image": {
      const src = (attrs?.src as string) || "";
      return `\\includegraphics[width=\\linewidth]{${src}}\n\n`;
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

function bodyToLatex(doc: TipTapNode, kind: "book" | "article"): string {
  const content = (doc.content as TipTapNode[] | undefined) || [];
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
    .map((section) => {
      const heading = section.heading.trim()
        ? `\\${sectionCommand}{${escapeLatex(section.heading)}}\n\n`
        : "";
      return `${heading}${bodyToLatex(section.doc, kind)}`;
    })
    .join("\n")
    .trimEnd();

  return `${head}\n${body}\n\n\\end{document}\n`;
}
