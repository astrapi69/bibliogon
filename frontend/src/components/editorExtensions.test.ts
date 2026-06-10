/**
 * Editor-construction + v2-JSON-compatibility regression test.
 *
 * The page-level editor tests mock `../components/Editor`, so a crash while
 * BUILDING the real extension set went undetected and only surfaced in the
 * browser. This builds a headless `Editor` with (almost) the full extension
 * set the app uses and round-trips a representative v2-era document, pinning
 * two things the TipTap v3 migration must keep true:
 *
 *  1. the editor constructs with every extension (no init-time throw), and
 *  2. existing v2 TipTap JSON loads + serializes back without losing nodes.
 *
 * NOTE: `@pentestpad/tiptap-extension-figure` is intentionally excluded.
 * Its CJS build crashes under Vitest's CJS module interop (a bare default-
 * import of @tiptap/extension-image resolves to the namespace, not the
 * extension). The BROWSER path is ESM, where that default import resolves
 * correctly (`default.extend` is a function), so the figure node is verified
 * by Aster's browser pass rather than here. `imageFigure` is therefore not
 * part of the round-trip doc below.
 */

import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import Highlight from "@tiptap/extension-highlight";
import Typography from "@tiptap/extension-typography";
import CharacterCount from "@tiptap/extension-character-count";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import { Footnotes, FootnoteReference, Footnote } from "tiptap-footnotes";

import { InlineMathDollar, BlockMathDollar } from "../extensions/math";
import { SearchAndReplace } from "../extensions/searchAndReplace";

function buildEditor(content?: unknown): Editor {
  return new Editor({
    extensions: [
      StarterKit.configure({ link: false, underline: false }),
      Link,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Underline,
      Subscript,
      Superscript,
      Highlight.configure({ multicolor: true }),
      Typography,
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      TaskList,
      TaskItem.configure({ nested: true }),
      CharacterCount,
      TextStyle,
      Color,
      Footnotes,
      FootnoteReference,
      Footnote,
      InlineMathDollar.configure({ katexOptions: { throwOnError: false } }),
      BlockMathDollar.configure({ katexOptions: { throwOnError: false } }),
      SearchAndReplace.configure({ disableRegex: true }),
    ],
    ...(content ? { content } : {}),
  });
}

const V2_DOC = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 2, textAlign: "left" },
      content: [{ type: "text", text: "Kapitel" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", marks: [{ type: "bold" }], text: "Fett" },
        { type: "text", text: " und " },
        { type: "text", marks: [{ type: "italic" }], text: "kursiv" },
        { type: "text", text: " und " },
        {
          type: "text",
          marks: [{ type: "link", attrs: { href: "https://x.test" } }],
          text: "Link",
        },
      ],
    },
    {
      type: "bulletList",
      content: [
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "eins" }] }] },
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "zwei" }] }] },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          marks: [{ type: "textStyle", attrs: { color: "#ff0000" } }],
          text: "rot",
        },
      ],
    },
  ],
};

describe("editor extension set (TipTap v3)", () => {
  it("constructs the full editor without an init-time throw", () => {
    const editor = buildEditor();
    expect(editor.schema.nodes.inlineMath).toBeTruthy();
    expect(editor.schema.nodes.blockMath).toBeTruthy();
    expect(editor.schema.marks.textStyle).toBeTruthy();
    editor.destroy();
  });

  it("loads a v2-era document and round-trips its nodes", () => {
    const editor = buildEditor(V2_DOC);
    expect(editor.getText()).toContain("Kapitel");
    expect(editor.getText()).toContain("Fett");
    expect(editor.getText()).toContain("eins");
    const out = JSON.stringify(editor.getJSON());
    expect(out).toContain("bulletList");
    expect(out).toContain("textStyle");
    editor.destroy();
  });
});
