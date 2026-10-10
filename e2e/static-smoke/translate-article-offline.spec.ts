/**
 * Article translation on the static Dexie build, with no backend (#751).
 *
 * `FEATURES.TRANSLATION` used to be DESKTOP_ONLY: both implementations -
 * DeepL and LMStudio - run through the backend plugin, so the panel sat
 * disabled with "requires the desktop app". Offline it now translates
 * through the user's own AI provider, which makes the gate a key rather
 * than a deployment.
 *
 * Asserted here rather than in Vitest because two things only hold against
 * the real built bundle: that the provider request goes to the provider
 * and not through `/api`, and that the key the user typed into Settings is
 * the one the translation actually uses.
 */

import {test, expect, type Page} from "@playwright/test";

const PROVIDER = "https://api.openai.com/**";

test.beforeEach(async ({context}) => {
    await context.route(/\/(registerSW\.js|sw\.js)(\?|$)/, (route) => route.abort());
    await context.addInitScript(() => {
        try {
            localStorage.setItem("bibliogon-donation-onboarding-seen", "true");
            localStorage.setItem("bibliogon-ai-setup-dismissed", "true");
            localStorage.setItem("bibliogon-migration-offered", "true");
        } catch {
            /* storage unavailable: the assertions below report it */
        }
    });
});

/** Answer every provider call by echoing the user message with a prefix,
 *  so each translated field is identifiable in the result.
 *
 *  The Settings AI tab also loads the model list from the same host
 *  (`GET /v1/models`, #451). That request carries no body, so it is answered
 *  from its own branch and kept out of `calls` - counting it would make the
 *  "the provider was never asked" assertion pass without a translation. */
async function stubProvider(page: Page, calls: string[]): Promise<void> {
    await page.route(PROVIDER, async (route) => {
        const request = route.request();
        if (request.method() !== "POST") {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({data: [{id: "gpt-4o-mini"}]}),
            });
            return;
        }
        const body = request.postDataJSON() as {
            messages?: {role: string; content: string}[];
        } | null;
        const user = (body?.messages ?? []).find((m) => m.role === "user")?.content ?? "";
        calls.push(user);
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                choices: [
                    {
                        message: {
                            content: user
                                .split("\n")
                                .map((line) => (line ? `EN: ${line}` : line))
                                .join("\n"),
                        },
                    },
                ],
                usage: {total_tokens: 7},
            }),
        });
    });
}

/** Configure an OpenAI key through the Settings UI, the way a user does. */
async function configureProviderKey(page: Page): Promise<void> {
    await page.goto("/settings?tab=ai");
    await expect(page.getByTestId("ai-provider-keys-table")).toBeVisible({timeout: 20_000});
    await page.getByTestId("ai-provider-add-openai").click();
    const keyInput = page.getByTestId("ai-api-key-input");
    await expect(keyInput).toBeVisible({timeout: 10_000});
    await keyInput.fill("sk-test-key-for-e2e");
    // Settings auto-save on change (#473), so leaving the field commits it.
    await keyInput.blur();
    // The table re-renders from the config the save returned, so the row
    // flipping from "add a key" to "remove this key" is the persisted-key
    // signal. A fixed wait would race the 500ms auto-save debounce.
    await expect(page.getByTestId("ai-provider-delete-openai")).toBeVisible({
        timeout: 20_000,
    });
}

async function createArticle(page: Page, title: string): Promise<string> {
    await page.goto("/articles/new");
    await page.getByTestId("create-article-title").fill(title);
    await page.getByTestId("create-article-submit").click();
    await page.waitForURL(
        (url) => /\/articles\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new"),
        {timeout: 20_000},
    );
    return new URL(page.url()).pathname;
}

test("an article translates through the configured provider, with no /api call", async ({
    page,
}) => {
    test.setTimeout(120_000);
    const apiCalls: string[] = [];
    page.on("request", (request) => {
        if (new URL(request.url()).pathname.includes("/api/")) apiCalls.push(request.url());
    });
    const providerCalls: string[] = [];
    await stubProvider(page, providerCalls);

    await configureProviderKey(page);
    await createArticle(page, "Artikel zum Uebersetzen");

    const open = page.getByTestId("article-editor-translate-open");
    await expect(open).toBeVisible({timeout: 20_000});
    // The gate: this button carried "requires the desktop app" before #751,
    // so an enabled one is the regression pin for the gate change as much
    // as for the port.
    await expect(open).toBeEnabled();
    await open.click();
    await page.getByTestId("article-editor-translate-submit").click();

    // The translated article opens on success.
    await page.waitForURL(
        (url) => /\/articles\/[^/]+$/.test(url.pathname) && url.pathname !== "/articles/new",
        {timeout: 60_000},
    );
    await expect(page.getByTestId("article-editor-title-text")).toContainText("EN:", {
        timeout: 20_000,
    });

    expect(providerCalls.length, "the provider was never asked").toBeGreaterThan(0);
    // The body goes to the provider as prose: a provider handed raw TipTap
    // translates its keys.
    for (const call of providerCalls) {
        expect(call).not.toContain('"type":"doc"');
    }
    expect(apiCalls, `offline translation hit the backend:\n${apiCalls.join("\n")}`).toEqual([]);
});

test("without a key the panel explains the key, not the desktop app", async ({page}) => {
    // Policy #78: visible and explained. Sending a PWA user to install an
    // application when what they need is an API key is the wrong place.
    await createArticle(page, "Artikel ohne Schluessel");
    const open = page.getByTestId("article-editor-translate-open");
    await expect(open).toBeVisible({timeout: 20_000});
    await expect(open).toBeDisabled();
    await expect(page.getByTestId("article-editor-translate-offline")).toBeVisible();
});
