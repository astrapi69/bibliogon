/**
 * The production container, opened in a real browser (#704).
 *
 * The finding this closes came from the sister project: a white page over
 * the launcher shipped because every gate in the chain checked a proxy
 * for the thing it cared about. The compose healthcheck curls
 * `/api/health`; `docker build` proves the image compiles; the launcher
 * waits for a status code. A CSP that blocked every resource satisfied
 * all three - the server was healthy, the HTML was served, and the app
 * rendered nothing.
 *
 * So these tests assert capabilities, not proxies:
 *   - the bundle nginx serves from the image executes and paints,
 *   - a deep link resolves through nginx's SPA fallback,
 *   - `/api/` reaches the backend container and a write survives a
 *     reload.
 *
 * Measured here and nowhere else: the smoke suite runs against the Vite
 * DEV server, the static-smoke suite against `vite preview` with no
 * backend at all. Neither has ever loaded the image nginx ships, and
 * nginx is where a dropped header include or a missing `try_files`
 * lives.
 *
 * The stack is NOT started by this config - see
 * playwright.prod-container.config.ts. A run against nothing fails on
 * the first navigation rather than passing with zero assertions.
 */

import {test, expect, type BrowserContext, type Page} from "@playwright/test";

/**
 * One line of text at the app's 16px base size, rounded down. Taken from
 * the design, deliberately not measured from anything inside the page:
 * a bound computed from the element under test (or from its own
 * children) moves with the bug and reports green either way - the class
 * of inert assertion #1001 had to repair twice.
 */
const ONE_LINE_PX = 24;

/**
 * The service worker is kept out of these tests. Two reasons, both about
 * what this gate is for: a precaching worker would serve one test's
 * bundle to the next and mask a changed artifact, and the worker's own
 * auto-update (focus / visibility / hourly) races Playwright's per-test
 * storage wipe and logs an uncaught InvalidStateError that says nothing
 * about whether the container renders (#1065). The real worker IS
 * measured, against the canonical CSP, in
 * static-smoke/csp-report-only.spec.ts.
 *
 * FULFILLED empty, not aborted. The sibling static-smoke specs abort,
 * which they can afford because they do not watch the console: an
 * aborted request makes Chromium log `Failed to load resource:
 * net::ERR_FAILED`, and this gate fails on exactly that. An empty 200
 * leaves nothing to register and nothing to report.
 */
const SW_SCRIPTS = /\/(registerSW\.js|sw\.js)(\?|$)/;

test.beforeEach(async ({context}: {context: BrowserContext}) => {
    await context.route(SW_SCRIPTS, (route) =>
        route.fulfill({status: 200, contentType: "application/javascript", body: ""}),
    );
});

interface PageFailures {
    console: string[];
    requests: string[];
}

/**
 * Record the two channels a white page speaks through: a console error
 * (a throwing bundle, a CSP violation Chromium reports, a failed
 * dynamic import) and a request that never produced a response (a
 * blocked or 404'd asset).
 *
 * Collected per test and asserted empty, because "the header is
 * visible" is satisfied by a page whose every subsequent chunk 404s.
 */
function watchFailures(page: Page): PageFailures {
    const failures: PageFailures = {console: [], requests: []};
    page.on("console", (message) => {
        if (message.type() === "error") failures.console.push(message.text());
    });
    page.on("pageerror", (error) => {
        failures.console.push(`uncaught: ${error.message}`);
    });
    page.on("requestfailed", (request) => {
        const failure = request.failure()?.errorText ?? "unknown";
        failures.requests.push(`${request.method()} ${request.url()} - ${failure}`);
    });
    page.on("response", (response) => {
        if (response.status() >= 400) {
            failures.requests.push(`${response.status()} ${response.url()}`);
        }
    });
    return failures;
}

function expectNoFailures(failures: PageFailures, surface: string): void {
    expect(
        failures.console,
        `${surface} logged console errors:\n${failures.console.join("\n")}`,
    ).toEqual([]);
    expect(
        failures.requests,
        `${surface} has resources that did not load:\n${failures.requests.join("\n")}`,
    ).toEqual([]);
}

/** The element is on screen AND has a box a user could see. */
async function expectRendered(page: Page, testId: string): Promise<void> {
    const element = page.getByTestId(testId);
    await expect(element).toBeVisible();
    const box = await element.boundingBox();
    expect(box, `${testId} has no bounding box`).not.toBeNull();
    expect(
        box!.height,
        `${testId} is ${box!.height}px tall - under ${ONE_LINE_PX}px nothing in it is readable`,
    ).toBeGreaterThan(ONE_LINE_PX);
    expect(box!.width, `${testId} is ${box!.width}px wide`).toBeGreaterThan(200);
}

test("the container serves an app that paints, with the security headers nginx is told to send", async ({
    page,
}) => {
    const failures = watchFailures(page);
    const apiResponses: number[] = [];
    page.on("response", (response) => {
        if (new URL(response.url()).pathname.startsWith("/api/")) {
            apiResponses.push(response.status());
        }
    });

    const response = await page.goto("/");
    expect(response?.status(), "the document did not come back 200").toBe(200);

    // nginx's `include /etc/nginx/security-headers.conf` at server level.
    // The generated file is checked for drift against csp.txt by
    // `make sync-security-headers --check`; what no other gate checks is
    // that nginx actually loaded and sent it.
    const headers = response!.headers();
    expect(
        headers["content-security-policy-report-only"] ?? headers["content-security-policy"],
        "no Content-Security-Policy header from nginx",
    ).toBeTruthy();
    expect(headers["x-content-type-options"]).toBe("nosniff");

    // The capability: the bundle ran. A blocked script leaves the HTML
    // intact and #root empty, which is the exact shape of the bug this
    // gate exists for.
    await expectRendered(page, "dashboard-header");

    // The proxy, proven from the browser rather than from curl: this
    // build carries no VITE_STORAGE_MODE, so it resolves to the API
    // backend and the dashboard's own loads go through nginx into the
    // backend container.
    await expect
        .poll(() => apiResponses.length, {timeout: 15_000})
        .toBeGreaterThan(0);
    expect(
        apiResponses.filter((status) => status >= 400),
        `the /api proxy answered with errors: ${apiResponses.join(", ")}`,
    ).toEqual([]);

    expectNoFailures(failures, "dashboard");
});

test("a deep link resolves through the SPA fallback", async ({page}) => {
    const failures = watchFailures(page);
    // Typed into the address bar, not reached by clicking: nginx has to
    // answer /articles with index.html (`try_files $uri $uri/
    // /index.html`). Without the fallback this is a 404 page - and every
    // in-app navigation would still work, so no other test would notice.
    const response = await page.goto("/articles");
    expect(response?.status(), "the deep link did not resolve to the app").toBe(200);
    await expectRendered(page, "article-list-main-header");
    expectNoFailures(failures, "deep-linked article list");
});

test("a document written through the container is still there after a reload", async ({
    page,
}) => {
    const failures = watchFailures(page);
    // End to end through every layer the production stack has: the
    // browser posts to nginx, nginx proxies to the backend container, the
    // backend writes SQLite inside the named volume, and the reload reads
    // it back. A read-only smoke would pass against a backend whose data
    // directory is not writable.
    //
    // An article, not a book. The create-book form needs a title AND an
    // author, and its author field re-mounts when the profile load
    // resolves (#1066) - two runs of this test lost the typed author to
    // that re-render, once into the title field and once to nothing at
    // all. Pinning a storage round-trip on the most load-racy form in the
    // app measures that form, not the stack. The article form needs a
    // title, and that is the whole point here.
    const title = `Prod-Container Text ${Date.now()}`;
    await page.goto("/articles/new");
    const titleField = page.getByTestId("create-article-title");
    await titleField.fill(title);
    await expect(titleField).toHaveValue(title);
    await page.getByTestId("create-article-submit").click();

    // The editor opens on the created article, which is already proof the
    // POST came back with an id through the proxy.
    await page.waitForURL(
        (url) => /\/articles\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new"),
        {timeout: 30_000},
    );
    const articlePath = new URL(page.url()).pathname;

    // The reload is what proves it was WRITTEN rather than held in a
    // component's state: a fresh document, a fresh GET, same title.
    await page.goto(articlePath);
    await expect(page.getByTestId("article-editor-title-text")).toContainText(title, {
        timeout: 20_000,
    });
    expectNoFailures(failures, "article round-trip");
});
