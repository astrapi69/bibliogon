/**
 * Unit tests for the editor context-menu actions
 * (EDITOR-CONTEXT-MENU-01). These carry the real behaviour; the Radix
 * menu rendering is covered by the E2E smoke (ContextMenu portal is
 * happy-dom-brittle).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import * as actions from "../editorContextMenuActions";

/** A TipTap-editor stand-in whose ``chain()`` records the command names
 * called on it (each returns the chain; ``run`` ends). */
function makeEditor(
  opts: {
    empty?: boolean;
    selText?: string;
    total?: number;
    text?: string;
  } = {},
) {
  const calls: string[] = [];
  const chain: Record<string, (...a: unknown[]) => unknown> = new Proxy(
    {},
    {
      get(_t, prop) {
        return (...args: unknown[]) => {
          calls.push(
            String(prop) + (args.length ? `:${JSON.stringify(args[0])}` : ""),
          );
          return String(prop) === "run" ? undefined : chain;
        };
      },
    },
  );
  return {
    calls,
    editor: {
      chain: () => chain,
      state: {
        selection: {
          empty: opts.empty ?? true,
          from: 0,
          to: (opts.selText ?? "").length,
        },
        doc: { textBetween: () => opts.selText ?? "" },
      },
      storage: { characterCount: { words: () => opts.total ?? 0 } },
      getText: () => opts.text ?? "",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
}

describe("editorContextMenuActions", () => {
  it("toggleBold/italic/underline dispatch their commands", () => {
    const a = makeEditor();
    actions.toggleBold(a.editor);
    actions.toggleItalic(a.editor);
    actions.toggleUnderline(a.editor);
    expect(a.calls).toContain("toggleBold");
    expect(a.calls).toContain("toggleItalic");
    expect(a.calls).toContain("toggleUnderline");
  });

  it("strike/code/subscript/superscript dispatch their commands", () => {
    const a = makeEditor();
    actions.toggleStrike(a.editor);
    actions.toggleCode(a.editor);
    actions.toggleSubscript(a.editor);
    actions.toggleSuperscript(a.editor);
    expect(a.calls).toContain("toggleStrike");
    expect(a.calls).toContain("toggleCode");
    expect(a.calls).toContain("toggleSubscript");
    expect(a.calls).toContain("toggleSuperscript");
  });

  it("setHeading passes the level", () => {
    const a = makeEditor();
    actions.setHeading(a.editor, 2);
    expect(
      a.calls.some((c) => c.startsWith("toggleHeading") && c.includes("2")),
    ).toBe(true);
  });

  it("setParagraph + table + codeBlock + taskList dispatch", () => {
    const a = makeEditor();
    actions.setParagraph(a.editor);
    actions.insertTable(a.editor);
    actions.toggleCodeBlock(a.editor);
    actions.toggleTaskList(a.editor);
    expect(a.calls).toContain("setParagraph");
    expect(a.calls.some((c) => c.startsWith("insertTable"))).toBe(true);
    expect(a.calls).toContain("toggleCodeBlock");
    expect(a.calls).toContain("toggleTaskList");
  });

  it("setTextAlign passes the alignment", () => {
    const a = makeEditor();
    actions.setTextAlign(a.editor, "center");
    expect(
      a.calls.some(
        (c) => c.startsWith("setTextAlign") && c.includes("center"),
      ),
    ).toBe(true);
  });

  it("undo + redo dispatch their commands", () => {
    const a = makeEditor();
    actions.undo(a.editor);
    actions.redo(a.editor);
    expect(a.calls).toContain("undo");
    expect(a.calls).toContain("redo");
  });

  it("setLink with a URL extends the mark range and sets the link", () => {
    const a = makeEditor();
    actions.setLink(a.editor, "https://example.com");
    expect(a.calls.some((c) => c.startsWith("extendMarkRange"))).toBe(true);
    expect(
      a.calls.some(
        (c) => c.startsWith("setLink") && c.includes("example.com"),
      ),
    ).toBe(true);
  });

  it("setLink with an empty URL unsets the link", () => {
    const a = makeEditor();
    actions.setLink(a.editor, "   ");
    expect(a.calls).toContain("unsetLink");
    expect(a.calls.some((c) => c.startsWith("setLink"))).toBe(false);
  });

  it("list + blockquote + horizontal rule + mention commands dispatch", () => {
    const a = makeEditor();
    actions.toggleBulletList(a.editor);
    actions.toggleOrderedList(a.editor);
    actions.toggleBlockquote(a.editor);
    actions.insertHorizontalRule(a.editor);
    actions.insertMentionTrigger(a.editor);
    expect(a.calls).toContain("toggleBulletList");
    expect(a.calls).toContain("toggleOrderedList");
    expect(a.calls).toContain("toggleBlockquote");
    expect(a.calls).toContain("setHorizontalRule");
    expect(a.calls.some((c) => c.startsWith("insertContent"))).toBe(true);
  });

  it("selectAll dispatches selectAll", () => {
    const a = makeEditor();
    actions.selectAll(a.editor);
    expect(a.calls).toContain("selectAll");
  });

  it("hasSelection + selectedText reflect the editor selection", () => {
    const empty = makeEditor({ empty: true });
    expect(actions.hasSelection(empty.editor)).toBe(false);
    const sel = makeEditor({ empty: false, selText: "alpha beta" });
    expect(actions.hasSelection(sel.editor)).toBe(true);
    expect(actions.selectedText(sel.editor)).toBe("alpha beta");
  });

  it("wordCounts reports selection + total", () => {
    const a = makeEditor({ selText: "one two three", total: 42 });
    expect(actions.wordCounts(a.editor)).toEqual({ selection: 3, total: 42 });
  });

  it("activeFormats reflects editor.isActive (marks, heading, alignment)", () => {
    const editor = {
      isActive: (name: string | Record<string, unknown>, attrs?: unknown) => {
        if (typeof name === "object")
          return JSON.stringify(name) === JSON.stringify({ textAlign: "center" });
        if (name === "bold") return true;
        if (name === "heading")
          return JSON.stringify(attrs) === JSON.stringify({ level: 2 });
        return false;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const fmt = actions.activeFormats(editor);
    expect(fmt.bold).toBe(true);
    expect(fmt.italic).toBe(false);
    expect(fmt.heading2).toBe(true);
    expect(fmt.heading1).toBe(false);
    expect(fmt.alignCenter).toBe(true);
    expect(fmt.alignLeft).toBe(false);
  });

  it("activeFormats stays false when isActive throws", () => {
    const editor = {
      isActive: () => {
        throw new Error("unknown node");
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const fmt = actions.activeFormats(editor);
    expect(fmt.bold).toBe(false);
    expect(fmt.alignCenter).toBe(false);
  });

  describe("clipboard", () => {
    beforeEach(() => {
      document.execCommand = vi.fn();
    });
    it("copy + cut call execCommand", () => {
      actions.copySelection();
      actions.cutSelection();
      expect(document.execCommand).toHaveBeenCalledWith("copy");
      expect(document.execCommand).toHaveBeenCalledWith("cut");
    });
    it("paste inserts clipboard text into the editor", async () => {
      vi.stubGlobal("navigator", {
        clipboard: { readText: vi.fn().mockResolvedValue("pasted") },
      });
      const a = makeEditor();
      await actions.paste(a.editor);
      expect(
        a.calls.some(
          (c) => c.includes("insertContent") && c.includes("pasted"),
        ),
      ).toBe(true);
    });
  });
});
