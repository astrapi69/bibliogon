/**
 * Repository-URL field smoke (BOOK-REPOSITORY-URL-FIELD-01 C5).
 *
 * Exercises the new General-tab Repository-URL field:
 *
 *   - Free-input branch: type a URL, save, reload, assert it
 *     round-trips via Book.repository_url.
 *   - Empty-string clears: clear the field, save, reload, assert
 *     the column is null (empty → null coercion in handleSave).
 *
 * The read-only branch (plugin-git-sync-managed) requires a full
 * git-sync import in CI to set up a GitSyncMapping row; that's
 * out of scope for a smoke spec. Vitest covers that branch in
 * BookMetadataEditor.test.tsx.
 *
 * Per LL "Testid namespace pinning prevents silent E2E skips":
 * locates the input via ``metadata-repository-url-input`` (stable
 * across both render branches; the wrapper testid changes between
 * ``-manual`` and ``-managed`` but the input testid does not).
 */

import {test, expect, createBook} from "../fixtures/base";

const API = "http://localhost:8000/api";

test.describe("Book-metadata Repository-URL field smoke", () => {
    test("type + save + reload round-trips repository_url", async ({page}) => {
        const book = await createBook("Repo URL Round-Trip", "E2E Author");
        await page.goto(`/book/${book.id}?view=metadata`);

        // General tab is the default; no tab click needed.
        const wrapper = page.getByTestId("metadata-repository-url-manual");
        await expect(wrapper).toBeVisible({timeout: 10000});

        // Bounding-box dimension check per LL "Playwright-visible
        // != User-visible": the field's wrapper must be tall enough
        // to actually surface the label + input + hint stack.
        const bbox = await wrapper.boundingBox();
        expect(bbox).not.toBeNull();
        expect(bbox!.height).toBeGreaterThan(40);

        const input = page.getByTestId("metadata-repository-url-input");
        const url = "https://github.com/e2e/round-trip-book.git";
        await input.fill(url);
        await page.getByTestId("metadata-save").click();

        // Verify via the backend that the column landed before the
        // reload. The save is an async PATCH roundtrip, so poll rather
        // than read once.
        await expect
            .poll(async () => {
                const res = await page.request.get(`${API}/books/${book.id}`);
                return (await res.json()).repository_url;
            })
            .toBe(url);

        // Reload from URL — the editor reads fresh data from
        // /api/books/{id} on mount, which feeds the form-init
        // useEffect.
        await page.reload();
        const inputAfter = page.getByTestId("metadata-repository-url-input");
        await expect(inputAfter).toHaveValue(url);
    });

    test("clearing the field saves repository_url = null", async ({page}) => {
        const book = await createBook("Repo URL Clear", "E2E Author");
        await page.goto(`/book/${book.id}?view=metadata`);

        const input = page.getByTestId("metadata-repository-url-input");
        await expect(input).toBeVisible({timeout: 10000});

        // First set a value, and wait for it to land before clearing
        // (otherwise the clear-save races the in-flight first save).
        const seed = "https://gitlab.com/e2e/will-be-cleared.git";
        await input.fill(seed);
        await page.getByTestId("metadata-save").click();
        await expect
            .poll(async () => {
                const res = await page.request.get(`${API}/books/${book.id}`);
                return (await res.json()).repository_url;
            })
            .toBe(seed);

        // Then clear it + save again.
        await input.fill("");
        await page.getByTestId("metadata-save").click();

        // Verify the field is cleared at the backend (null or empty
        // both mean "no repository URL").
        await expect
            .poll(async () => {
                const res = await page.request.get(`${API}/books/${book.id}`);
                return (await res.json()).repository_url || null;
            })
            .toBeNull();
    });
});
