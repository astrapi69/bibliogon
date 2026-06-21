/**
 * Page object for the Settings page (SETT-L-1 sidebar redesign).
 *
 * Desktop renders a left sidebar (`settings-tab-<id>`); at <=768px the
 * sidebar collapses to a hamburger dropdown (`settings-tabs-mobile-trigger`
 * + `settings-tab-<id>-mobile`). The object exposes both navigation paths
 * plus the language switcher (`settings-language` RadixSelect in Verhalten).
 */

import {expect, type Locator, type Page} from "@playwright/test";

/** The 13 sidebar tab ids, in sidebar order. */
export const SETTINGS_TABS = [
    "erscheinungsbild",
    "editor",
    "verhalten",
    "topics",
    "autoren",
    "comments",
    "plugins",
    "ai",
    "backups",
    "erweitert",
    "about",
    "support",
    "danger-zone",
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

/** The 8 shipped UI languages. */
export const UI_LANGUAGES = ["de", "en", "es", "fr", "el", "pt", "tr", "ja"] as const;
export type UiLanguage = (typeof UI_LANGUAGES)[number];

export class SettingsPage {
    constructor(private readonly page: Page) {}

    async goto(tab?: SettingsTab): Promise<void> {
        // The deep-link uses the underscore form for the danger zone.
        const param = tab ? `?tab=${tab.replace(/-/g, "_")}` : "";
        await this.page.goto(`/settings${param}`);
    }

    sidebarTab(tab: SettingsTab): Locator {
        return this.page.getByTestId(`settings-tab-${tab}`);
    }

    /** Desktop sidebar navigation. */
    async clickTab(tab: SettingsTab): Promise<void> {
        await this.sidebarTab(tab).click();
    }

    // --- mobile hamburger (TC-050) ---------------------------------------

    get mobileTrigger(): Locator {
        return this.page.getByTestId("settings-tabs-mobile-trigger");
    }

    /** Open the mobile hamburger menu and pick a tab. */
    async clickTabMobile(tab: SettingsTab): Promise<void> {
        await this.mobileTrigger.click();
        await this.page.getByTestId(`settings-tab-${tab}-mobile`).click();
    }

    /** Assert the active tab via aria-current on the sidebar item. */
    async expectActive(tab: SettingsTab): Promise<void> {
        await expect(this.sidebarTab(tab)).toHaveAttribute("aria-current", "page");
    }

    // --- language switcher (TC-052) --------------------------------------

    /** Pick a UI language via the Verhalten language RadixSelect + save.
     *
     * Awaits the LANGUAGE settings PATCH so the new ``default_language`` is
     * persisted before the caller navigates — otherwise a follow-up ``goto``
     * reloads the app while the write is still in flight and reads the stale
     * language (the TC-052 spot-check race).
     *
     * Two #485 robustness fixes over the naive "click + await any PATCH":
     *  - Re-selecting the already-active language fires NO auto-save (#472),
     *    so detect it via the open dropdown's checked item and return early
     *    instead of waiting forever for a PATCH that never comes.
     *  - Match the PATCH by body (``default_language === lang``), not just any
     *    ``/api/settings/app`` PATCH — a concurrent debounced save of another
     *    Verhalten field would otherwise resolve the wait early and let the
     *    caller navigate before the language write lands. */
    async selectLanguage(lang: UiLanguage): Promise<void> {
        await this.goto("verhalten");
        await this.page.getByTestId("settings-language-trigger").click();
        const item = this.page.getByTestId(`settings-language-item-${lang}`);
        await item.waitFor({state: "visible"});
        if ((await item.getAttribute("data-state")) === "checked") {
            // Already the active language: the click commits no change and
            // fires no PATCH. Close the dropdown and return — the app is
            // already rendering in `lang`.
            await this.page.keyboard.press("Escape");
            return;
        }
        const saved = this.page.waitForResponse((res) => {
            if (
                !res.url().includes("/api/settings/app") ||
                res.request().method() !== "PATCH" ||
                !res.ok()
            ) {
                return false;
            }
            try {
                // The Verhalten auto-save PATCHes a nested body:
                // { app: { default_language, ... }, behavior, ui }.
                return res.request().postDataJSON()?.app?.default_language === lang;
            } catch {
                return false;
            }
        });
        await item.click();
        await saved;
        // Let any trailing debounced auto-save flush before the caller
        // navigates. Rapid consecutive switches (the spot-check) can leave a
        // second PATCH in flight that races the follow-up goto and reverts the
        // persisted language; waiting for the network to settle pins it.
        await this.page.waitForLoadState("networkidle");
    }
}
