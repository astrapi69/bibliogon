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

// host -> written reason. An entry here is a decision, not a fix: it says
// the app knowingly contacts this host on its own, and why. Everything
// else the build reaches is a user click or a user-started action (#874).
const ALLOWED_HOSTS: Record<string, string> = {
    "api.github.com":
        "GitHub Releases check (useUpdateAutoCheck, #477/#697): one GET of " +
        "/repos/astrapi69/bibliogon/releases/latest on app start, at most once " +
        "per interval, default daily. No token, no app data. The user turns it " +
        "off in Settings > Verhalten (auto_check / check_interval=never). Whether " +
        "the Pages build needs it at all next to the service-worker update flow " +
        "is an open decision recorded in #874.",
};

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
