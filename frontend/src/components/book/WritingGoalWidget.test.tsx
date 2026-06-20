/** Tests for WritingGoalWidget (WRITING-GOALS-PROGRESS-TRACKING-01).
 *
 * Pins the pure computeStreak logic (today-in-progress grace + gap
 * breaks) and the widget's today/streak render. Dates are computed
 * relative to "now" so the streak math is deterministic regardless of
 * the run date. */
import {describe, it, expect, vi, beforeEach} from "vitest"
import {render, screen, waitFor, fireEvent} from "@testing-library/react"

import WritingGoalWidget, {computeStreak} from "./WritingGoalWidget"
import {api, type WritingSession} from "../../api/client"

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_k: string, fb: string) => fb,
        lang: "en",
        setLang: vi.fn(),
    }),
}))

// Dialog->Pages C5: the Verlauf button navigates to /writing-history
// instead of opening a modal. Mock useNavigate to assert the route.
const navigateMock = vi.fn()
vi.mock("react-router-dom", async (orig) => ({
    ...(await orig<typeof import("react-router-dom")>()),
    useNavigate: () => navigateMock,
}))

vi.mock("../../api/client", async () => {
    const actual = await vi.importActual<typeof import("../../api/client")>("../../api/client")
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

    // #342: the widget belongs to the writing context. A user with no
    // writing sessions yet (fresh account / never wrote) sees nothing,
    // not a meaningless "0 / 500" goal.
    it("renders nothing when there are no writing sessions", async () => {
        ;(api.writingSessions.list as ReturnType<typeof vi.fn>).mockResolvedValue([])
        const {container} = render(<WritingGoalWidget />)
        // Give the resolved promise a tick to flush before asserting.
        await waitFor(() =>
            expect(api.writingSessions.list as ReturnType<typeof vi.fn>).toHaveBeenCalled(),
        )
        expect(container.querySelector('[data-testid="writing-goal-widget"]')).toBeNull()
    })

    it("renders nothing until the session fetch resolves", () => {
        ;(api.writingSessions.list as ReturnType<typeof vi.fn>).mockReturnValue(
            new Promise(() => {}),
        )
        const {container} = render(<WritingGoalWidget />)
        expect(container.querySelector('[data-testid="writing-goal-widget"]')).toBeNull()
    })

    // Regression pin for the "Verlauf button does nothing" report: the
    // history button must navigate to the /writing-history page (the
    // view's content + empty-state are pinned in WritingHistoryView.test).
    it("navigates to /writing-history when the Verlauf button is clicked", async () => {
        ;(api.writingSessions.list as ReturnType<typeof vi.fn>).mockResolvedValue([
            s(daysAgo(0), 120),
        ])
        render(<WritingGoalWidget />)
        await waitFor(() => expect(screen.getByTestId("writing-goal-widget")).toBeTruthy())
        fireEvent.click(screen.getByTestId("writing-goal-history-open"))
        expect(navigateMock).toHaveBeenCalledWith("/writing-history")
    })
})
