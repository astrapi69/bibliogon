/**
 * Low-level TipTap editor interactions shared across the editor specs.
 *
 * TipTap relies on browser contentEditable APIs that Vitest/JSDOM cannot
 * exercise, so these helpers run only in a real browser. `.ProseMirror`
 * and `.tiptap-editor` are upstream TipTap/ProseMirror class contracts
 * (not Bibliogon-authored CSS), so they are as stable as a testid — the
 * same exception the existing `editor-formatting.spec.ts` relies on.
 */

import {expect, type Page} from "@playwright/test";

/** Wait for the TipTap editor surface to mount. */
export async function waitForEditor(page: Page): Promise<void> {
    await expect(page.locator(".tiptap-editor")).toBeVisible({timeout: 8_000});
}

/** Click into the ProseMirror content area so it has focus. */
export async function focusEditor(page: Page): Promise<void> {
    await page.locator(".ProseMirror").click();
}

/** Select all text in the editor. */
export async function selectAll(page: Page): Promise<void> {
    await page.keyboard.press("Control+a");
}

/**
 * Type text and wait for the autosave indicator to settle.
 * Autosave is debounced (~800ms); the "Gespeichert"/"Saved" indicator
 * confirms the PATCH landed. Text match (not testid) because the
 * indicator carries no testid; both catalog variants are accepted.
 */
export async function typeAndWaitForSave(page: Page, text: string): Promise<void> {
    await page.keyboard.type(text);
    await expect(page.getByText(/Gespeichert|Saved/)).toBeVisible({timeout: 8_000});
}

/** Read the current ProseMirror text content. */
export async function readEditorText(page: Page): Promise<string> {
    return page.locator(".ProseMirror").innerText();
}
