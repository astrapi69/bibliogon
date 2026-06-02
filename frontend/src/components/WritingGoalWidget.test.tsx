/** Tests for WritingGoalWidget (WRITING-GOALS-PROGRESS-TRACKING-01).
 *
 * Pins the pure computeStreak logic (today-in-progress grace + gap
 * breaks) and the widget's today/streak render. Dates are computed
 * relative to "now" so the streak math is deterministic regardless of
 * the run date. */
import {describe, it, expect, vi, beforeEach} from "vitest"
import {render, screen, waitFor, fireEvent} from "@testing-library/react"

import WritingGoalWidget, {computeStreak} from "./WritingGoalWidget"
import {api, type WritingSession} from "../api/client"

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_k: string, fb: string) => fb,
        lang: "en",
        setLang: vi.fn(),
    }),
}))

vi.mock("../api/client", async () => {
    const actual = await vi.importActual<typeof import("../api/client")>("../api/client")
    return {
        ...actual,
        api: {
            ...actual.api,
            writingSessions: {list: vi.fn()},
            writingStats: {
                summary: vi.fn(),
                byBook: vi.fn(),
                byChapter: vi.fn(),
                exportCsvUrl: () => "http://localhost/csv",
            },
        },
    }
})

function daysAgo(n: number): string {
    // Local calendar date, matching WritingGoalWidget's local-date logic.
    const d = new Date()
    d.setDate(d.getDate() - n)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
}

const s = (day: string, words: number): WritingSession => ({day, words_written: words})

describe("computeStreak", () => {
    it("returns 0 for no sessions or non-positive goal", () => {
        expect(computeStreak([], 500)).toBe(0)
        expect(computeStreak([s(daysAgo(0), 999)], 0)).toBe(0)
    })

    it("counts consecutive days ending today when today is met", () => {
        const sessions = [s(daysAgo(0), 600), s(daysAgo(1), 500), s(daysAgo(2), 700)]
        expect(computeStreak(sessions, 500)).toBe(3)
    })

    it("counts from yesterday when today is not yet met (in-progress grace)", () => {
        const sessions = [s(daysAgo(0), 100), s(daysAgo(1), 500), s(daysAgo(2), 800)]
        expect(computeStreak(sessions, 500)).toBe(2)
    })

    it("breaks the streak on a missed day", () => {
        const sessions = [s(daysAgo(0), 600), s(daysAgo(1), 100), s(daysAgo(2), 900)]
        expect(computeStreak(sessions, 500)).toBe(1)
    })
})

describe("WritingGoalWidget", () => {
    beforeEach(() => {
        localStorage.clear()
        vi.clearAllMocks()
    })

    it("renders today's words + streak from the session history", async () => {
        ;(api.writingSessions.list as ReturnType<typeof vi.fn>).mockResolvedValue([
            s(daysAgo(0), 600),
            s(daysAgo(1), 700),
        ])
        render(<WritingGoalWidget />)
        await waitFor(() => {
            expect(screen.getByTestId("writing-goal-today")).toBeTruthy()
        })
        // Default goal 500; today 600 -> met, streak >= 2.
        expect(screen.getByTestId("writing-goal-today").textContent).toContain("600")
        expect(screen.getByTestId("writing-goal-streak")).toBeTruthy()
    })

    it("renders nothing until the session fetch resolves", () => {
        ;(api.writingSessions.list as ReturnType<typeof vi.fn>).mockReturnValue(
            new Promise(() => {}),
        )
        const {container} = render(<WritingGoalWidget />)
        expect(container.querySelector('[data-testid="writing-goal-widget"]')).toBeNull()
    })

    // Regression pin for the "Verlauf button does nothing" report: clicking
    // the history button must open the WritingHistoryModal and render content.
    it("opens the Writing-History modal when the Verlauf button is clicked", async () => {
        ;(api.writingSessions.list as ReturnType<typeof vi.fn>).mockResolvedValue([])
        ;(api.writingStats.summary as ReturnType<typeof vi.fn>).mockResolvedValue({
            total_words: 1234,
            days_active: 3,
            avg_per_active_day: 411,
            current_streak: 2,
            longest_streak: 5,
            daily: [{day: daysAgo(0), words_written: 600}],
        })
        ;(api.writingStats.byBook as ReturnType<typeof vi.fn>).mockResolvedValue([])
        render(<WritingGoalWidget />)
        await waitFor(() => expect(screen.getByTestId("writing-goal-widget")).toBeTruthy())
        // Modal not mounted-open before the click.
        expect(screen.queryByTestId("writing-history-modal")).toBeNull()
        fireEvent.click(screen.getByTestId("writing-goal-history-open"))
        const modal = await screen.findByTestId("writing-history-modal")
        expect(modal).toBeTruthy()
        // Real content renders (summary cards + chart), not a blank modal.
        expect(await screen.findByTestId("writing-history-summary")).toBeTruthy()
        expect(await screen.findByTestId("writing-history-chart")).toBeTruthy()
        // Locale-robust: the summary value 1234 renders with the env's
        // thousands separator (1,234 or 1.234); assert the digits survive.
        expect(modal.textContent?.replace(/[.,]/g, "")).toContain("1234")
    })

    // When the stats fetch fails, the modal must still open with an empty
    // state — never a silently-blank body.
    it("opens with an empty state when the stats fetch fails", async () => {
        ;(api.writingSessions.list as ReturnType<typeof vi.fn>).mockResolvedValue([])
        ;(api.writingStats.summary as ReturnType<typeof vi.fn>).mockRejectedValue(
            new Error("boom"),
        )
        ;(api.writingStats.byBook as ReturnType<typeof vi.fn>).mockRejectedValue(
            new Error("boom"),
        )
        render(<WritingGoalWidget />)
        await waitFor(() => expect(screen.getByTestId("writing-goal-widget")).toBeTruthy())
        fireEvent.click(screen.getByTestId("writing-goal-history-open"))
        expect(await screen.findByTestId("writing-history-modal")).toBeTruthy()
        expect(await screen.findByTestId("writing-history-empty")).toBeTruthy()
    })
})
