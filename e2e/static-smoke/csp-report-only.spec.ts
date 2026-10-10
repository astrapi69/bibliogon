/**
 * The report-only phase of #986, made measurable.
 *
 * `vite preview` serves the REAL built bundle and sends the canonical
 * policy from `frontend/security/csp.txt` as
 * Content-Security-Policy-Report-Only, so a real Chromium evaluates the
 * policy against the artifact every deployment actually ships. This is
 * the evidence the enforcing flip needs: a violation here is a white
 * page in production once the header stops saying report-only.
 *
 * Why here and not in the dev-server smoke suite: `@vitejs/plugin-react`
 * injects the React-Refresh preamble as an inline module script in dev,
 * so `script-src 'self'` would be violated there by a script that exists
 * in no shipped bundle. Measuring the built artifact is the only honest
 * surface.
 *
 * Why the `securitypolicyviolation` DOM event and not the console: the
 * event carries the directive, the blocked URI and the source location
 * as structured fields, so a failure names WHICH directive is wrong
 * instead of handing a reviewer a string to grep. Console matching would
 * also depend on Chromium's wording for a message it is free to
 * rephrase.
 */

import {test, expect, type BrowserContext, type Page} from "@playwright/test";
import path from "node:path";

const COVER_FIXTURE = path.resolve(__dirname, "../fixtures/kdp-cover-pass.png");

interface CspViolation {
    directive: string;
    blockedURI: string;
    sourceFile: string;
    lineNumber: number;
    sample: string;
}

declare global {
    interface Window {
        __cspViolations?: CspViolation[];
    }
}

/** The service-worker scripts the sibling static-smoke specs abort. */
const SW_SCRIPTS = /\/(registerSW\.js|sw\.js)(\?|$)/;

const abortServiceWorker = (route: {abort: () => Promise<void>}) => route.abort();

/** Let the real worker register, for the one test that measures it. */
async function allowServiceWorker(context: BrowserContext): Promise<void> {
    await context.unroute(SW_SCRIPTS, abortServiceWorker);
}

test.beforeEach(async ({context}) => {
    // Same as the sibling static-smoke specs: the service worker would
    // serve a precached bundle across tests. The worker-src test below
    // calls allowServiceWorker to opt back in.
    await context.route(SW_SCRIPTS, abortServiceWorker);
    await context.addInitScript(() => {
        window.__cspViolations = [];
        document.addEventListener("securitypolicyviolation", (event) => {
            window.__cspViolations?.push({
                directive: event.violatedDirective,
                blockedURI: event.blockedURI,
                sourceFile: event.sourceFile,
                lineNumber: event.lineNumber,
                sample: event.sample,
            });
        });
        try {
            localStorage.setItem("bibliogon-donation-onboarding-seen", "true");
            localStorage.setItem("bibliogon-ai-setup-dismissed", "true");
            localStorage.setItem("bibliogon-migration-offered", "true");
        } catch {
            /* storage unavailable: the assertions below report it */
        }
    });
});

function describeViolations(violations: CspViolation[]): string {
    return violations
        .map(
            (violation) =>
                `${violation.directive} blocked ${violation.blockedURI || "(inline)"}` +
                ` at ${violation.sourceFile}:${violation.lineNumber}` +
                (violation.sample ? ` sample="${violation.sample}"` : ""),
        )
        .join("\n");
}

async function expectNoViolations(page: Page, surface: string): Promise<void> {
    const violations = await page.evaluate(() => window.__cspViolations ?? []);
    expect(
        violations,
        `${surface} violates the canonical CSP:\n${describeViolations(violations)}`,
    ).toEqual([]);
}

test("the preview server actually sends the report-only header", async ({page}) => {
    // Without this the rest of the spec could pass by measuring nothing -
    // the same shape as an E2E that silently skips because its selector
    // never matched.
    const response = await page.goto("/");
    const header = response?.headers()["content-security-policy-report-only"];
    expect(header, "no Content-Security-Policy-Report-Only on the document").toBeTruthy();
    expect(header).toContain("script-src 'self'");
    expect(
        response?.headers()["content-security-policy"],
        "an ENFORCING policy reached the report-only phase",
    ).toBeUndefined();
});

test("the dashboard loads without a CSP violation", async ({page}) => {
    await page.goto("/");
    await page.getByTestId("dashboard-header").waitFor({state: "visible"});
    await expectNoViolations(page, "dashboard");
});

test("the article list loads without a CSP violation", async ({page}) => {
    await page.goto("/articles");
    await page.getByTestId("article-list-main-header").waitFor({state: "visible"});
    await expectNoViolations(page, "article list");
});

test("settings loads without a CSP violation", async ({page}) => {
    await page.goto("/settings");
    await page.getByTestId("settings-tab-about").click();
    await page.getByTestId("about-settings-content").waitFor({state: "visible"});
    await expectNoViolations(page, "settings");
});

test("the statistics page loads without a CSP violation", async ({page}) => {
    // The PageLayout testid, not the chart container: a fresh build has no
    // writing sessions, so the page renders its empty state and the
    // recharts SVG never mounts. That costs nothing here - recharts' inline
    // style attributes are covered by the same 'unsafe-inline' the editor
    // below exercises.
    await page.goto("/statistics");
    await page.getByTestId("statistics-dashboard-page").waitFor({state: "visible"});
    await expectNoViolations(page, "statistics");
});

test("the TipTap editor loads and takes content without a CSP violation", async ({page}) => {
    // The surface with the most inline style: TipTap's own node decorations,
    // KaTeX's per-glyph style attributes, and the editor chrome's computed
    // widths. The ARTICLE editor, not the book editor: a freshly created
    // book has no chapter yet, so its editor pane never mounts a
    // ProseMirror instance and there is nothing to type into.
    await page.goto("/articles/new");
    await page.getByTestId("create-article-title").fill("CSP Testartikel");
    await page.getByTestId("create-article-submit").click();
    await page.waitForURL(
        (url) => /\/articles\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new"),
        {timeout: 20_000},
    );
    const editor = page.locator(".ProseMirror").first();
    await editor.click();
    await page.keyboard.type("Ein Satz mit Inhalt.");
    await expectNoViolations(page, "article editor");
});

/** A fresh prose book, returning its `/book/{id}` path. */
async function createBook(page: Page, title: string): Promise<string> {
    await page.goto("/books/new?type=prose");
    await page.getByTestId("create-book-title").fill(title);
    const author = page.getByTestId("create-book-author");
    if (await author.isVisible()) await author.fill("Asterios Raptis");
    await page.getByTestId("create-book-submit").click();
    await page
        .getByRole("button", {name: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))})
        .first()
        .click();
    await page.waitForURL(/\/book\/[^/?]+/, {timeout: 20_000});
    return new URL(page.url()).pathname;
}

test("a blob: cover image loads without a CSP violation", async ({page}) => {
    test.setTimeout(60_000);
    // `img-src blob:` exists for the images useAssetUrl resolves out of
    // IndexedDB offline. Every page above renders only bundled images, so
    // the directive the offline build depends on most was never measured:
    // under enforcement a wrong one means every cover and figure in the
    // web app is a broken-image icon.
    const bookPath = await createBook(page, "CSP Cover-Buch");
    await page.goto(`${bookPath}?view=metadata`);
    await page.getByTestId("metadata-tab-design").click();
    await page.getByTestId("cover-upload-input").setInputFiles(COVER_FIXTURE);

    const preview = page.getByTestId("cover-preview-img");
    await expect(preview).toBeVisible({timeout: 15_000});
    await expect(preview).toHaveAttribute("src", /^blob:/);
    // Visible is not loaded: a blocked image keeps its box and its src.
    // naturalWidth is the only field that says the bytes arrived.
    await expect
        .poll(async () => preview.evaluate((img: HTMLImageElement) => img.naturalWidth), {
            timeout: 10_000,
        })
        .toBeGreaterThan(0);
    await expectNoViolations(page, "blob: cover image");
});

test("the export preview iframe renders without a CSP violation", async ({page}) => {
    test.setTimeout(60_000);
    // `frame-src 'self' blob:` exists for exactly this srcdoc iframe.
    // What this measures and what it cannot:
    //   - a frame-src violation fires in the PARENT, so it is caught here;
    //   - the frame is `sandbox=""`, hence an opaque origin, so a
    //     violation INSIDE it fires in the frame's own document and never
    //     reaches window.__cspViolations. The content assertion below
    //     covers the outcome that matters - a blocked frame is an empty
    //     one - but a dropped inline <style> inside would pass unseen.
    const bookPath = await createBook(page, "CSP Vorschau-Buch");
    const bookId = bookPath.split("/").pop();

    await page.getByTestId("chapter-add-trigger").click();
    await page.getByRole("menuitem", {name: /Neues Kapitel|New Chapter/}).click();
    await page.locator('[role="dialog"] input').fill("Kapitel mit Inhalt");
    await page.getByTestId("app-dialog-confirm").click();
    await expect(page.locator('[data-testid^="chapter-item-"]').first()).toBeVisible({
        timeout: 15_000,
    });
    const editor = page.locator(".ProseMirror").first();
    await editor.click();
    await page.keyboard.type("Ein Satz, der in der Vorschau stehen muss.");

    await page.goto(`/books/${bookId}/export`);
    await page.getByTestId("export-page-client-trigger").click();
    await page.getByTestId("client-export-preview").click();

    const frame = page.getByTestId("export-preview-frame");
    await expect(frame).toBeVisible({timeout: 15_000});
    const frameBody = page.frameLocator('[data-testid="export-preview-frame"]').locator("body");
    await expect(frameBody).toContainText("Kapitel mit Inhalt", {timeout: 15_000});
    await expectNoViolations(page, "export preview iframe");
});

test("the real service worker registers without a CSP violation", async ({page, context}) => {
    // The race below is 15s inside a 60s budget: a single step whose
    // timeout approaches the test timeout gets cut off mid-flight and
    // never spends what it was given.
    test.setTimeout(60_000);
    // The one surface the beforeEach deliberately removes. `worker-src
    // 'self' blob:` is there for the generated worker plus the
    // asset-intercept script it importScripts, and neither had ever been
    // evaluated under the policy - a wrong directive here is an app that
    // works on first load and serves nothing offline afterwards.
    await allowServiceWorker(context);
    await page.goto("/");
    await page.getByTestId("dashboard-header").waitFor({state: "visible"});

    const state = await page.evaluate(async () => {
        if (!("serviceWorker" in navigator)) return "unsupported";
        const registration = await Promise.race([
            navigator.serviceWorker.ready,
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 15_000)),
        ]);
        if (!registration) return "timeout";
        return registration.active?.state ?? "no-active-worker";
    });
    // Asserted, not logged: a worker that never registers would make the
    // violation check below pass by measuring nothing.
    expect(state, "the service worker did not reach an active state").toBe("activated");
    await expectNoViolations(page, "service worker registration");
});
