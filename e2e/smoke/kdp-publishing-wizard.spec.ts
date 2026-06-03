/**
 * KDP Publishing Wizard smoke
 * (KDP-PUBLISHING-WIZARD-01 Phase 1 MVP C5 + Phase 2 C13).
 *
 * Exercises the wizard end-to-end:
 *   - create a prose book + chapter + minimum metadata via API
 *   - open BookMetadataEditor
 *   - click the new "Publish to KDP" button → wizard mounts
 *   - Step 0 MetadataChecklist: completes the metadata check;
 *     Next enables; advance
 *   - Step 1 CoverValidation: no cover present → fail-state +
 *     Back to fix it
 *
 * Phase 2 (C13) extends the spec with:
 *   - 5 step-dots render (was 3): metadata, cover, pricing, arc,
 *     export — visible regardless of which step the user is on.
 *   - Conflict-resolution banner: set up a book + persisted
 *     publishing-state via API, PATCH the book to bump
 *     ``updated_at``, reopen the wizard, verify the yellow
 *     banner renders + the dismiss button hides it.
 *
 * Full 5-step navigation (metadata → cover → pricing → arc →
 * export) requires a valid cover image that passes
 * ``625×1000`` + aspect-ratio gates; deferred to a more
 * elaborate fixture that uploads a real PNG. Today's smoke
 * covers the cases reachable without cover upload + the
 * conflict banner round-trip.
 *
 * Bounding-box-dimension assertion per the
 * "Playwright-visible != User-visible" lessons-learned rule:
 * the wizard dialog must render at non-zero height (> 200px so
 * a modal dialog with 5 steps + nav surface is plausibly
 * user-perceivable).
 *
 * Every interactive surface uses the
 * ``kdp-publishing-wizard-{step}-{slot}`` testid namespace per
 * the "Testid namespace pinning prevents silent E2E skips" rule.
 */

import {
    test,
    expect,
    createBook,
    createChapter,
    updateBook,
    updateKdpPublishingState,
} from "../fixtures/base";

test.describe("KDP Publishing Wizard smoke", () => {
    test("open wizard → advance step 0 → step 1 shows no-cover state", async ({
        page,
    }) => {
        // Setup: prose book with the minimum metadata + 1 chapter
        // so MetadataChecklist's gate opens.
        const book = await createBook("KDP Wizard Smoke", "E2E Author");
        await createChapter(book.id, "Chapter 1", "{}", "chapter");

        // Patch the book to add description (required field).
        // Node-side absolute URL: the page is still about:blank here
        // (first goto is below), so an in-browser relative fetch would
        // fail to parse the URL.
        await updateBook(book.id, {description: "Smoke test description."});

        // Open BookMetadataEditor via the ?view=metadata URL.
        await page.goto(`/book/${book.id}?view=metadata`);

        // Wait for the editor to mount.
        const openWizardBtn = page.getByTestId("metadata-open-kdp-wizard");
        await expect(openWizardBtn).toBeVisible({timeout: 10000});

        // Click "Publish to KDP" → wizard opens.
        await openWizardBtn.click();
        const dialog = page.getByTestId("kdp-publishing-wizard-dialog");
        await expect(dialog).toBeVisible();

        // Bounding-box dimension: the dialog must render at
        // non-zero height. 200px is well below the realistic
        // height (640px wide × content) but well above a
        // CSS-collapsed strip.
        const bbox = await dialog.boundingBox();
        expect(bbox).not.toBeNull();
        expect(bbox!.height).toBeGreaterThan(200);

        // Book title surfaces under the dialog title.
        await expect(
            page.getByTestId("kdp-publishing-wizard-book-title"),
        ).toContainText("KDP Wizard Smoke");

        // All 5 step-dots render (Phase 2 C9: metadata, cover,
        // pricing, arc, export).
        for (const i of [0, 1, 2, 3, 4]) {
            await expect(
                page.getByTestId(`kdp-publishing-wizard-step-dot-${i}`),
            ).toBeVisible();
        }

        // Step 0: MetadataChecklist mounts.
        await expect(
            page.getByTestId("kdp-publishing-wizard-step-0-metadata"),
        ).toBeVisible();

        // Wait for the API call to complete + summary to render.
        // Test fixture has all required fields, so summary-ok.
        await expect(
            page.getByTestId("kdp-publishing-wizard-step-0-summary-ok"),
        ).toBeVisible({timeout: 5000});

        // Next is enabled.
        const stepNext = page.getByTestId("kdp-publishing-wizard-step-0-next");
        await expect(stepNext).toBeEnabled();

        // Advance to Step 1.
        await stepNext.click();

        // Step 1: CoverValidation mounts. Test fixture has no
        // cover so we land on the no-cover state.
        await expect(
            page.getByTestId("kdp-publishing-wizard-step-1-cover"),
        ).toBeVisible();
        await expect(
            page.getByTestId("kdp-publishing-wizard-step-1-no-cover"),
        ).toBeVisible();

        // Next is disabled (no cover → cannot advance).
        const step1Next = page.getByTestId("kdp-publishing-wizard-step-1-next");
        await expect(step1Next).toBeDisabled();

        // Back navigates to Step 0 cleanly.
        await page.getByTestId("kdp-publishing-wizard-step-1-back").click();
        await expect(
            page.getByTestId("kdp-publishing-wizard-step-0-metadata"),
        ).toBeVisible();

        // Close cleanly via the X button.
        await page.getByTestId("kdp-publishing-wizard-close").click();
        await expect(dialog).not.toBeVisible();
    });

    test("C11 conflict banner appears when book is edited after pricing-state save", async ({
        page,
    }) => {
        // Setup: book + chapter + description, then a persisted
        // publishing-state row via API, then PATCH the book to
        // bump ``updated_at`` past the state's.
        const book = await createBook("KDP Conflict Smoke", "Author");
        await createChapter(book.id, "Chapter 1", "{}", "chapter");

        // Add description so the metadata gate would pass (even
        // though this test won't advance past metadata). Node-side
        // absolute URLs throughout — see the rationale in the test
        // above (page is about:blank until the goto below).
        await updateBook(book.id, {description: "Pre-conflict baseline."});

        // PATCH the publishing-state with a royalty plan. This
        // creates the row + sets state.updated_at to NOW.
        await updateKdpPublishingState(book.id, {royalty_plan: "70"});

        // Wait a moment so the next PATCH produces a strictly-
        // later timestamp than the publishing-state's.
        await page.waitForTimeout(1100);

        // Modify the book's metadata — this bumps book.updated_at.
        await updateBook(book.id, {description: "Edited after pricing save."});

        // Open the wizard. The mount-time fetch returns both
        // ``book_updated_at`` and ``state.updated_at``; book > state
        // → conflict banner renders.
        await page.goto(`/book/${book.id}?view=metadata`);
        const openWizardBtn = page.getByTestId(
            "metadata-open-kdp-wizard",
        );
        await expect(openWizardBtn).toBeVisible({timeout: 10000});
        await openWizardBtn.click();

        const banner = page.getByTestId(
            "kdp-publishing-wizard-conflict-banner",
        );
        await expect(banner).toBeVisible({timeout: 5000});

        // Dismiss button hides the banner.
        await page
            .getByTestId("kdp-publishing-wizard-conflict-dismiss")
            .click();
        await expect(banner).not.toBeVisible();

        // Close the wizard cleanly.
        await page.getByTestId("kdp-publishing-wizard-close").click();
    });
});
