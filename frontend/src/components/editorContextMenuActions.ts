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

export function setHeading(editor: Editor, level: 1 | 2 | 3): void {
  editor.chain().focus().toggleHeading({ level }).run();
}

export function toggleBulletList(editor: Editor): void {
  editor.chain().focus().toggleBulletList().run();
}

export function toggleOrderedList(editor: Editor): void {
  editor.chain().focus().toggleOrderedList().run();
}

export function toggleBlockquote(editor: Editor): void {
  editor.chain().focus().toggleBlockquote().run();
}

export function insertHorizontalRule(editor: Editor): void {
  editor.chain().focus().setHorizontalRule().run();
}

/** Insert an ``@`` to open the Story Bible mention autocomplete. */
export function insertMentionTrigger(editor: Editor): void {
  editor.chain().focus().insertContent("@").run();
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
