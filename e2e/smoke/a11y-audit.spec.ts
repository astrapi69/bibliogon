/**
 * Accessibility audit smoke (axe-core) — continues #43 (button-name).
 *
 * Visits each main route against the LIVE stack and runs axe-core's
 * WCAG 2.0 A + AA rule set, asserting zero violations. Unlike the
 * app's dev-mode console axe logging (advisory, easy to scroll past),
 * a failing assertion here is a hard gate: an a11y regression (a new
 * icon-only button without an aria-label, an unlabeled input, a
 * contrast drop) fails the smoke suite before it reaches users.
 *
 * Lives in the smoke project (fast, one axe pass per route) rather than
 * a dedicated CI job. axe RULES are never disabled to make this green —
 * a real violation is fixed in the component, not silenced here.
 */

import {test, expect} from "../fixtures/base";
import AxeBuilder from "@axe-core/playwright";

const ROUTES: {path: string; label: string}[] = [
    {path: "/", label: "Dashboard"},
    {path: "/books/new", label: "Create Book"},
    {path: "/articles", label: "Article Dashboard"},
    {path: "/settings", label: "Settings"},
    {path: "/settings?tab=about", label: "About"},
];

test.describe("a11y: WCAG 2.0 A/AA audit", () => {
    for (const route of ROUTES) {
        test(`a11y: ${route.label} (${route.path})`, async ({page}) => {
            await page.goto(route.path);
            await page.waitForLoadState("networkidle");

            const results = await new AxeBuilder({page})
                .withTags(["wcag2a", "wcag2aa"])
                .analyze();

            expect(results.violations).toEqual([]);
        });
    }
});
