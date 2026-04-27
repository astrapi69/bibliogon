import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("../api/client", () => ({
    api: {
        settings: {
            getApp: vi.fn(),
        },
    },
}));

describe("useTopics", () => {
    let mockGetApp: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        const { api } = await import("../api/client");
        mockGetApp = vi.mocked(api.settings.getApp);
        mockGetApp.mockReset();
    });

    it("returns empty array when topics missing", async () => {
        mockGetApp.mockResolvedValue({});
        const { useTopics } = await import("./useTopics");
        const { result } = renderHook(() => useTopics());
        await waitFor(() => expect(result.current).toEqual([]));
    });

    it("returns string topics in declared order", async () => {
        mockGetApp.mockResolvedValue({ topics: ["Tech", "Writing", "Recipes"] });
        const { useTopics } = await import("./useTopics");
        const { result } = renderHook(() => useTopics());
        await waitFor(() => {
            expect(result.current).toEqual(["Tech", "Writing", "Recipes"]);
        });
    });

    it("trims and drops empty entries", async () => {
        mockGetApp.mockResolvedValue({
            topics: ["  Tech  ", "", "  ", "Writing"],
        });
        const { useTopics } = await import("./useTopics");
        const { result } = renderHook(() => useTopics());
        await waitFor(() => {
            expect(result.current).toEqual(["Tech", "Writing"]);
        });
    });

    it("drops non-string entries", async () => {
        mockGetApp.mockResolvedValue({
            topics: ["Tech", 42, null, { o: 1 }, "Writing"],
        });
        const { useTopics } = await import("./useTopics");
        const { result } = renderHook(() => useTopics());
        await waitFor(() => {
            expect(result.current).toEqual(["Tech", "Writing"]);
        });
    });

    it("returns empty array when topics is not an array", async () => {
        mockGetApp.mockResolvedValue({ topics: "not-a-list" });
        const { useTopics } = await import("./useTopics");
        const { result } = renderHook(() => useTopics());
        await waitFor(() => expect(result.current).toEqual([]));
    });

    it("stays null on API failure", async () => {
        mockGetApp.mockRejectedValue(new Error("net"));
        const { useTopics } = await import("./useTopics");
        const { result } = renderHook(() => useTopics());
        await waitFor(() => expect(mockGetApp).toHaveBeenCalled());
        expect(result.current).toBeNull();
    });
});
