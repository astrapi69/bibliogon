/**
 * Pure TipTap command actions for the editor context menu
 * (EDITOR-CONTEXT-MENU-01). Kept separate from the Radix
 * ``EditorContextMenu`` component because the menu's rendered items are
 * happy-dom-brittle (Radix ContextMenu portal) - these functions carry
 * the real behaviour and are unit-tested directly with a mock editor;
 * the open-on-right-click + item-click is covered by the E2E smoke.
 */
import type { Editor } from "@tiptap/react";

export function selectAll(editor: Editor): void {
  editor.chain().focus().selectAll().run();
}

/** Copy/cut act on the live DOM selection (ProseMirror keeps it in
 * sync). ``execCommand`` is deprecated but still the only synchronous
 * copy/cut path; paste reads the async clipboard API. */
export function copySelection(): void {
  document.execCommand("copy");
}

export function cutSelection(): void {
  document.execCommand("cut");
}

export async function paste(editor: Editor): Promise<void> {
  try {
    const text = await navigator.clipboard.readText();
    if (text) editor.chain().focus().insertContent(text).run();
  } catch {
    // Clipboard read can be blocked by the browser; the native
    // Ctrl+V path still works. No-op here.
  }
}

export function toggleBold(editor: Editor): void {
  editor.chain().focus().toggleBold().run();
}

export function toggleItalic(editor: Editor): void {
  editor.chain().focus().toggleItalic().run();
}

export function toggleUnderline(editor: Editor): void {
  editor.chain().focus().toggleUnderline().run();
}

export function toggleStrike(editor: Editor): void {
  editor.chain().focus().toggleStrike().run();
}

export function toggleCode(editor: Editor): void {
  editor.chain().focus().toggleCode().run();
}

export function toggleSubscript(editor: Editor): void {
  editor.chain().focus().toggleSubscript().run();
}

export function toggleSuperscript(editor: Editor): void {
  editor.chain().focus().toggleSuperscript().run();
}

export function setHeading(editor: Editor, level: 1 | 2 | 3): void {
  editor.chain().focus().toggleHeading({ level }).run();
}

/** Clear block formatting back to a normal paragraph. */
export function setParagraph(editor: Editor): void {
  editor.chain().focus().setParagraph().run();
}

export function setTextAlign(
  editor: Editor,
  align: "left" | "center" | "right" | "justify",
): void {
  editor.chain().focus().setTextAlign(align).run();
}

export function toggleBulletList(editor: Editor): void {
  editor.chain().focus().toggleBulletList().run();
}

export function toggleOrderedList(editor: Editor): void {
  editor.chain().focus().toggleOrderedList().run();
}

export function toggleTaskList(editor: Editor): void {
  editor.chain().focus().toggleTaskList().run();
}

export function toggleBlockquote(editor: Editor): void {
  editor.chain().focus().toggleBlockquote().run();
}

export function toggleCodeBlock(editor: Editor): void {
  editor.chain().focus().toggleCodeBlock().run();
}

export function insertTable(editor: Editor): void {
  editor
    .chain()
    .focus()
    .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
    .run();
}

export function insertHorizontalRule(editor: Editor): void {
  editor.chain().focus().setHorizontalRule().run();
}

export function undo(editor: Editor): void {
  editor.chain().focus().undo().run();
}

export function redo(editor: Editor): void {
  editor.chain().focus().redo().run();
}

/** Set (or, on an empty URL, clear) a link on the current selection. */
export function setLink(editor: Editor, url: string): void {
  const trimmed = url.trim();
  const chain = editor.chain().focus().extendMarkRange("link");
  if (trimmed) chain.setLink({ href: trimmed }).run();
  else chain.unsetLink().run();
}

/** Insert an ``@`` to open the Story Bible mention autocomplete. */
export function insertMentionTrigger(editor: Editor): void {
  editor.chain().focus().insertContent("@").run();
}

/** Which formatting marks/nodes are active at the current selection.
 * Used by the context menu to highlight active items. ``isActive`` can
 * throw for nodes an extension didn't register, so each lookup is
 * guarded to keep the menu open even on a minimal surface. */
export interface ActiveFormats {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  code: boolean;
  subscript: boolean;
  superscript: boolean;
  link: boolean;
  heading1: boolean;
  heading2: boolean;
  heading3: boolean;
  paragraph: boolean;
  alignLeft: boolean;
  alignCenter: boolean;
  alignRight: boolean;
  alignJustify: boolean;
  bulletList: boolean;
  orderedList: boolean;
  taskList: boolean;
  blockquote: boolean;
  codeBlock: boolean;
}

export function activeFormats(editor: Editor): ActiveFormats {
  const is = (name: string, attrs?: Record<string, unknown>): boolean => {
    try {
      return attrs ? editor.isActive(name, attrs) : editor.isActive(name);
    } catch {
      return false;
    }
  };
  const alignActive = (value: string): boolean => {
    try {
      return editor.isActive({ textAlign: value });
    } catch {
      return false;
    }
  };
  return {
    bold: is("bold"),
    italic: is("italic"),
    underline: is("underline"),
    strike: is("strike"),
    code: is("code"),
    subscript: is("subscript"),
    superscript: is("superscript"),
    link: is("link"),
    heading1: is("heading", { level: 1 }),
    heading2: is("heading", { level: 2 }),
    heading3: is("heading", { level: 3 }),
    paragraph: is("paragraph"),
    alignLeft: alignActive("left"),
    alignCenter: alignActive("center"),
    alignRight: alignActive("right"),
    alignJustify: alignActive("justify"),
    bulletList: is("bulletList"),
    orderedList: is("orderedList"),
    taskList: is("taskList"),
    blockquote: is("blockquote"),
    codeBlock: is("codeBlock"),
  };
}

/** The currently selected text (empty string when nothing selected). */
export function selectedText(editor: Editor): string {
  const { from, to } = editor.state.selection;
  return editor.state.doc.textBetween(from, to, " ");
}

export function hasSelection(editor: Editor): boolean {
  return !editor.state.selection.empty;
}

/** Word counts for the selection + the whole document. */
export function wordCounts(editor: Editor): {
  selection: number;
  total: number;
} {
  const storageWords = editor.storage?.characterCount?.words;
  const total =
    typeof storageWords === "function"
      ? storageWords()
      : countWords(editor.getText());
  const sel = selectedText(editor).trim();
  return { selection: sel ? sel.split(/\s+/).length : 0, total };
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}
