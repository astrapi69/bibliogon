/**
 * Manual-Testplan Section 5 — Settings.
 *
 * Closes the automatable gaps marked "Teilweise"/"Nein":
 *   - TC-050 Settings tabs reachable on mobile via the hamburger (600px),
 *     in addition to the desktop sidebar (settings-sidebar.spec.ts covers
 *     the desktop path; this adds the mobile dropdown path)
 *   - TC-052 language switch across all 8 catalogs renders translated, not
 *     raw, strings — the render-level pin the i18n key-parity test cannot
 *     give
 *
 * Themes (TC-051) are covered by themes.spec.ts + the verify-theme gate.
 */

import {test, expect} from "../fixtures/base";
import {SettingsPage, SETTINGS_TABS, UI_LANGUAGES, type UiLanguage} from "./pages/settings.page";
import {patchApp} from "./helpers/setup.helper";

test.describe("Section 5 — TC-050 mobile hamburger navigation", () => {
    test.beforeEach(async ({page}) => {
        await page.setViewportSize({width: 600, height: 900});
    });

    test("the hamburger trigger is shown on a mobile viewport", async ({page}) => {
        const settings = new SettingsPage(page);
        await settings.goto();
        await expect(settings.mobileTrigger).toBeVisible();
    });

    for (const tab of SETTINGS_TABS) {
        test(`hamburger navigates to the ${tab} tab and marks it active`, async ({page}) => {
            const settings = new SettingsPage(page);
            await settings.goto();
            await settings.clickTabMobile(tab);
            // aria-current lands on the (CSS-hidden but present) sidebar item.
            await settings.expectActive(tab);
        });
    }
});

test.describe("Section 5 — TC-052 language switch renders translated strings", () => {
    // ``default_language`` is a global app setting that the shared
    // resetSettings baseline does NOT restore, so a language change would
    // otherwise leak into every later test in the serial run. Reset to the
    // German default after each case.
    test.afterEach(async () => {
        await patchApp({app: {default_language: "de"}});
    });

    /**
     * A known UI string per language. The Settings page title
     * (``ui.settings.title``) is rendered on every Settings view and is
     * translated natively in all 8 catalogs, so it is a stable render-level
     * probe: if the catalog failed to load, the raw key
     * ``ui.settings.title`` would render instead.
     */
    const SETTINGS_TITLE: Record<UiLanguage, string> = {
        de: "Einstellungen",
        en: "Settings",
        es: "Ajustes",
        fr: "Paramètres",
        el: "Ρυθμίσεις",
        pt: "Definições",
        tr: "Ayarlar",
        ja: "設定",
    };

    for (const lang of UI_LANGUAGES) {
        test(`switching to ${lang} renders a translated (non-raw) UI`, async ({page}) => {
            const settings = new SettingsPage(page);
            await settings.selectLanguage(lang);
            // After save the i18n catalog reloads; the page must never show
            // a raw dotted key.
            await expect(page.locator("body")).not.toContainText("ui.settings.");
            await expect(page.locator("body")).not.toContainText("ui.common.");
        });
    }

    test("each language label resolves to its native string (spot check)", async ({page}) => {
        const settings = new SettingsPage(page);
        for (const lang of ["en", "fr", "ja"] as const) {
            await settings.selectLanguage(lang);
            await page.goto("/settings");
            await expect(
                page.getByText(SETTINGS_TITLE[lang], {exact: false}).first(),
            ).toBeVisible({timeout: 8_000});
        }
    });
});
