/**
 * Smoke test for the CreateArticlePage route (Dialog->Pages migration C2).
 *
 * Article creation moved from a one-click split-button action to a
 * deep-linkable page at `/articles/new?type=<content_type>`. These specs
 * cover the page contract:
 *   - deep-link: the URL renders the form directly
 *   - create: the new article persists and opens in the editor
 *   - ?type=: the resolved content_type is applied to the created article
 *   - back button: returns to the article list
 *   - mobile viewport: the form renders without overflow
 *
 * data-testid selectors only (i18n-stable). Article existence + type are
 * verified via /api/articles.
 */

import {test, expect} from "../fixtures/base";

test("deep-link to /articles/new renders the create form directly", async ({page}) => {
    await page.goto("/articles/new");
    await expect(page.getByTestId("create-article-page")).toBeVisible();
    await expect(page.getByTestId("create-article-title")).toBeVisible();
    await expect(page.getByTestId("create-article-submit")).toBeVisible();
});

test("create an article persists it and opens the editor", async ({page}) => {
    await page.goto("/articles/new");
    await page.getByTestId("create-article-title").fill("E2E Article Page");

    const submit = page.getByTestId("create-article-submit");
    await expect(submit).toBeEnabled();
    await submit.click();

    // Lands in the article editor at /articles/<id> (not /articles/new).
    await expect(page).toHaveURL(/\/articles\/(?!new$)[^/]+$/, {timeout: 10_000});

    const created = await page.evaluate(async () => {
        const r = await fetch("/api/articles");
        const articles = await r.json();
        return (articles as {id: string; title: string}[]).find(
            (a) => a.title === "E2E Article Page",
        );
    });
    expect(created).toBeTruthy();
});

test("?type= is applied to the created article", async ({page}) => {
    await page.goto("/articles/new?type=tutorial");
    await expect(
        page.getByTestId("create-article-title-tutorial"),
    ).toBeVisible();
    await page.getByTestId("create-article-title").fill("E2E Tutorial Article");
    await page.getByTestId("create-article-submit").click();

    await expect(page).toHaveURL(/\/articles\/(?!new$)[^/]+$/, {timeout: 10_000});

    // Poll rather than read once: the editor URL changes the moment the
    // create POST resolves, but the article list can lag a beat behind that
    // commit, so a single fetch races the read-after-write and returns
    // undefined (the #65 flake). Poll until the row is visible with its
    // resolved type.
    await expect
        .poll(
            async () =>
                page.evaluate(async () => {
                    const r = await fetch("/api/articles");
                    const articles = (await r.json()) as {
                        title: string;
                        content_type: string;
                    }[];
                    return (
                        articles.find((a) => a.title === "E2E Tutorial Article")
                            ?.content_type ?? null
                    );
                }),
            {timeout: 10_000},
        )
        .toBe("tutorial");
});

test("back button returns to the article list", async ({page}) => {
    await page.goto("/articles");
    await page.getByTestId("article-list-new").click();
    await expect(page).toHaveURL(/\/articles\/new/);
    await page.getByTestId("create-article-page-back").click();
    // Back to the article list (the New-article split-button is list-only).
    await expect(page.getByTestId("article-list-new")).toBeVisible();
    await expect(page).not.toHaveURL(/\/articles\/new/);
});

test("renders on a mobile viewport without overflow", async ({page}) => {
    await page.setViewportSize({width: 375, height: 800});
    await page.goto("/articles/new");
    const title = page.getByTestId("create-article-title");
    await expect(title).toBeVisible();
    const box = await title.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
});
