/**
 * Pins the Writing-History view (WRITING-HISTORY-STATS-01 C2; extracted
 * from WritingHistoryModal in the Dialog->Pages migration C5):
 * - Summary cards render the fetched stats.
 * - The window buttons refetch for the chosen day-range.
 * - The CSV export serialises the client-side daily series (#744).
 * - Expanding a book row fetches + renders its per-chapter breakdown.
 *
 * recharts is mocked to plain divs (its SVG/ResponsiveContainer does
 * not render under happy-dom); the chart itself is covered by E2E.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FeatureTestProvider } from "../../features/FeatureTestProvider";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import WritingHistoryView from "./WritingHistoryView";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_k: string, f: string) => f,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

vi.mock("../../utils/platform/notify", () => ({ notify: { error: vi.fn() } }));

vi.mock("recharts", () => {
    const Passthrough = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
    return {
        ResponsiveContainer: Passthrough,
        BarChart: Passthrough,
        Bar: () => null,
        XAxis: () => null,
        YAxis: () => null,
        Tooltip: () => null,
    };
});

const summary = vi.fn();
const byBook = vi.fn();
const byChapter = vi.fn();
vi.mock("../../api/client", () => ({
    BASE: "http://test/api",
    api: {},
}));

const downloadBlob = vi.fn();
vi.mock("../../shared/utils/downloadBlob", () => ({
    downloadBlob: (...a: unknown[]) => downloadBlob(...a),
}));

vi.mock("../../storage", () => ({
    getStorage: () => ({
        writingStats: {
            summary: (...a: unknown[]) => summary(...a),
            byBook: (...a: unknown[]) => byBook(...a),
            byChapter: (...a: unknown[]) => byChapter(...a),
        },
    }),
}));

const SUMMARY = {
    total_words: 1234,
    days_active: 7,
    avg_per_active_day: 176,
    best_day: { day: "2026-06-01", words_written: 500 },
    current_streak: 3,
    longest_streak: 5,
    daily: [
        { day: "2026-05-31", words_written: 100 },
        { day: "2026-06-01", words_written: 500 },
    ],
};
const BOOKS = [
    { book_id: "b1", book_title: "Alpha", total_words: 800, daily: [] },
    { book_id: "b2", book_title: "Beta", total_words: 434, daily: [] },
];

describe("WritingHistoryView", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        summary.mockResolvedValue(SUMMARY);
        byBook.mockResolvedValue(BOOKS);
        byChapter.mockResolvedValue([
            { chapter_id: "c1", chapter_title: "Opening", total_words: 600 },
            { chapter_id: null, chapter_title: "", total_words: 200 },
        ]);
    });

    function renderModal() {
        return render(
            <FeatureTestProvider>
                <WritingHistoryView />
            </FeatureTestProvider>,
        );
    }

    it("renders summary cards from the fetched stats", async () => {
        renderModal();
        const cards = await screen.findByTestId("writing-history-summary");
        // Grouping is locale-dependent in the test env; compare digits only.
        const digits = cards.textContent?.replace(/[^0-9]/g, "");
        expect(digits).toContain("1234"); // total_words
        expect(digits).toContain("176"); // avg per active day
        expect(summary).toHaveBeenCalledWith(90); // default window
    });

    it("refetches for the chosen window", async () => {
        renderModal();
        await screen.findByTestId("writing-history-summary");
        fireEvent.click(screen.getByTestId("writing-history-window-30"));
        await waitFor(() => expect(summary).toHaveBeenCalledWith(30));
        expect(byBook).toHaveBeenCalledWith(30);
    });

    async function exportedCsv(): Promise<string> {
        await waitFor(() => expect(downloadBlob).toHaveBeenCalled());
        const [blob] = downloadBlob.mock.calls[0] as [Blob, string];
        return blob.text();
    }

    it("serialises the client-side daily series on export", async () => {
        renderModal();
        await screen.findByTestId("writing-history-summary");
        fireEvent.click(screen.getByTestId("writing-history-export-csv"));

        expect(await exportedCsv()).toBe(
            "day,words_written\r\n2026-05-31,100\r\n2026-06-01,500\r\n",
        );
        const [blob, filename] = downloadBlob.mock.calls[0] as [Blob, string];
        expect(blob.type).toContain("text/csv");
        expect(filename).toBe("writing-history-90d.csv");
    });

    it("exports the header alone when the window holds no sessions", async () => {
        summary.mockResolvedValue({ ...SUMMARY, daily: [] });
        renderModal();
        await screen.findByTestId("writing-history-empty");
        fireEvent.click(screen.getByTestId("writing-history-export-csv"));

        expect(await exportedCsv()).toBe("day,words_written\r\n");
    });

    it("exports the window the user selected, not the default one", async () => {
        renderModal();
        await screen.findByTestId("writing-history-summary");
        fireEvent.click(screen.getByTestId("writing-history-window-365"));
        await waitFor(() => expect(summary).toHaveBeenCalledWith(365));
        fireEvent.click(screen.getByTestId("writing-history-export-csv"));

        await waitFor(() => expect(downloadBlob).toHaveBeenCalled());
        const [, filename] = downloadBlob.mock.calls[0] as [Blob, string];
        expect(filename).toBe("writing-history-365d.csv");
    });

    it("uses the same client path on the desktop build, with no /api link", async () => {
        render(
            <FeatureTestProvider mode="dexie" hasAiKey={false}>
                <WritingHistoryView />
            </FeatureTestProvider>,
        );
        await screen.findByTestId("writing-history-summary");
        const button = screen.getByTestId("writing-history-export-csv");
        expect(button).not.toBeDisabled();
        expect(button.getAttribute("href")).toBeNull();
        fireEvent.click(button);

        expect(await exportedCsv()).toContain("2026-06-01,500");
    });

    it("expands a book row into its per-chapter breakdown", async () => {
        renderModal();
        await screen.findByTestId("writing-history-by-book");
        fireEvent.click(screen.getByTestId("writing-history-book-b1"));
        await waitFor(() => expect(byChapter).toHaveBeenCalledWith("b1", 90));
        const chapters = await screen.findByTestId("writing-history-chapters-b1");
        expect(chapters.textContent).toContain("Opening");
        // The deleted-chapter bucket (empty title) falls back to a label.
        expect(chapters.textContent).toContain("Gelöschte Kapitel");
    });
});
