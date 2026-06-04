/**
 * Content-type selectors list ALL 8 types, Blogpost included.
 *
 * Regression pin for the recurring "Blogpost (the default) is
 * missing from the content-type menu" report. The default type was
 * once filtered out of the ArticleList "Neuer Artikel" split-button
 * chevron (`at.id !== defaultId`); that filter is gone and the
 * CreateArticlePage dropdown never had one. Nothing pinned the
 * rendered OPTIONS though (Radix Select renders them in a portal,
 * which happy-dom/Vitest cannot reliably open) -- so this real-
 * browser spec is the contract: both surfaces must show every type.
 *
 * If this ever fails while the code looks correct, suspect a STALE
 * FRONTEND BUNDLE first (rebuild / hard-reload) -- that is the most
 * common cause of a "still missing" report on a just-shipped fix.
 *
 * Written by Claude Code; Aster runs it (per the E2E gate).
 */

import {test, expect} from "../fixtures/base";

// Testid id-segment per surface. The SplitButton maps underscores to
// hyphens (`short_story` -> `short-story`); the CreateArticlePage
// Radix Select keeps the raw id.
const MENU_ITEM_IDS = [
    "blogpost",
    "tutorial",
    "review",
    "essay",
    "newsletter",
    "interview",
    "listicle",
    "short-story",
];
const DROPDOWN_IDS = [
    "blogpost",
    "tutorial",
    "review",
    "essay",
    "newsletter",
    "interview",
    "listicle",
    "short_story",
];

test.describe("Content-type selectors include Blogpost", () => {
    test("CreateArticlePage type dropdown lists all 8 types", async ({
        page,
        resetDatabase,
    }) => {
        void resetDatabase;
        await page.goto("/articles/new");
        await page.getByTestId("create-article-type").click();
        for (const id of DROPDOWN_IDS) {
            await expect(
                page.getByTestId(`create-article-type-${id}`),
            ).toBeVisible();
        }
    });

    test("ArticleList 'Neuer Artikel' menu lists all 8 types", async ({
        page,
        resetDatabase,
    }) => {
        void resetDatabase;
        await page.goto("/articles");
        await page.getByTestId("new-article-chevron").click();
        for (const id of MENU_ITEM_IDS) {
            await expect(
                page.getByTestId(`new-article-menu-item-${id}`),
            ).toBeVisible();
        }
    });
});
