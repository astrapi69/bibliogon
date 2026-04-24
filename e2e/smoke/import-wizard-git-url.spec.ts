/**
 * UI smoke for the git URL import happy path (PGS-01).
 *
 * This spec intentionally mocks `/api/import/detect/git` and
 * `/api/import/execute` at the browser network layer instead of
 * driving a real clone. Reasons:
 *
 * 1. Real clones depend on a public remote, which adds flake
 *    (network, rate limits, GitHub outage).
 * 2. A local `file://` bare repo would require extending the
 *    plugin's can_handle regex to accept file:// URLs - that
 *    leaks test semantics into production code.
 * 3. Backend-level tests in
 *    backend/tests/test_import_git_endpoint.py already cover
 *    the real plugin-endpoint-handler chain with a mocked
 *    GitPython. This spec's job is to verify the WIZARD UI
 *    drives that endpoint correctly.
 *
 * If the mocked endpoints ever drift from the real response
 * schema, backend/tests/test_import_git_endpoint.py will fail
 * first. Keep the mock payloads below in sync with the real
 * DetectResponse / ExecuteResponse shapes in
 * backend/app/routers/import_orchestrator.py.
 */

import {test, expect} from "../fixtures/base";

const DETECTED_PROJECT = {
    format_name: "wbt-zip",
    source_identifier: "signature:git-smoke-e2e",
    title: "Git URL Smoke Book",
    author: "PGS-01",
    language: "en",
    chapters: [
        {
            title: "Git URL Smoke Book",
            position: 0,
            word_count: 4,
            content_preview: "Body.",
        },
    ],
    assets: [],
    warnings: [],
    plugin_specific_data: {
        project_root_name: "git-smoke",
        chapter_count: 1,
        asset_count: 0,
    },
};

const DETECT_RESPONSE = {
    detected: DETECTED_PROJECT,
    duplicate: {
        found: false,
        existing_book_id: null,
        existing_book_title: null,
        imported_at: null,
    },
    temp_ref: "imp-smoke-git-url",
};

const EXECUTE_RESPONSE = {
    book_id: "e2e-git-smoke-book",
    status: "created",
};

const BOOK_RESPONSE = {
    id: "e2e-git-smoke-book",
    title: "Git URL Smoke Book",
    author: "PGS-01",
    language: "en",
    chapters: [
        {
            id: "ch-git-smoke-1",
            book_id: "e2e-git-smoke-book",
            title: "Git URL Smoke Book",
            content: "Body.",
            position: 0,
            chapter_type: "chapter",
            version: 1,
        },
    ],
};

test.describe("Import wizard UI: git URL", () => {
    test("paste URL -> clone (mocked) -> preview -> execute -> success", async ({
        page,
    }) => {
        // Mock the clone + detect endpoint.
        await page.route("**/api/import/detect/git", async (route) => {
            const request = route.request();
            const body = JSON.parse(request.postData() || "{}");
            expect(body.git_url).toMatch(/^https?:\/\/.+$/);
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(DETECT_RESPONSE),
            });
        });

        // Mock execute to avoid a real DB write tied to the fake
        // temp_ref (which the backend has never staged).
        await page.route("**/api/import/execute", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(EXECUTE_RESPONSE),
            });
        });

        // Mock the GET the wizard may make after success (for
        // post-import navigation). Keep it minimal.
        await page.route("**/api/books/e2e-git-smoke-book", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(BOOK_RESPONSE),
            });
        });

        await page.goto("/");
        await page.getByTestId("import-wizard-btn").click();
        await expect(page.getByTestId("import-wizard-modal")).toBeVisible();

        await page
            .getByTestId("git-url-input")
            .fill("https://github.com/astrapi69/write-book-template");
        await page.getByTestId("git-url-submit").click();

        await expect(page.getByTestId("preview-step")).toBeVisible({
            timeout: 10_000,
        });
        await expect(page.getByTestId("preview-title")).toContainText(
            "Git URL Smoke Book",
        );

        await page.getByTestId("preview-confirm").click();
        await expect(page.getByTestId("success-step")).toBeVisible({
            timeout: 10_000,
        });
    });

    test("invalid URL shape is rejected before any API call", async ({page}) => {
        let detectCalled = false;
        await page.route("**/api/import/detect/git", async (route) => {
            detectCalled = true;
            await route.abort();
        });

        await page.goto("/");
        await page.getByTestId("import-wizard-btn").click();

        await page.getByTestId("git-url-input").fill("not a url");
        await page.getByTestId("git-url-submit").click();

        await expect(page.getByTestId("git-url-error")).toBeVisible();
        expect(detectCalled).toBe(false);
    });
});
