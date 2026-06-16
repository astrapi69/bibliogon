/**
 * Manual-Testplan Section 1 — Dashboard (BD + AD).
 *
 * Closes the automatable gaps the coverage table marks "Teilweise"/"Nein":
 *   - TC-001/002 create-and-open per book type (prose/picture/comic editor)
 *   - TC-003 create article per content type (badge + per-type fields)
 *   - TC-014 default content-type -> SplitButton primary label
 *   - TC-015 thumbnail: placeholder without cover, <img> with a real cover
 *   - TC-016 comment-badge parity: badge absence is consistent across the
 *     grid + list views (count>0 needs imported comments, see TC-038)
 *
 * The flows that are already strongly covered by e2e/smoke (filters, bulk,
 * trash, pagination) are NOT re-implemented here; this section adds only
 * the missing render/contract pins. Runs against the live backend via the
 * shared resetDatabase fixture.
 */

import {test, expect, createBook, createArticle, createPictureBook, createComicBook} from "../fixtures/base";
import {DashboardPage} from "./pages/dashboard.page";
import {patchApp, uploadCover} from "./helpers/setup.helper";

test.describe("Section 1 — Dashboard create + open", () => {
    test("TC-001/002: prose book opens the chapter editor", async ({page}) => {
        const book = await createBook("Prosa Buch", "Autor");
        await page.goto(`/book/${book.id}`);
        await expect(page.getByTestId("chapter-sidebar")).toBeVisible({timeout: 10_000});
    });

    test("TC-002: picture book opens the page editor", async ({page}) => {
        const book = await createPictureBook("Bilderbuch");
        await page.goto(`/book/${book.id}`);
        await expect(page.getByTestId("page-editor-root")).toBeVisible({timeout: 10_000});
    });

    test("TC-002: comic book opens the comic editor", async ({page}) => {
        const book = await createComicBook("Comic Buch");
        await page.goto(`/book/${book.id}`);
        await expect(page.getByTestId("comic-book-editor-root")).toBeVisible({timeout: 10_000});
    });

    test("TC-001: a created book shows in both BD views", async ({page}) => {
        const book = await createBook("BD Sichtbar", "Autor");
        const bd = new DashboardPage(page, "books");
        await bd.goto();
        await bd.switchView("grid");
        await expect(bd.entity(book.id)).toHaveCount(1);
        await bd.switchView("list");
        await expect(bd.entity(book.id)).toHaveCount(1);
    });
});

test.describe("Section 1 — TC-003 article content types", () => {
    // The 8 content-type discriminators (ContentTypeRegistry SSoT).
    const TYPES = [
        "blogpost",
        "tutorial",
        "review",
        "essay",
        "newsletter",
        "interview",
        "listicle",
        "short_story",
    ] as const;

    for (const type of TYPES) {
        test(`creates a ${type} article that persists with that content_type`, async ({page}) => {
            await page.goto(`/articles/new?type=${type}`);
            await expect(page.getByTestId("create-article-title")).toBeVisible();
            await page.getByTestId("create-article-title").fill(`E2E ${type}`);
            await page.getByTestId("create-article-submit").click();
            // The new article persists with the chosen content_type.
            await expect
                .poll(async () =>
                    page.evaluate(async (t) => {
                        const r = await fetch("/api/articles");
                        const list = (await r.json()) as {title: string; content_type: string}[];
                        return list.find((a) => a.title === `E2E ${t}`)?.content_type ?? null;
                    }, type),
                    {timeout: 10_000},
                )
                .toBe(type);
        });
    }
});

test.describe("Section 1 — TC-014 default content type -> button label", () => {
    test("a non-default content type makes the AD primary deep-link that type", async ({page}) => {
        // ``ui.defaults.content_type`` drives the SplitButton primary: a
        // specific (non-registry-default) type makes the primary deep-link
        // ``/articles/new?type=<id>`` so CreateArticlePage shows the
        // type-specific heading. Tutorial is not the registry default.
        await patchApp({ui: {defaults: {content_type: "tutorial"}}});
        const ad = new DashboardPage(page, "articles");
        await ad.goto();
        const primary = page.getByTestId("article-list-new");
        await expect(primary).toBeVisible();
        await primary.click();
        await expect(page).toHaveURL(/\/articles\/new\?type=tutorial/, {timeout: 10_000});
    });
});

test.describe("Section 1 — TC-015 thumbnail render", () => {
    test("book without a cover renders the placeholder, no <img>", async ({page}) => {
        const book = await createBook("Kein Cover", "Autor");
        const bd = new DashboardPage(page, "books");
        await bd.goto();
        await bd.switchView("grid");
        await expect(bd.entity(book.id)).toHaveCount(1);
        await expect(bd.placeholder(book.id)).toBeVisible();
        await expect(bd.coverImage(book.id)).toHaveCount(0);
    });

    test("book with a real cover renders an <img>, no placeholder", async ({page}) => {
        const book = await createBook("Mit Cover", "Autor");
        await uploadCover(book.id);
        const bd = new DashboardPage(page, "books");
        await bd.goto();
        await bd.switchView("grid");
        const img = bd.coverImage(book.id);
        await expect(img).toBeVisible();
        // The src resolves to the served cover asset (not a broken icon).
        await expect(img).toHaveAttribute("src", /\/assets\/file\/cover\.png/);
        await expect(bd.placeholder(book.id)).toHaveCount(0);
    });
});

test.describe("Section 1 — TC-016 comment-badge parity", () => {
    test("an article with no comments shows no badge in EITHER view", async ({page}) => {
        // count>0 requires imported comments (TC-038 / Medium import); the
        // automatable portion here pins the parity contract: the badge is
        // absent consistently across grid + list when count is 0, so the
        // historical Kachel-vs-Liste asymmetry cannot reappear.
        const article = await createArticle("Ohne Kommentare", "de");
        const ad = new DashboardPage(page, "articles");
        await ad.goto();
        await ad.switchView("grid");
        await expect(ad.entity(article.id)).toHaveCount(1);
        await expect(ad.commentBadgeGrid(article.id)).toHaveCount(0);
        await ad.switchView("list");
        await expect(ad.entity(article.id)).toHaveCount(1);
        await expect(ad.commentBadgeList(article.id)).toHaveCount(0);
    });
});
