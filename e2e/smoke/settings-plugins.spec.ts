/**
 * Plugin-settings tab smoke (PLUGIN-SETTINGS-TESTID-COVERAGE-01).
 *
 * Pins the user-visible behaviour of the PluginSettings component
 * that was extracted from the monolithic Settings.tsx:
 *   1. plugin-settings root + install-trigger render
 *   2. an active non-core plugin's disable toggle round-trips
 *      through POST /api/settings/plugins/{name}/disable
 *   3. add-plugin trigger surfaces inactive (loaded-but-disabled)
 *      plugins in the available-list, and activating one calls
 *      POST /api/settings/plugins/{name}/enable
 *
 * Each test snapshots the current plugins.enabled/disabled config
 * before mutating and restores it in afterEach so the suite is
 * re-runnable even on failure. Plugin config state lives in
 * config/app.yaml, NOT in the DB, so /api/test/reset does NOT
 * cover this.
 */

import {test, expect} from "../fixtures/base";

const API = "http://localhost:8000/api";

type PluginsConfig = {enabled?: string[]; disabled?: string[]};

async function getPluginsConfig(): Promise<PluginsConfig> {
    const res = await fetch(`${API}/settings/app`);
    if (!res.ok) throw new Error(`GET app: ${res.status}`);
    const body = await res.json();
    return (body.plugins || {}) as PluginsConfig;
}

async function patchPluginsConfig(plugins: PluginsConfig): Promise<void> {
    const res = await fetch(`${API}/settings/app`, {
        method: "PATCH",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({plugins}),
    });
    if (!res.ok) throw new Error(`PATCH plugins: ${res.status} ${await res.text()}`);
}

test.describe("Settings - plugins tab", () => {
    let snapshot: PluginsConfig;

    test.beforeEach(async () => {
        snapshot = await getPluginsConfig();
    });

    test.afterEach(async () => {
        // Restore so a failing test does not leak state into the next
        // run. PATCH merges the keys, so explicit empty arrays here
        // overwrite any partial mutation.
        await patchPluginsConfig({
            enabled: snapshot.enabled || [],
            disabled: snapshot.disabled || [],
        });
    });

    test("plugin-settings root + install trigger render", async ({page}) => {
        await page.goto("/settings?tab=plugins");

        await expect(page.getByTestId("plugin-settings")).toBeVisible();
        await expect(page.getByTestId("plugin-install-trigger")).toBeVisible();
    });

    test("active non-core plugin row exposes the toggle testid", async ({page}) => {
        // Pick a plugin that we know is enabled + non-core in the
        // default config. ``translation`` is shipped enabled and
        // is not in CORE_PLUGINS (export, help, getstarted,
        // ms-tools), so the toggle button is rendered.
        const enabled = (snapshot.enabled || []).filter(
            (n) => !["export", "help", "getstarted", "ms-tools"].includes(n),
        );
        test.skip(enabled.length === 0, "no active non-core plugin to exercise the toggle on");

        const target = enabled[0];
        await page.goto("/settings?tab=plugins");

        await expect(page.getByTestId(`plugin-row-${target}`)).toBeVisible();
        await expect(page.getByTestId(`plugin-toggle-${target}`)).toBeVisible();
    });

    test("toggling an active plugin off persists to the backend", async ({page}) => {
        const enabled = (snapshot.enabled || []).filter(
            (n) => !["export", "help", "getstarted", "ms-tools"].includes(n),
        );
        test.skip(enabled.length === 0, "no active non-core plugin to disable");
        const target = enabled[0];

        await page.goto("/settings?tab=plugins");

        await page.getByTestId(`plugin-toggle-${target}`).click();

        // Backend records the disable. The frontend mutates
        // appConfig in place after the API call so the toggle
        // button may rerender or disappear; the backend state is
        // the authoritative signal.
        await expect
            .poll(async () => (await getPluginsConfig()).disabled || [])
            .toContain(target);
    });

    test("add-plugin trigger surfaces inactive plugins", async ({page}) => {
        // Pre-disable one plugin so the inactive list is
        // guaranteed non-empty. The afterEach will restore.
        const enabled = (snapshot.enabled || []).filter(
            (n) => !["export", "help", "getstarted", "ms-tools"].includes(n),
        );
        test.skip(enabled.length === 0, "no active non-core plugin to move into inactive");
        const target = enabled[0];

        await patchPluginsConfig({
            enabled: (snapshot.enabled || []).filter((n) => n !== target),
            disabled: [...(snapshot.disabled || []), target],
        });

        await page.goto("/settings?tab=plugins");

        // The Add-Plugin trigger only renders when inactive list
        // is non-empty. Click it to open the available-list.
        await expect(page.getByTestId("plugin-add-trigger")).toBeVisible();
        await page.getByTestId("plugin-add-trigger").click();

        await expect(page.getByTestId("plugin-available-list")).toBeVisible();
        await expect(page.getByTestId(`plugin-available-row-${target}`)).toBeVisible();
        await expect(page.getByTestId(`plugin-activate-${target}`)).toBeVisible();
    });

    test("activating an inactive plugin persists enable to backend", async ({page}) => {
        const enabled = (snapshot.enabled || []).filter(
            (n) => !["export", "help", "getstarted", "ms-tools"].includes(n),
        );
        test.skip(enabled.length === 0, "no active non-core plugin to round-trip");
        const target = enabled[0];

        // Move target into the inactive set so we can re-activate it.
        await patchPluginsConfig({
            enabled: (snapshot.enabled || []).filter((n) => n !== target),
            disabled: [...(snapshot.disabled || []), target],
        });

        await page.goto("/settings?tab=plugins");
        await page.getByTestId("plugin-add-trigger").click();
        await page.getByTestId(`plugin-activate-${target}`).click();

        // Backend records the re-enable: target leaves the disabled
        // list and lands back in enabled.
        await expect
            .poll(async () => (await getPluginsConfig()).enabled || [])
            .toContain(target);
        await expect
            .poll(async () => (await getPluginsConfig()).disabled || [])
            .not.toContain(target);
    });
});
