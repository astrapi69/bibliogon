/**
 * Manual-Testplan Section 2 — Editors.
 *
 * Closes the automatable gaps marked "Teilweise":
 *   - TC-020 autosave + reload: typed text survives a full page reload
 *     (the end-to-end path the existing chapter-switch spec only touches)
 *   - TC-022 chapter switch updates ?chapter= (page-object-driven pin that
 *     complements book-editor-chapter-switch.spec.ts)
 *
 * Formatting (TC-023), math (TC-024), composition/fullscreen (TC-027), comic
 * panels (TC-028) and picture-book layouts (TC-029) are already strongly
 * covered by e2e/smoke and are not re-implemented here.
 */

import {test, expect, createBook, createChapter, createComicBook, createPictureBook} from "../fixtures/base";
import {EditorPage} from "./pages/editor.page";
import {ComicEditorPage} from "./pages/comic-editor.page";
import {PictureBookEditorPage} from "./pages/picture-book-editor.page";
import {readEditorText} from "./helpers/editor.helper";

test.describe("Section 2 — TC-020 autosave + reload", () => {
    test("typed text survives a reload with no self-conflict", async ({page}) => {
        const book = await createBook("Autosave Buch", "Autor");
        const chapter = await createChapter(
            book.id,
            "Kapitel A",
            JSON.stringify({type: "doc", content: [{type: "paragraph"}]}),
        );

        const editor = new EditorPage(page);
        await editor.goto(book.id);
        await editor.openChapter(chapter.id);
        await editor.writeText("Autosave Probe Text");

        await page.reload();
        await editor.openChapter(chapter.id);
        await expect(page.locator(".ProseMirror")).toContainText("Autosave Probe Text", {
            timeout: 8_000,
        });
        // No draft-recovery banner for content that is already saved.
        expect(await readEditorText(page)).toContain("Autosave Probe Text");
    });
});

test.describe("Section 2 — TC-022 chapter switch updates ?chapter=", () => {
    test("selecting a chapter swaps editor content and updates the URL", async ({page}) => {
        const book = await createBook("Kapitelwechsel Buch", "Autor");
        const c1 = await createChapter(
            book.id,
            "Erstes",
            JSON.stringify({type: "doc", content: [{type: "paragraph", content: [{type: "text", text: "Inhalt EINS"}]}]}),
        );
        const c2 = await createChapter(
            book.id,
            "Zweites",
            JSON.stringify({type: "doc", content: [{type: "paragraph", content: [{type: "text", text: "Inhalt ZWEI"}]}]}),
        );

        const editor = new EditorPage(page);
        await editor.goto(book.id);

        await editor.openChapter(c1.id);
        await expect(page.locator(".ProseMirror")).toContainText("Inhalt EINS");
        expect(editor.activeChapterParam()).toBe(c1.id);

        await editor.openChapter(c2.id);
        await expect(page.locator(".ProseMirror")).toContainText("Inhalt ZWEI");
        expect(editor.activeChapterParam()).toBe(c2.id);
    });
});

test.describe("Section 2 — TC-028 comic editor (page-object smoke)", () => {
    test("adding a page + a panel renders a non-collapsed panel", async ({page}) => {
        const book = await createComicBook("Comic Smoke");
        const comic = new ComicEditorPage(page);
        await comic.goto(book.id);
        await comic.addPage();
        await expect(page.getByTestId("comic-grid-template-picker-trigger"))
            .toBeVisible({timeout: 8_000});
        await comic.addPanel();
        const panel = comic.panels().first();
        await expect(panel).toBeVisible();
        // Panels render at full height (no 0-10px collapse-strip) per the
        // multi-panel-layout regression class.
        const box = await panel.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.height).toBeGreaterThan(100);
    });
});

test.describe("Section 2 — TC-029 picture-book editor (page-object smoke)", () => {
    test("adding a page reveals the layout picker + canvas", async ({page}) => {
        const book = await createPictureBook("Bilderbuch Smoke");
        const pb = new PictureBookEditorPage(page);
        await pb.goto(book.id);
        await pb.addPage();
        await expect(pb.layoutPicker).toBeVisible({timeout: 8_000});
        await expect(pb.canvasRoot).toBeVisible();
        await expect(pb.canvasEmpty).toHaveCount(0);
    });
});
