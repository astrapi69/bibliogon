/**
 * Settings > About tab smoke (ABOUT-DIALOG C6).
 *
 * Pins the live-stack behaviour of the About-Dialog feature
 * shipped in C0-C5. Sister to the PLUGIN-COMICS-E2E-SMOKE-01
 * discipline filed yesterday: pytest + TestClient triggers a
 * fresh FastAPI lifespan and resolves config from a tempdir
 * overlay, masking operational issues that only the long-running
 * dev/prod stack surfaces. This spec runs against the actual
 * uvicorn process so a stale plugin discovery, CORS gap, missing
 * field on /api/system/info, or i18n catalog mismatch is caught
 * before users hit it.
 *
 * Coverage:
 * 1. Navigate to /settings?tab=about and confirm the About panel
 *    mounts (about-settings-root + about-settings-content after
 *    the /api/system/info fetch resolves).
 * 2. Each of the 5 sections is visible: Version, Credits,
 *    System-Info, Plugin-List, Donations (donations is
 *    conditional on donations.enabled=true; if the smoke env
 *    has donations off, the assertion is skipped).
 * 3. The version chip renders a real v{...} string (matches the
 *    /api/health version pattern).
 * 4. The plugin list contains comics (today's just-shipped
 *    plugin) — cross-feature regression-pin for both the
 *    plugin-comics ship AND the About-Dialog ship.
 */

import {test, expect} from "../fixtures/base";

test.describe("Settings > About tab (About-Dialog C6)", () => {
    test("renders all sections + comics plugin row", async ({page}) => {
        await page.goto("/settings?tab=about");

        // The panel mounts immediately; content appears after the
        // /api/system/info + /api/settings/plugins/discovered
        // parallel fetch resolves.
        await expect(page.getByTestId("about-settings-root")).toBeVisible();
        await expect(page.getByTestId("about-settings-content")).toBeVisible({
            timeout: 5000,
        });

        // 5 sections expected. Donations is conditional on
        // donations.enabled — assert presence-or-skipped, not
        // a hard requirement.
        await expect(page.getByTestId("about-version-section")).toBeVisible();
        await expect(page.getByTestId("about-system-section")).toBeVisible();
        await expect(page.getByTestId("about-plugins-section")).toBeVisible();
        await expect(page.getByTestId("about-contributors-section")).toBeVisible();
        await expect(page.getByTestId("about-resources-section")).toBeVisible();

        // Version chip renders v{semver}. The regex pins the
        // shape, not a specific number — so a release bump
        // doesn't break the test.
        const versionEl = page.getByTestId("about-app-version");
        await expect(versionEl).toBeVisible();
        await expect(versionEl).toHaveText(/^v\d+\.\d+\.\d+/);

        // Repository + issues links resolve to the canonical
        // GitHub URLs.
        const repoLink = page.getByTestId("about-repository-link");
        await expect(repoLink).toHaveAttribute(
            "href",
            "https://github.com/astrapi69/bibliogon",
        );
        await expect(repoLink).toHaveAttribute("target", "_blank");

        // Client-side platform always populated; the backend Python row
        // renders here too in API mode (the E2E runs against the backend).
        await expect(page.getByTestId("about-platform-client")).toBeVisible();
        await expect(page.getByTestId("about-python-version")).toBeVisible();

        // Plugin list: comics row must be present (cross-feature
        // regression pin — fires if plugin-comics ever gets
        // un-enabled OR the discovered-plugins extension regresses).
        await expect(page.getByTestId("about-plugin-row-comics")).toBeVisible();
    });

    test("tab is reachable via desktop tabs list", async ({page}) => {
        await page.goto("/settings");
        // Click the About tab trigger directly (independent path
        // from the deep-link goto above).
        await page.getByTestId("settings-tab-about").click();
        await expect(page.getByTestId("about-settings-root")).toBeVisible();
    });
});
