/**
 * AI-keys overview smoke (issue #458).
 *
 * Pins the user-visible behaviour that surfaced the bug: after a key is
 * saved, navigating to Settings > AI must show a "Configured AI providers"
 * table where the saved key is visible (masked, first4...last4) with an
 * "Active" status - so the user can tell their key is still there.
 *
 *   1. a provider with a saved key shows masked preview + Active status
 *   2. an unconfigured provider shows Empty + an add button
 *   3. delete removes the key (confirm dialog) and the row flips to Empty
 *
 * The original ai config is captured + restored around each test so the
 * suite stays re-runnable.
 */

import { test, expect } from "../fixtures/base";

const API = "http://localhost:8000/api";

async function getAi(): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}/settings/app`);
  if (!res.ok) throw new Error(`GET app: ${res.status}`);
  const body = await res.json();
  return (body.ai as Record<string, unknown>) || {};
}

async function patchAi(ai: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${API}/settings/app`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ai }),
  });
  if (!res.ok) throw new Error(`PATCH ai: ${res.status} ${await res.text()}`);
}

test.describe("Settings - AI keys overview (#458)", () => {
  let original: Record<string, unknown> = {};

  test.beforeEach(async () => {
    original = await getAi();
    await patchAi({
      enabled: true,
      provider: "google",
      base_url: "https://generativelanguage.googleapis.com/v1beta/openai",
      model: "gemini-2.0-flash",
      api_key: "AIzaSyABCD1234efgh",
      provider_keys: {
        google: {
          api_key: "AIzaSyABCD1234efgh",
          model: "gemini-2.0-flash",
          base_url: "https://generativelanguage.googleapis.com/v1beta/openai",
        },
      },
    });
  });

  test.afterEach(async () => {
    await patchAi(original);
  });

  test("a saved key is visible (masked) and active after returning", async ({
    page,
  }) => {
    await page.goto("/settings?tab=ai");
    await expect(page.getByTestId("ai-provider-keys-table")).toBeVisible();

    // Language-independent: the masked preview is first4...last4, the row
    // is flagged active, and the active badge renders. (Status TEXT is
    // localized, so we assert the testid presence, not its words.)
    await expect(page.getByTestId("ai-provider-key-preview-google")).toHaveText(
      "AIza...efgh",
    );
    await expect(page.getByTestId("ai-provider-status-google")).toBeVisible();
    await expect(page.getByTestId("ai-provider-row-google")).toHaveAttribute(
      "data-active",
      "true",
    );
    await expect(
      page.getByTestId("ai-provider-active-badge-google"),
    ).toBeVisible();

    // An unconfigured provider has no key preview and offers an add button.
    await expect(page.getByTestId("ai-provider-key-preview-openai")).toHaveText(
      "-",
    );
    await expect(page.getByTestId("ai-provider-add-openai")).toBeVisible();
  });

  test("deleting a key flips the row to empty", async ({ page }) => {
    await page.goto("/settings?tab=ai");
    await expect(page.getByTestId("ai-provider-edit-google")).toBeVisible();

    await page.getByTestId("ai-provider-delete-google").click();
    // The AppDialog confirm is an in-app modal (not a native dialog).
    await page.getByTestId("app-dialog-confirm").click();

    await expect(page.getByTestId("ai-provider-key-preview-google")).toHaveText(
      "-",
    );
    await expect(page.getByTestId("ai-provider-add-google")).toBeVisible();
  });
});
