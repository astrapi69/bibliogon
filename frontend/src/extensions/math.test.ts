/**
 * Regression test for the math typing convention (``$...$`` inline,
 * ``$$...$$`` block).
 *
 * The bundled v3 ``@tiptap/extension-mathematics`` input rules use ``$$``
 * for inline and ``$$$`` for block, so typing ``$E=mc^2$`` stayed plain
 * text in the editor. ``InlineMathDollar`` / ``BlockMathDollar`` override
 * ``addInputRules`` to the single-/double-dollar variants. These tests fire
 * the REAL ProseMirror input rule (via the inputRules plugin's
 * ``handleTextInput``) and assert the resulting node — they fail against the
 * upstream double-dollar rule.
 */

import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

import {
  InlineMathDollar,
  BlockMathDollar,
  INLINE_MATH_INPUT_RULE,
  BLOCK_MATH_INPUT_RULE,
} from "./math";

function buildEditor(): Editor {
  return new Editor({
    extensions: [
      StarterKit,
      InlineMathDollar.configure({ katexOptions: { throwOnError: false } }),
      BlockMathDollar.configure({ katexOptions: { throwOnError: false } }),
    ],
    content: "<p></p>",
  });
}

/** Insert ``body`` as plain text, then simulate typing ``trigger`` so the
 *  inputRules plugin's handleTextInput fires (input rules only run on real
 *  text input, not on insertContent). */
function typeWithTrigger(editor: Editor, body: string, trigger: string): void {
  editor.commands.insertContent(body);
  const { from } = editor.state.selection;
  editor.view.someProp("handleTextInput", (handler) =>
    handler(editor.view, from, from, trigger, () =>
      editor.state.tr.insertText(trigger, from, from),
    ),
  );
}

function nodeTypes(editor: Editor): string[] {
  const types: string[] = [];
  editor.state.doc.descendants((node) => {
    types.push(node.type.name);
  });
  return types;
}

describe("math input-rule regexes", () => {
  it("inline rule matches $...$ and captures the latex", () => {
    const m = "$E=mc^2$".match(INLINE_MATH_INPUT_RULE);
    expect(m?.[1]).toBe("E=mc^2");
  });

  it("inline rule does NOT match a $$...$$ block", () => {
    expect("$$x$$".match(INLINE_MATH_INPUT_RULE)).toBeNull();
  });

  it("block rule matches a whole $$...$$ textblock", () => {
    const m = "$$\\int_0^1 f$$".match(BLOCK_MATH_INPUT_RULE);
    expect(m?.[1]).toBe("\\int_0^1 f");
  });

  it("block rule does NOT match a single-dollar inline expression", () => {
    expect("$x$".match(BLOCK_MATH_INPUT_RULE)).toBeNull();
  });
});

describe("math input rules in a live editor", () => {
  it("typing $E=mc^2$ creates an inlineMath node", () => {
    const editor = buildEditor();
    typeWithTrigger(editor, "$E=mc^2", "$");
    const json = editor.getJSON();
    const inline = JSON.stringify(json);
    expect(nodeTypes(editor)).toContain("inlineMath");
    expect(inline).toContain("E=mc^2");
    editor.destroy();
  });

  it("typing $$x+1$$ creates a blockMath node (not inlineMath)", () => {
    const editor = buildEditor();
    typeWithTrigger(editor, "$$x+1$", "$");
    const types = nodeTypes(editor);
    expect(types).toContain("blockMath");
    expect(types).not.toContain("inlineMath");
    editor.destroy();
  });
});
