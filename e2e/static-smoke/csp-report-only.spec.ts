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

import {test, expect, type Page} from "@playwright/test";

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

test.beforeEach(async ({context}) => {
    // Same as the sibling static-smoke specs: the service worker would
    // serve a precached bundle across tests. Its own worker-src is not
    // what this spec measures.
    await context.route(/\/(registerSW\.js|sw\.js)(\?|$)/, (route) => route.abort());
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

test("the statistics dashboard loads without a CSP violation", async ({page}) => {
    // recharts renders SVG with inline style attributes, so a style-src
    // without 'unsafe-inline' surfaces here first.
    await page.goto("/statistics");
    await page.getByTestId("statistics-dashboard").waitFor({state: "visible"});
    await expectNoViolations(page, "statistics");
});

test("the chapter editor loads without a CSP violation", async ({page}) => {
    // The surface with the most inline style: TipTap, KaTeX, and the
    // sidebar's computed widths. Created through the UI because this
    // build has no backend to seed against.
    await page.goto("/books/new?type=prose");
    await page.getByTestId("create-book-title").fill("CSP Testbuch");
    const author = page.getByTestId("create-book-author");
    if (await author.isVisible()) await author.fill("Asterios Raptis");
    await page.getByTestId("create-book-submit").click();
    await page.getByRole("button", {name: /CSP Testbuch/}).first().click();
    await page.waitForURL(/\/book\/[^/?]+/, {timeout: 20_000});
    await page.getByTestId("chapter-sidebar").waitFor({state: "visible"});
    await expectNoViolations(page, "chapter editor");
});
