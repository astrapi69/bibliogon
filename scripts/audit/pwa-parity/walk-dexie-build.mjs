/**
 * THROWAWAY audit PoC (PWA parity audit 2026-08-29).
 *
 * Drives the BUILT Dexie-mode bundle (vite preview on :4173, no backend)
 * through every route, records:
 *   - every /api request fired (must be zero),
 *   - every visible desktop-only / disabled hint on the page,
 *   - zero-height collapse of main content (Playwright-visible is not
 *     user-visible),
 *   - console errors.
 *
 * Run:  cd e2e && node ../scripts/audit/pwa-parity/walk-dexie-build.mjs
 * Not wired into CI; delete freely once the parity port queue is done.
 *
 * @example
 *   node scripts/audit/pwa-parity/walk-dexie-build.mjs > /tmp/walk.json
 */
import { createRequire } from "node:module";

const require = createRequire(new URL("../../../e2e/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const BASE = "http://localhost:4173";

const ROUTES = [
    "/",
    "/books/new",
    "/articles",
    "/articles/new",
    "/articles/import/medium",
    "/settings",
    "/help",
    "/get-started",
    "/writing-history",
    "/statistics",
    "/help/shortcuts",
];

const DESKTOP_HINT_PATTERNS = [
    "Desktop-App",
    "desktop app",
    "Desktop App",
    "nicht verf",
    "not available",
];

async function main() {
    const browser = await chromium.launch({
        executablePath: "/opt/pw-browsers/chromium",
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();

    const apiCalls = [];
    const consoleErrors = [];
    page.on("request", (req) => {
        const url = new URL(req.url());
        if (url.pathname.startsWith("/api/")) apiCalls.push(`${req.method()} ${url.pathname}`);
    });
    page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 200));
    });

    const report = { routes: {}, apiCalls, consoleErrors };

    for (const route of ROUTES) {
        await page.goto(BASE + route, { waitUntil: "networkidle" });
        await page.waitForTimeout(800);
        const rootBox = await page.locator("#root").boundingBox();
        const bodyText = await page.locator("body").innerText();
        const hints = DESKTOP_HINT_PATTERNS.filter((p) => bodyText.includes(p));
        const disabledButtons = await page
            .locator("button[disabled]")
            .evaluateAll((els) =>
                els.map((e) => (e.getAttribute("title") || e.textContent || "").trim().slice(0, 80)),
            );
        report.routes[route] = {
            rootHeight: rootBox?.height ?? 0,
            desktopHints: hints,
            disabledButtons: disabledButtons.filter(Boolean),
            firstChars: bodyText.replace(/\s+/g, " ").slice(0, 160),
        };
    }

    await browser.close();
    console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
