/**
 * Backup-export feedback smoke (#771).
 *
 * The server assembles the whole .bgb before the first byte (measured
 * 22 s / 987 MB on a 43-book library), so the click must acknowledge
 * itself immediately and must NOT leave a blank _blank tab behind -
 * that blank tab was the entire bug report.
 *
 * The real export is intercepted: pulling ~1 GB through the test would
 * be absurd, and the assertion is about the UI contract, not the bytes.
 */

import {test, expect, createBook} from "../fixtures/base";

test.describe("Backup export feedback", () => {
    test("click acknowledges immediately and opens no blank tab", async ({
        page,
        context,
    }) => {
        await createBook("Backup Feedback Buch");

        await page.route("**/api/backup/export*", (route) =>
            route.fulfill({
                status: 200,
                headers: {
                    "Content-Type": "application/octet-stream",
                    "Content-Disposition":
                        'attachment; filename="bibliogon-backup-test.bgb"',
                },
                body: "PK-test-archive",
            }),
        );

        await page.goto("/");
        const backupButton = page.getByTestId("backup-export-btn");
        await expect(backupButton).toBeEnabled({timeout: 10_000});

        const pagesBefore = context.pages().length;
        await backupButton.click();

        // Immediate acknowledgement - the whole point of the fix.
        const toast = page.locator(".Toastify__toast").filter({hasText: /Backup/i});
        await expect(toast.first()).toBeVisible({timeout: 5_000});

        // No second (blank) tab was opened.
        await page.waitForTimeout(500);
        expect(context.pages().length).toBe(pagesBefore);
    });
});
