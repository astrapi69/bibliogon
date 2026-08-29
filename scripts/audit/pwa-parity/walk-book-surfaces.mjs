/**
 * THROWAWAY audit PoC (PWA parity audit 2026-08-29), part 2.
 *
 * Creates a book in the BUILT Dexie bundle (preview on :4173, no backend),
 * then walks the book-level surfaces the route walk cannot reach:
 * export page, git-backup, git-sync, metadata view + KDP wizard, and
 * records /api calls (must be zero), desktop-only hints, and the KDP
 * wizard's offline failure mode.
 *
 * Run:  node scripts/audit/pwa-parity/walk-book-surfaces.mjs
 * Throwaway; delete once the parity port queue is done.
 */
import { createRequire } from "node:module";

const require = createRequire(new URL("../../../e2e/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const BASE = "http://localhost:4173";

async function snapshot(page, label, report) {
    await page.waitForTimeout(700);
    const bodyText = await page.locator("body").innerText();
    const hints = ["Desktop-App", "desktop app", "nicht verf", "Offline"].filter((p) =>
        bodyText.includes(p),
    );
    report[label] = {
        url: page.url(),
        desktopHints: hints,
        excerpt: bodyText.replace(/\s+/g, " ").slice(0, 260),
    };
}

async function main() {
    const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
    const page = await browser.newPage();
    const apiCalls = [];
    page.on("request", (req) => {
        const url = new URL(req.url());
        if (url.pathname.startsWith("/api/")) apiCalls.push(`${req.method()} ${url.pathname}`);
    });

    const report = {};

    await page.goto(BASE + "/books/new", { waitUntil: "networkidle" });
    await page.getByTestId("create-book-title").waitFor({ state: "visible" });
    await page.waitForTimeout(1000);
    await page.getByTestId("create-book-title").fill("Parity Audit Buch");
    await page.getByTestId("create-book-author").fill("Audit");
    await page.getByTestId("create-book-submit").click();
    await page.waitForURL((url) => !url.pathname.includes("/books/new"), { timeout: 10_000 });
    await page.waitForTimeout(1000);
    const card = page.locator('[data-testid^="book-card-"]:not([data-testid*="-menu-"])').first();
    await card.waitFor({ state: "visible" });
    const cardTestId = await card.getAttribute("data-testid");
    const bookId = cardTestId.replace("book-card-", "");
    report.bookCreated = { bookId };

    await page.goto(`${BASE}/books/${bookId}/export`, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    const exportText = await page.locator("body").innerText();
    report.exportPage = {
        hasAudiobookFormat: /h.rbuch|audiobook/i.test(exportText),
        formats: exportText.replace(/\s+/g, " ").slice(0, 400),
    };

    await page.goto(`${BASE}/books/${bookId}/git-backup`, { waitUntil: "networkidle" });
    await snapshot(page, "gitBackup", report);

    await page.goto(`${BASE}/books/${bookId}/git-sync`, { waitUntil: "networkidle" });
    await snapshot(page, "gitSync", report);

    await page.goto(`${BASE}/book/${bookId}?view=metadata`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const kdpButton = page.getByRole("button", { name: /KDP/ });
    const kdpButtonCount = await kdpButton.count();
    report.kdpButton = { present: kdpButtonCount > 0 };
    if (kdpButtonCount > 0) {
        const disabled = await kdpButton.first().isDisabled();
        report.kdpButton.disabled = disabled;
        if (!disabled) {
            await kdpButton.first().click();
            await page.waitForTimeout(1500);
            const wizardText = await page.locator("body").innerText();
            report.kdpWizardStep0 = wizardText.replace(/\s+/g, " ").slice(0, 500);
        }
    }

    await browser.close();
    report.apiCalls = apiCalls;
    console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
