/**
 * Shared LaTeX-prompt helper for inserting/editing KaTeX math nodes
 * (EDITOR-CONTEXT-MENU-ALL-TOOLBAR-01). Used by both the editor Toolbar
 * and the right-click context menu so the prompt + insert/update logic
 * lives in one place (DRY).
 *
 * Math nodes are atoms (no inline typing): inserting one needs the LaTeX
 * up front, and the v3 insert*Math commands are a no-op on empty latex.
 * When a math node of the same kind is already selected, the prompt is
 * pre-filled and the node is updated in place; otherwise a new node is
 * inserted. KaTeX re-renders live from the node's latex attribute.
 */
import type { Editor } from "@tiptap/react";

type TranslateFn = (key: string, fallback?: string) => string;

interface DialogPrompt {
  prompt: (
    title: string,
    message: string,
    placeholder?: string,
    defaultValue?: string,
  ) => Promise<string | null>;
}

export async function promptAndInsertMath(
  editor: Editor,
  dialog: DialogPrompt,
  t: TranslateFn,
  kind: "inline" | "block",
): Promise<void> {
  const nodeName = kind === "inline" ? "inlineMath" : "blockMath";
  const isActive = editor.isActive(nodeName);
  const current = isActive
    ? ((editor.getAttributes(nodeName).latex as string | undefined) ?? "")
    : "";
  const latex = await dialog.prompt(
    kind === "inline"
      ? t("ui.toolbar.formula", "Formel")
      : t("ui.toolbar.formula_block", "Block-Formel"),
    t("ui.toolbar.formula_prompt", "LaTeX-Formel eingeben:"),
    "E=mc^2",
    current,
  );
  if (latex === null) return;
  const trimmed = latex.trim();
  if (!trimmed) return;
  const chain = editor.chain().focus();
  if (kind === "inline") {
    if (isActive) chain.updateInlineMath({ latex: trimmed }).run();
    else chain.insertInlineMath({ latex: trimmed }).run();
  } else {
    if (isActive) chain.updateBlockMath({ latex: trimmed }).run();
    else chain.insertBlockMath({ latex: trimmed }).run();
  }
}
