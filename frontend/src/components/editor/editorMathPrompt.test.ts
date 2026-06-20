/**
 * Unit tests for the shared math-prompt helper
 * (EDITOR-CONTEXT-MENU-ALL-TOOLBAR-01, #370). The same logic the Toolbar
 * formula button and the context-menu Insert > Formula item both run.
 */
import { describe, it, expect, vi } from "vitest";

import { promptAndInsertMath } from "./editorMathPrompt";

function makeEditor(opts: { active?: boolean; latex?: string } = {}) {
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
      isActive: () => opts.active ?? false,
      getAttributes: () => ({ latex: opts.latex ?? "" }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
}

const t = (_k: string, fallback?: string) => fallback ?? _k;

describe("promptAndInsertMath", () => {
  it("inserts a new inline math node from the prompted LaTeX", async () => {
    const a = makeEditor();
    const dialog = { prompt: vi.fn().mockResolvedValue("E=mc^2") };
    await promptAndInsertMath(a.editor, dialog, t, "inline");
    expect(
      a.calls.some(
        (c) => c.startsWith("insertInlineMath") && c.includes("E=mc^2"),
      ),
    ).toBe(true);
  });

  it("updates an existing block math node in place", async () => {
    const a = makeEditor({ active: true, latex: "a^2" });
    const dialog = { prompt: vi.fn().mockResolvedValue("a^2+b^2") };
    await promptAndInsertMath(a.editor, dialog, t, "block");
    expect(a.calls.some((c) => c.startsWith("updateBlockMath"))).toBe(true);
    expect(a.calls.some((c) => c.startsWith("insertBlockMath"))).toBe(false);
  });

  it("does nothing when the prompt is cancelled", async () => {
    const a = makeEditor();
    const dialog = { prompt: vi.fn().mockResolvedValue(null) };
    await promptAndInsertMath(a.editor, dialog, t, "inline");
    expect(a.calls.length).toBe(0);
  });

  it("does nothing when the prompted LaTeX is blank", async () => {
    const a = makeEditor();
    const dialog = { prompt: vi.fn().mockResolvedValue("   ") };
    await promptAndInsertMath(a.editor, dialog, t, "inline");
    expect(a.calls.length).toBe(0);
  });
});
