/**
 * Regression pin for the dialog "jump-to-center" bug.
 *
 * Symptom (user report): a shadcn-primitive dialog ("Aus Vorlage" /
 * New-from-template) appeared briefly toward the top-left, then snapped
 * to the center.
 *
 * Root cause: the shadcn `DialogContent` centered with Tailwind v4's
 * `-translate-x-1/2 -translate-y-1/2`, which in v4 emit the standalone
 * `translate:` CSS property. The `slideIn` enter-keyframe animates the
 * `transform:` property. `translate` and `transform` COMPOSE, so during
 * the 150ms animation the offset doubled (~-100%,-100%) and the dialog
 * sat up-and-left of center; when the animation ended (no fill-mode) the
 * keyframe `transform` was dropped, leaving only `translate` and snapping
 * it to true center. The steady state was always centered, which is why
 * the jump survived the existing component tests (happy-dom computes no
 * layout/animation) and a naive post-animation boundingBox check.
 *
 * Fix: center via the `transform` property (matching the `slideIn`
 * keyframe) so the keyframe and the base value share one property — no
 * double-offset, no jump.
 *
 * This spec is the deterministic pin: it asserts the centering mechanism
 * (computed `translate` must be "none"; the dialog must NOT carry its
 * centering on the conflicting `translate` property) PLUS the user-facing
 * contract (the dialog is centered in the viewport). A revert to
 * `-translate-x/y-1/2` makes `translate` non-"none" and fails here.
 *
 * data-testid selectors only.
 */

import {test, expect} from "../fixtures/base";

test.describe("Dialog centering (jump-to-center regression)", () => {
    test("new-from-template dialog centers via transform, not translate", async ({page}) => {
        await page.goto("/");

        // Desktop viewport: the trigger carries `hide-mobile`.
        await page.setViewportSize({width: 1280, height: 800});

        const trigger = page.getByTestId("new-book-from-template-btn");
        await expect(trigger).toBeVisible();
        await trigger.click();

        const dialog = page.getByTestId("new-from-template-dialog");
        await expect(dialog).toBeVisible();

        // --- Deterministic mechanism pin -----------------------------
        // Centering must live on `transform`, never on the `translate`
        // property (whose use alongside the transform-animating keyframe
        // is exactly the bug). `translate: none` proves the fix holds.
        const translateProp = await dialog.evaluate(
            (el) => getComputedStyle(el).translate,
        );
        expect(translateProp).toBe("none");

        const transformProp = await dialog.evaluate(
            (el) => getComputedStyle(el).transform,
        );
        // A real centering transform resolves to a matrix (not "none").
        expect(transformProp).not.toBe("none");

        // --- User-facing contract: centered in the viewport ----------
        // Sampled after the 150ms enter-animation settles. The dialog's
        // center must coincide with the viewport center within a small
        // tolerance. (The bug's FINAL state was also centered, so this
        // alone does not catch the transient jump — the mechanism pin
        // above does — but it guards the steady-state contract.)
        await page.waitForTimeout(250);
        const box = await dialog.boundingBox();
        expect(box).not.toBeNull();
        const viewport = page.viewportSize();
        expect(viewport).not.toBeNull();
        const dialogCenterX = box!.x + box!.width / 2;
        const dialogCenterY = box!.y + box!.height / 2;
        expect(Math.abs(dialogCenterX - viewport!.width / 2)).toBeLessThan(8);
        expect(Math.abs(dialogCenterY - viewport!.height / 2)).toBeLessThan(8);
    });
});
