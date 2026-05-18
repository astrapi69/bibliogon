/**
 * Donation reminder App-level mount smoke (v0.35.1).
 *
 * Pre-v0.35.1 the S-03 reminder banner mounted only on the
 * Dashboard. v0.35.1 lifted it to App-level (above <Routes> in
 * ``App.tsx``) so the banner persists across navigation — every
 * page (Dashboard, Articles, Books, Settings, etc.) shows it
 * until the user actively dismisses via Support / Not now / X /
 * Escape.
 *
 * Three pins this spec asserts:
 *
 * 1. Banner appears when the v0.35.1 gates pass (7-day grace +
 *    onboardingSeen + no active cooldown).
 * 2. Banner persists across page navigation (Dashboard ->
 *    Articles -> Settings) — App-level mount contract.
 * 3. Dismiss via Escape key behaves like the "Not now" button:
 *    sets a 90-day cooldown + unmounts the banner.
 *
 * The gates are exercised by seeding localStorage via
 * ``page.addInitScript`` BEFORE navigation; otherwise a fresh
 * test would never see the banner (no first-use date, no
 * onboarding-seen flag).
 */

import {test, expect} from "../fixtures/base"

// Match the localStorage keys exported from
// frontend/src/components/DonationReminderBanner.tsx +
// DonationOnboardingDialog.tsx. Repeated here as string
// literals to avoid coupling the E2E spec to the frontend
// module's import graph.
const FIRST_USE_DATE_KEY = "bibliogon-first-use-date"
const REMINDER_NEXT_ALLOWED_KEY =
    "bibliogon-donation-reminder-next-allowed"
const DONATION_ONBOARDING_SEEN_KEY = "bibliogon-donation-onboarding-seen"

/**
 * Seed localStorage so the v0.35.1 gates pass:
 * - first-use 10 days ago (> 7-day grace)
 * - onboardingSeen flag set
 * - no active cooldown
 */
function seedReminderReady() {
    return async (): Promise<void> => {
        const tenDaysAgo = new Date()
        tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)
        localStorage.setItem(
            "bibliogon-first-use-date",
            tenDaysAgo.toISOString(),
        )
        localStorage.setItem(
            "bibliogon-donation-onboarding-seen",
            "true",
        )
        localStorage.removeItem(
            "bibliogon-donation-reminder-next-allowed",
        )
    }
}

test.describe("Donation reminder App-level mount (v0.35.1)", () => {
    test("Banner appears on Dashboard after 7-day grace + onboarding-seen", async ({
        page,
    }) => {
        await page.addInitScript(seedReminderReady())
        await page.goto("/")
        await expect(
            page.getByTestId("donation-reminder"),
        ).toBeVisible()
        // The 3 dismiss affordances all render.
        await expect(
            page.getByTestId("donation-reminder-support"),
        ).toBeVisible()
        await expect(
            page.getByTestId("donation-reminder-not-now"),
        ).toBeVisible()
        await expect(
            page.getByTestId("donation-reminder-close"),
        ).toBeVisible()
    })

    test("Banner does NOT appear when first-use is less than 7 days ago (grace gate)", async ({
        page,
    }) => {
        await page.addInitScript(async () => {
            // 3 days ago - inside the new 7-day grace window.
            const threeDaysAgo = new Date()
            threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
            localStorage.setItem(
                "bibliogon-first-use-date",
                threeDaysAgo.toISOString(),
            )
            localStorage.setItem(
                "bibliogon-donation-onboarding-seen",
                "true",
            )
        })
        await page.goto("/")
        // Give the App-level effect time to fetch config + decide.
        // Use a short waitForTimeout because the absence-of-banner
        // is the assertion; can't waitForSelector on nothing.
        await page.waitForTimeout(500)
        await expect(
            page.getByTestId("donation-reminder"),
        ).toHaveCount(0)
    })

    test("Banner persists across page navigation (App-level mount)", async ({
        page,
    }) => {
        await page.addInitScript(seedReminderReady())
        await page.goto("/")
        await expect(
            page.getByTestId("donation-reminder"),
        ).toBeVisible()

        // Navigate to Settings - banner must still be there.
        await page.goto("/settings")
        await expect(
            page.getByTestId("donation-reminder"),
        ).toBeVisible()

        // Navigate to Articles - banner must still be there.
        await page.goto("/articles")
        await expect(
            page.getByTestId("donation-reminder"),
        ).toBeVisible()

        // Navigate to Help - banner must still be there.
        await page.goto("/help")
        await expect(
            page.getByTestId("donation-reminder"),
        ).toBeVisible()
    })

    test("Escape key dismisses the banner with the dismissed cooldown semantics", async ({
        page,
    }) => {
        await page.addInitScript(seedReminderReady())
        await page.goto("/")
        await expect(
            page.getByTestId("donation-reminder"),
        ).toBeVisible()

        // Pre-check: no cooldown set yet.
        const beforeCooldown = await page.evaluate(
            (k) => localStorage.getItem(k),
            REMINDER_NEXT_ALLOWED_KEY,
        )
        expect(beforeCooldown).toBeNull()

        // Press Escape — should behave like "Not now" (90-day
        // cooldown) per the v0.35.1 a11y addition.
        await page.keyboard.press("Escape")
        await expect(
            page.getByTestId("donation-reminder"),
        ).toHaveCount(0)

        // Cooldown set to ≈ 90 days in the future.
        const afterCooldown = await page.evaluate(
            (k) => localStorage.getItem(k),
            REMINDER_NEXT_ALLOWED_KEY,
        )
        expect(afterCooldown).not.toBeNull()
        const cooldownDate = new Date(afterCooldown!)
        const daysAhead = Math.round(
            (cooldownDate.getTime() - Date.now()) /
                (1000 * 60 * 60 * 24),
        )
        expect(daysAhead).toBeGreaterThanOrEqual(89)
        expect(daysAhead).toBeLessThanOrEqual(91)
    })

    test("Banner has aria-live=polite for screen-reader announcement", async ({
        page,
    }) => {
        // v0.35.1 a11y addition: aria-live region so screen readers
        // announce the reminder when it first appears without
        // stealing focus. Polite (non-urgent reminder).
        await page.addInitScript(seedReminderReady())
        await page.goto("/")
        const banner = page.getByTestId("donation-reminder")
        await expect(banner).toBeVisible()
        await expect(banner).toHaveAttribute("aria-live", "polite")
        await expect(banner).toHaveAttribute("role", "region")
    })
})

// Avoid unused-import lint when only the FIRST_USE_DATE_KEY +
// DONATION_ONBOARDING_SEEN_KEY constants are referenced via
// string literals inside addInitScript bodies (which run in the
// browser, not Node, so the TS imports don't resolve there).
void FIRST_USE_DATE_KEY
void DONATION_ONBOARDING_SEEN_KEY
