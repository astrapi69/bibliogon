import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import DataMaintenanceCard from "./DataMaintenanceCard";

const readEventLogMock = vi.fn();
const listImageCacheMock = vi.fn();

vi.mock("../../storage/storageStats", () => ({
    readEventLog: (...a: unknown[]) => readEventLogMock(...a),
    listImageCache: (...a: unknown[]) => listImageCacheMock(...a),
    formatBytes: (n: number) => `${n} B`,
}));

vi.mock("../../utils/platform/notify", () => ({
    notify: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const t = (_k: string, fallback: string) => fallback;

function renderCard(overrides: Partial<Parameters<typeof DataMaintenanceCard>[0]> = {}) {
    return render(
        <DataMaintenanceCard
            t={t}
            busy={false}
            onClearEventLog={vi.fn()}
            onClearImageCache={vi.fn()}
            cardClass="card"
            cardTitleClass="title"
            cardDescClass="desc"
            {...overrides}
        />,
    );
}

beforeEach(() => {
    readEventLogMock.mockReset();
    readEventLogMock.mockResolvedValue([]);
    listImageCacheMock.mockReset();
    listImageCacheMock.mockResolvedValue({ entries: [], count: 0, totalBytes: 0 });
});

describe("DataMaintenanceCard", () => {
    it("renders the show + clear buttons for both event log and image cache", () => {
        renderCard();
        expect(screen.getByTestId("data-show-event-log")).toBeTruthy();
        expect(screen.getByTestId("data-clear-event-log")).toBeTruthy();
        expect(screen.getByTestId("data-show-image-cache")).toBeTruthy();
        expect(screen.getByTestId("data-clear-image-cache")).toBeTruthy();
    });

    it("shows the event log preview with copy + download when events exist", async () => {
        readEventLogMock.mockResolvedValue([
            { type: "click", timestamp: 1000, text: "Save" },
        ]);
        renderCard();
        fireEvent.click(screen.getByTestId("data-show-event-log"));
        await waitFor(() =>
            expect(screen.getByTestId("data-event-log-text")).toBeTruthy(),
        );
        expect(screen.getByTestId("data-event-log-copy")).toBeTruthy();
        expect(screen.getByTestId("data-event-log-download")).toBeTruthy();
        expect(screen.getByTestId("data-event-log-text").textContent).toContain("Save");
    });

    it("shows an empty state when the event log has no entries", async () => {
        readEventLogMock.mockResolvedValue([]);
        renderCard();
        fireEvent.click(screen.getByTestId("data-show-event-log"));
        await waitFor(() =>
            expect(screen.getByTestId("data-event-log-empty")).toBeTruthy(),
        );
    });

    it("lists cached image filenames (names only) with the size total", async () => {
        listImageCacheMock.mockResolvedValue({
            entries: [
                { name: "hero.png", sizeBytes: 30, scope: "article" },
                { name: "cover.png", sizeBytes: 10, scope: "book" },
            ],
            count: 2,
            totalBytes: 40,
        });
        renderCard();
        fireEvent.click(screen.getByTestId("data-show-image-cache"));
        await waitFor(() =>
            expect(screen.getByTestId("data-image-cache-list")).toBeTruthy(),
        );
        const list = screen.getByTestId("data-image-cache-list");
        expect(list.textContent).toContain("hero.png");
        expect(list.textContent).toContain("cover.png");
    });

    it("invokes the parent clear handlers", () => {
        const onClearEventLog = vi.fn();
        const onClearImageCache = vi.fn();
        renderCard({ onClearEventLog, onClearImageCache });
        fireEvent.click(screen.getByTestId("data-clear-event-log"));
        fireEvent.click(screen.getByTestId("data-clear-image-cache"));
        expect(onClearEventLog).toHaveBeenCalledTimes(1);
        expect(onClearImageCache).toHaveBeenCalledTimes(1);
    });

    it("disables the clear buttons while busy", () => {
        renderCard({ busy: true });
        expect(
            (screen.getByTestId("data-clear-event-log") as HTMLButtonElement).disabled,
        ).toBe(true);
        expect(
            (screen.getByTestId("data-clear-image-cache") as HTMLButtonElement).disabled,
        ).toBe(true);
    });
});
