/**
 * Third-party host gate for the static build (#874).
 *
 * The static scan (`scripts/check_external_hosts.py`) sees stylesheets,
 * scripts, images and the service-worker precache. It cannot see a
 * `fetch()` a JavaScript module fires on its own - an update check, a
 * font loaded from code, a telemetry call. This spec runs the built dist
 * the way a visitor would and records EVERY request: any host that is not
 * the preview server and not allowlisted fails the run.
 *
 * Runs with `make test-static-smoke` (builds the Dexie bundle, serves it
 * with `vite preview`, no backend). The service worker is neutralised the
 * same way `static-smoke.spec.ts` does it: in `vite preview` over plain
 * http its registration stalls navigations, a preview artifact. Its
 * precache list is covered by the static scan instead.
 */

import {test, expect} from "@playwright/test";

// host -> written reason. Empty: since #881 the web app sends nothing to a
// third party on its own - the GitHub Releases check is off by default
// there. An entry here is a decision with a reason, not a fix.
const ALLOWED_HOSTS: Record<string, string> = {};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// The same surfaces static-smoke.spec.ts proves render, plus the data
// and stats pages. What matters is breadth of mounted code, not testids.
const ROUTES = [
    "/",
    "/articles",
    "/settings",
    "/books/new",
    "/articles/new",
    "/get-started",
    "/writing-history",
    "/statistics",
    "/portfolio",
    "/authors",
    "/help",
];

test.beforeEach(async ({context}) => {
    await context.route(/\/(registerSW\.js|sw\.js)(\?|$)/, (route) =>
        route.abort(),
    );
});

test("no route fires a request to a third-party host", async ({page}) => {
    const external = new Map<string, string>();
    const broken: string[] = [];
    // A preview that 404s the bundle never boots the app, and an app that
    // never boots fires no requests: "zero third-party hosts" would then
    // be vacuously true. Any same-origin 404 fails the run.
    page.on("response", (response) => {
        const url = new URL(response.url());
        if (LOCAL_HOSTS.has(url.hostname) && response.status() === 404) {
            broken.push(`${response.status()} ${url.pathname}`);
        }
    });
    page.on("request", (request) => {
        const url = new URL(request.url());
        if (LOCAL_HOSTS.has(url.hostname) || url.hostname in ALLOWED_HOSTS) return;
        if (url.protocol === "data:" || url.protocol === "blob:") return;
        external.set(
            `${url.origin}${url.pathname}`,
            `${request.resourceType()} while on ${page.url()}`,
        );
    });

    // Boot proof first: the dashboard root must render, and the update
    // hook (the one automatic call in the app) must have had time to run.
    await page.goto("/", {waitUntil: "networkidle"});
    await expect(page.getByTestId("new-book-group")).toBeVisible({timeout: 20_000});
    await page.waitForTimeout(3000);
    for (const route of ROUTES) {
        await page.goto(route, {waitUntil: "networkidle"});
        await page.waitForTimeout(500);
    }
    await page.reload({waitUntil: "networkidle"});
    await page.waitForTimeout(1000);

    expect(broken, "same-origin 404s: the preview does not serve this dist").toEqual([]);
    const report = [...external.entries()].map(([url, where]) => `${url}  (${where})`);
    expect(
        report,
        "third-party requests; self-host the resource or allowlist the host with a reason",
    ).toEqual([]);
});

test("every allowlisted host carries a written reason", () => {
    for (const [host, reason] of Object.entries(ALLOWED_HOSTS)) {
        expect(reason.trim(), `${host} is allowlisted without a reason`).not.toBe("");
    }
});

test("switching the update check on is visible to this capture (positive control, #881)", async ({page, context}) => {
    // Without a positive control, "zero third-party requests" above could
    // also mean the capture sees nothing. Turn the check on the way a user
    // does and require the one request it must send. The GitHub API is
    // answered locally, so no real request leaves the test machine.
    await context.addInitScript(() => {
        try {
            localStorage.setItem("bibliogon-donation-onboarding-seen", "true");
            localStorage.setItem("bibliogon-ai-setup-dismissed", "true");
            localStorage.setItem("bibliogon-migration-offered", "true");
        } catch {
            /* storage unavailable */
        }
    });
    await context.route("https://api.github.com/**", (route) =>
        route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({tag_name: "v0.0.1", html_url: "https://example.invalid/r", body: ""}),
        }),
    );
    const githubRequests: string[] = [];
    page.on("request", (request) => {
        if (new URL(request.url()).hostname === "api.github.com") githubRequests.push(request.url());
    });

    await page.goto("/", {waitUntil: "networkidle"});
    await expect(page.getByTestId("new-book-group")).toBeVisible({timeout: 20_000});
    await page.waitForTimeout(2000);
    expect(githubRequests, "default web profile must not call GitHub").toEqual([]);

    await page.goto("/settings", {waitUntil: "networkidle"});
    await page.getByTestId("settings-tab-verhalten").click();
    const toggle = page.getByTestId("settings-auto-check");
    await expect(toggle).not.toBeChecked();
    await toggle.check();
    // Deterministic: wait until the auto-save really committed to IndexedDB
    // before the full navigation, instead of a fixed sleep.
    await expect
        .poll(
            () =>
                page.evaluate(
                    () =>
                        new Promise<boolean>((resolve) => {
                            const open = indexedDB.open("bibliogon-offline");
                            open.onerror = () => resolve(false);
                            open.onsuccess = () => {
                                try {
                                    const read = open.result
                                        .transaction("appSettings")
                                        .objectStore("appSettings")
                                        .getAll();
                                    read.onsuccess = () =>
                                        resolve(
                                            JSON.stringify(read.result).includes(
                                                '"web_auto_check":true',
                                            ),
                                        );
                                    read.onerror = () => resolve(false);
                                } catch {
                                    resolve(false);
                                }
                            };
                        }),
                ),
            {timeout: 10_000},
        )
        .toBe(true);

    await page.goto("/", {waitUntil: "networkidle"});
    await expect.poll(() => githubRequests.length, {timeout: 15_000}).toBeGreaterThan(0);
    expect(githubRequests[0]).toContain("/repos/astrapi69/bibliogon/releases/latest");
});
