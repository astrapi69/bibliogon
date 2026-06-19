/**
 * AI-keys overview smoke (issues #458 / #460).
 *
 * Pins the user-visible behaviour: after a key is saved, Settings > AI shows a
 * "Configured AI providers" table where the saved key is visible (masked,
 * first4...last4) with an active radio + Active status, and delete flips the
 * row to empty. Storage is the canonical active_provider + keys shape (#460).
 *
 * The original ai config is captured + restored around each test.
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

test.describe("Settings - AI keys overview (#460)", () => {
  let original: Record<string, unknown> = {};

  test.beforeEach(async () => {
    original = await getAi();
    await patchAi({
      enabled: true,
      active_provider: "google",
      keys: { google: "AIzaSyABCD1234efgh" },
      model_overrides: { google: "gemini-2.0-flash" },
      // mirror (what the app writes; the backend also reads these)
      provider: "google",
      api_key: "AIzaSyABCD1234efgh",
      model: "gemini-2.0-flash",
      base_url: "https://generativelanguage.googleapis.com/v1beta/openai",
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

    // Language-independent: masked preview is first4...last4, row is active,
    // the active radio is checked. (Status TEXT is localized.)
    await expect(page.getByTestId("ai-provider-key-preview-google")).toHaveText(
      "AIza...efgh",
    );
    await expect(page.getByTestId("ai-provider-row-google")).toHaveAttribute(
      "data-active",
      "true",
    );
    await expect(page.getByTestId("ai-provider-activate-google")).toBeChecked();

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
    await page.getByTestId("app-dialog-confirm").click();

    await expect(page.getByTestId("ai-provider-key-preview-google")).toHaveText(
      "-",
    );
    await expect(page.getByTestId("ai-provider-add-google")).toBeVisible();
  });
});
