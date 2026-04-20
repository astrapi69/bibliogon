/**
 * Smoke tests for the theme system.
 *
 * Converts section 2 of ``docs/manual-smoke-tests.md`` into
 * automated coverage. Pins:
 *
 * - Palette state machine: fresh localStorage defaults to
 *   warm-literary; each new palette (classic, studio, notebook)
 *   applies data-app-theme; unknown localStorage values fall
 *   back to warm-literary via the isKnownPalette guard in
 *   useTheme.ts.
 * - Light/dark toggle: ThemeToggle button flips the data-theme
 *   attribute and persists across reload, independent of palette.
 * - UI-driven palette change: clicking through the Radix Select
 *   in Settings writes both data-app-theme and localStorage.
 * - Classic editor typography: paragraphs past the first child of
 *   .ProseMirror get a non-zero text-indent; other palettes do
 *   not apply the rule.
 * - Notebook editor background: .ProseMirror carries the
 *   linear-gradient ruled-lines background and a left border for
 *   the margin line; other palettes do not.
 *
 * Design notes
 *
 * The palette state machine is exercised via localStorage +
 * reload rather than clicking the Radix Select for every test.
 * Reasons:
 *   1. The state machine (useTheme.ts) is the actual regression
 *      surface. The Radix Select is a thin wrapper.
 *   2. localStorage seeding is deterministic and fast; walking
 *      Radix portals six times would add ~3 seconds per spec.
 *   3. One dedicated test still exercises the full UI click
 *      path so the wiring is covered end-to-end.
 *
 * ``.ProseMirror`` is used as a selector for the editor root
 * even though the repo convention is data-testid-only. Rationale:
 * ``.ProseMirror`` is the upstream TipTap/ProseMirror class
 * contract, not a Bibliogon-authored CSS class - it is
 * effectively as stable as a testid.
 */

import {test, expect, createBook, createChapter} from "../fixtures/base";
import type {Page} from "@playwright/test";

const PALETTES = ["warm-literary", "cool-modern", "nord", "classic", "studio", "notebook"] as const;
type Palette = (typeof PALETTES)[number];

/** Seeds localStorage BEFORE the page loads so useTheme's init
 * reads the stored value on first render. */
async function seedPalette(page: Page, palette: string) {
    await page.addInitScript((value) => {
        window.localStorage.setItem("bibliogon-app-theme", value);
    }, palette);
}

async function seedTheme(page: Page, theme: "light" | "dark") {
    await page.addInitScript((value) => {
        window.localStorage.setItem("bibliogon-theme", value);
    }, theme);
}

async function getAppTheme(page: Page): Promise<string | null> {
    return page.evaluate(() => document.documentElement.getAttribute("data-app-theme"));
}

async function getTheme(page: Page): Promise<string | null> {
    return page.evaluate(() => document.documentElement.getAttribute("data-theme"));
}

test.describe("Themes - palette state machine via localStorage", () => {
    test("fresh localStorage defaults to warm-literary", async ({page}) => {
        await page.goto("/");
        expect(await getAppTheme(page)).toBe("warm-literary");
    });

    for (const palette of ["classic", "studio", "notebook"] as const) {
        test(`seeding ${palette} in localStorage applies data-app-theme=${palette} on load`, async ({page}) => {
            await seedPalette(page, palette);
            await page.goto("/");
            expect(await getAppTheme(page)).toBe(palette);
        });
    }

    test("unknown palette value in localStorage falls back to warm-literary", async ({page}) => {
        // This is the isKnownPalette guard in useTheme.ts. The
        // regression would be a silent leak of an arbitrary string
        // into the data-app-theme attribute, leaving the CSS
        // unmatched and the UI visually unstyled.
        await seedPalette(page, "cyberpunk-pink");
        await page.goto("/");
        expect(await getAppTheme(page)).toBe("warm-literary");
    });

    test("palette choice survives a page reload", async ({page}) => {
        await seedPalette(page, "studio");
        await page.goto("/");
        expect(await getAppTheme(page)).toBe("studio");
        await page.reload();
        expect(await getAppTheme(page)).toBe("studio");
    });
});

test.describe("Themes - light/dark toggle", () => {
    test("ThemeToggle button flips data-theme", async ({page}) => {
        await seedTheme(page, "light");
        await page.goto("/");
        expect(await getTheme(page)).toBe("light");

        await page.getByTestId("theme-toggle").first().click();
        expect(await getTheme(page)).toBe("dark");

        await page.getByTestId("theme-toggle").first().click();
        expect(await getTheme(page)).toBe("light");
    });

    test("data-theme persists across reload", async ({page}) => {
        // NOTE: do NOT seed via addInitScript. That callback runs on
        // EVERY navigation, including reload, which would overwrite
        // the "dark" state we are trying to verify persists. Seed once
        // via page.evaluate after the initial navigation instead.
        await page.goto("/");
        await page.evaluate(() => window.localStorage.setItem("bibliogon-theme", "light"));
        await page.reload();
        expect(await getTheme(page)).toBe("light");
        await page.getByTestId("theme-toggle").first().click();
        expect(await getTheme(page)).toBe("dark");
        await page.reload();
        expect(await getTheme(page)).toBe("dark");
    });

    test("light/dark toggle is independent of the palette", async ({page}) => {
        // Picking a non-default palette and toggling light/dark
        // should leave the palette attribute untouched.
        await seedPalette(page, "notebook");
        await seedTheme(page, "light");
        await page.goto("/");
        expect(await getAppTheme(page)).toBe("notebook");
        expect(await getTheme(page)).toBe("light");

        await page.getByTestId("theme-toggle").first().click();
        expect(await getTheme(page)).toBe("dark");
        expect(await getAppTheme(page)).toBe("notebook");
    });
});

test.describe("Themes - palette selector via Settings UI", () => {
    test("picking Classic from the Radix Select applies and persists", async ({page}) => {
        await page.goto("/settings");

        // Radix Select trigger is testid-tagged via the testId prop
        // added to the local RadixSelect wrapper.
        await page.getByTestId("palette-select-trigger").click();
        await page.getByTestId("palette-select-item-classic").click();

        // Immediate DOM update
        expect(await getAppTheme(page)).toBe("classic");

        // Persisted in localStorage
        const stored = await page.evaluate(() =>
            window.localStorage.getItem("bibliogon-app-theme"),
        );
        expect(stored).toBe("classic");

        // Survives a reload
        await page.reload();
        expect(await getAppTheme(page)).toBe("classic");
    });
});

test.describe("Themes - Classic editor first-line indent", () => {
    // Classic novel typography has two rules, both implemented in
    // ``[data-app-theme="classic"] .ProseMirror`` CSS:
    //   1. ``p:not(:first-child)`` gets text-indent: 1.5em.
    //      Means: first element of the chapter is flush-left,
    //      subsequent paragraphs are indented.
    //   2. ``h1-h6 + p`` gets text-indent: 0.
    //      Means: any paragraph that directly follows a heading
    //      is also flush-left, even if it is not the first child.
    //
    // This describe covers both rules plus the negative case
    // (Warm Literary applies neither). Each test seeds its own
    // book so the chapter structure is explicit in the test
    // body - saves mental load vs shared fixtures where you have
    // to go look up what was seeded.
    let bookId: string;

    async function seedBookWithChapter(title: string, tiptapDoc: unknown): Promise<void> {
        const book = await createBook(title);
        bookId = book.id;
        await createChapter(book.id, "Capitulo", JSON.stringify(tiptapDoc));
    }

    /** Returns the computed textIndent (in px) for every direct
     * paragraph child of .ProseMirror. */
    async function getParagraphIndents(page: Page): Promise<number[]> {
        return page.evaluate(() => {
            const root = document.querySelector(".ProseMirror");
            if (!root) return [];
            const ps = Array.from(root.querySelectorAll(":scope > p"));
            return ps.map((p) => parseFloat(getComputedStyle(p as Element).textIndent) || 0);
        });
    }

    async function openChapter(page: Page) {
        await page.goto(`/book/${bookId}`);
        await page.getByText("Capitulo").first().click();
        await page.locator(".ProseMirror").waitFor({state: "visible"});
    }

    test("Classic indents paragraphs past the first child (all-paragraph chapter)", async ({page}) => {
        await seedBookWithChapter("Classic Indent - Paragraphs Only", {
            type: "doc",
            content: [
                {type: "paragraph", content: [{type: "text", text: "First paragraph."}]},
                {type: "paragraph", content: [{type: "text", text: "Second paragraph."}]},
                {type: "paragraph", content: [{type: "text", text: "Third paragraph."}]},
            ],
        });
        await seedPalette(page, "classic");
        await openChapter(page);

        const indents = await getParagraphIndents(page);
        expect(indents).toHaveLength(3);
        // First element of the chapter is flush-left.
        expect(indents[0]).toBe(0);
        // All subsequent paragraphs are indented.
        expect(indents[1]).toBeGreaterThan(0);
        expect(indents[2]).toBeGreaterThan(0);
    });

    test("Classic resets indent on paragraphs that follow a heading", async ({page}) => {
        // Structure: h2, p (follows heading -> flush), p (not
        // :first-child and does not follow a heading -> indented).
        // Regression pin for the CSS fix that added
        // ``[data-app-theme="classic"] .ProseMirror h1-h6 + p
        // { text-indent: 0 }`` on top of the :not(:first-child)
        // base rule.
        await seedBookWithChapter("Classic Indent - Heading", {
            type: "doc",
            content: [
                {
                    type: "heading",
                    attrs: {level: 2},
                    content: [{type: "text", text: "Section heading"}],
                },
                {type: "paragraph", content: [{type: "text", text: "Paragraph after heading."}]},
                {type: "paragraph", content: [{type: "text", text: "Second paragraph."}]},
            ],
        });
        await seedPalette(page, "classic");
        await openChapter(page);

        const indents = await getParagraphIndents(page);
        expect(indents).toHaveLength(2);
        // First paragraph follows the h2 -> flush-left.
        expect(indents[0]).toBe(0);
        // Second paragraph is a plain non-:first-child and does
        // not directly follow a heading -> indented.
        expect(indents[1]).toBeGreaterThan(0);
    });

    test("Warm Literary does NOT indent any paragraph", async ({page}) => {
        await seedBookWithChapter("Warm Literary Indent", {
            type: "doc",
            content: [
                {type: "paragraph", content: [{type: "text", text: "First paragraph."}]},
                {type: "paragraph", content: [{type: "text", text: "Second paragraph."}]},
                {type: "paragraph", content: [{type: "text", text: "Third paragraph."}]},
            ],
        });
        await seedPalette(page, "warm-literary");
        await openChapter(page);

        const indents = await getParagraphIndents(page);
        for (const indent of indents) {
            expect(indent).toBe(0);
        }
    });
});

test.describe("Themes - Notebook editor ruled-lines background", () => {
    let bookId: string;

    test.beforeEach(async () => {
        const book = await createBook("Notebook Background Smoke");
        bookId = book.id;
        const tiptapJson = JSON.stringify({
            type: "doc",
            content: [
                {type: "paragraph", content: [{type: "text", text: "Probe."}]},
            ],
        });
        await createChapter(bookId, "Probe Kapitel", tiptapJson);
    });

    async function openEditor(page: Page) {
        await page.goto(`/book/${bookId}`);
        await page.getByText("Probe Kapitel").first().click();
        await page.locator(".ProseMirror").waitFor({state: "visible"});
    }

    async function getEditorStyles(page: Page): Promise<{
        backgroundImage: string;
        borderLeftWidth: string;
        borderLeftStyle: string;
    }> {
        return page.evaluate(() => {
            const root = document.querySelector(".ProseMirror") as HTMLElement | null;
            if (!root) throw new Error(".ProseMirror not found");
            const cs = getComputedStyle(root);
            return {
                backgroundImage: cs.backgroundImage,
                borderLeftWidth: cs.borderLeftWidth,
                borderLeftStyle: cs.borderLeftStyle,
            };
        });
    }

    test("Notebook palette applies a linear-gradient ruled-lines background", async ({page}) => {
        await seedPalette(page, "notebook");
        await openEditor(page);

        const styles = await getEditorStyles(page);
        // background-image is the literal linear-gradient(...)
        // the CSS emits. Browsers resolve the CSS variable and
        // return the fully-expanded gradient string.
        expect(styles.backgroundImage).toContain("linear-gradient");
    });

    test("Notebook palette applies a left margin line via border-left", async ({page}) => {
        await seedPalette(page, "notebook");
        await openEditor(page);

        const styles = await getEditorStyles(page);
        // 2px solid {notebook-margin color}. We assert on the
        // width and style to stay stable against color tweaks
        // in the CSS variable.
        expect(styles.borderLeftWidth).toBe("2px");
        expect(styles.borderLeftStyle).toBe("solid");
    });

    test("Warm Literary palette does NOT apply the ruled-lines background", async ({page}) => {
        await seedPalette(page, "warm-literary");
        await openEditor(page);

        const styles = await getEditorStyles(page);
        // No linear-gradient on the editor root under the default
        // palette. browsers return "none" when no background-image
        // is set.
        expect(styles.backgroundImage).not.toContain("linear-gradient");
    });

    test("Classic palette does NOT apply the ruled-lines background", async ({page}) => {
        await seedPalette(page, "classic");
        await openEditor(page);

        const styles = await getEditorStyles(page);
        expect(styles.backgroundImage).not.toContain("linear-gradient");
    });
});
