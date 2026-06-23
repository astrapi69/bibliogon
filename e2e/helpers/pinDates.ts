import type {Page} from "@playwright/test";

/**
 * Fixed ISO timestamp the browser sees for every seeded book/article in the
 * visual-regression suite.
 *
 * Book/article cards render a server-derived ``updated_at`` via
 * ``formatLocaleDate`` (see BookCard / ArticleCard). That timestamp is set
 * by the backend at creation time, so it equals the real run date and would
 * drift the committed pixel baselines a day after they were taken - the
 * frozen *browser* clock does not change it because the value comes from the
 * server, not from ``new Date()``.
 *
 * {@link pinServerDates} normalizes the dates the *renderer* sees by
 * rewriting the browser's list responses; the seed calls (node-side
 * ``fetch`` in helpers/api.ts) bypass ``page.route`` and the database is
 * never touched - only the JSON the dashboard renders is pinned.
 */
export const VISUAL_FIXED_DATE = "2026-01-15T10:00:00.000Z";

/**
 * Pin ``created_at`` / ``updated_at`` to {@link VISUAL_FIXED_DATE} on the
 * browser's book + article list responses so server-derived card dates can
 * never drift the visual baselines. Register BEFORE the first navigation.
 *
 * @example
 *   await pinServerDates(page);
 *   await page.goto("/");
 */
export async function pinServerDates(page: Page): Promise<void> {
    const pin = (entity: unknown): unknown =>
        entity && typeof entity === "object"
            ? {
                  ...(entity as Record<string, unknown>),
                  created_at: VISUAL_FIXED_DATE,
                  updated_at: VISUAL_FIXED_DATE,
              }
            : entity;

    await page.route(/\/api\/(books|articles)(\?.*)?$/, async (route) => {
        const response = await route.fetch();
        let body: unknown;
        try {
            body = await response.json();
        } catch {
            await route.fulfill({response});
            return;
        }
        const patched = Array.isArray(body) ? body.map(pin) : pin(body);
        await route.fulfill({response, json: patched});
    });
}
