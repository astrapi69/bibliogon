/**
 * Manual-Testplan Section 6 — Feature-Gates (Offline / Dexie-Mode).
 *
 * TC-060..063 are inherently a backendless-build concern: the three-state
 * feature visibility (active / disabled-with-reason / hidden) and the
 * "zero /api request offline" guarantee only manifest when
 * VITE_STORAGE_MODE=dexie. The canonical coverage is
 * e2e/smoke/offline-pwa.spec.ts (and offline-ai-fill.spec.ts), which runs
 * against the separate static GitHub-Pages build with the hard
 * route.abort('**\/api/**') regression gate.
 *
 * This manual-automation suite drives the LIVE backend (apiStorage), where
 * every gated feature resolves to "active" — so there is nothing to assert
 * as "disabled with reason" here. These tests therefore SKIP in api mode
 * and document the contract; they execute only if the suite is ever run
 * against a dexie profile. Keeping the section present (not deleting it)
 * mirrors the manual test plan's structure.
 */

import {test, expect} from "../fixtures/base";
import {resolveStorageMode} from "./helpers/setup.helper";

test.describe("Section 6 — feature gates (offline only)", () => {
    test("FeatureNotice contract — covered by offline-pwa.spec.ts in dexie builds", async ({
        page,
    }) => {
        await page.goto("/settings");
        const mode = await resolveStorageMode(page);
        test.skip(
            mode !== "dexie",
            "Feature-gate states (disabled + reason, zero /api) only manifest on " +
                "the backendless dexie build; canonical coverage is " +
                "e2e/smoke/offline-pwa.spec.ts. This suite runs the live backend.",
        );

        // In a dexie profile the plugins tab disables plugin controls with a
        // requires_desktop_app reason and fires no /api request (TC-060).
        await page.goto("/settings?tab=plugins");
        await expect(page.getByTestId("feature-notice").first()).toBeVisible();
    });
});
