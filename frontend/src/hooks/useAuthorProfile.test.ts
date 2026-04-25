import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("../api/client", () => ({
    api: {
        settings: {
            getApp: vi.fn(),
        },
    },
}));

describe("useAuthorProfile", () => {
    let mockGetApp: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        const { api } = await import("../api/client");
        mockGetApp = vi.mocked(api.settings.getApp);
        mockGetApp.mockReset();
    });

    it("returns null when author config missing", async () => {
        mockGetApp.mockResolvedValue({});
        const { useAuthorProfile } = await import("./useAuthorProfile");
        const { result } = renderHook(() => useAuthorProfile());
        await waitFor(() => expect(mockGetApp).toHaveBeenCalled());
        expect(result.current).toBeNull();
    });

    it("returns null when both name and pen_names are empty", async () => {
        mockGetApp.mockResolvedValue({ author: { name: "", pen_names: [] } });
        const { useAuthorProfile } = await import("./useAuthorProfile");
        const { result } = renderHook(() => useAuthorProfile());
        await waitFor(() => expect(mockGetApp).toHaveBeenCalled());
        expect(result.current).toBeNull();
    });

    it("returns full profile with name + pen_names", async () => {
        mockGetApp.mockResolvedValue({
            author: { name: "Real Name", pen_names: ["Pen A", "Pen B"] },
        });
        const { useAuthorProfile } = await import("./useAuthorProfile");
        const { result } = renderHook(() => useAuthorProfile());
        await waitFor(() => {
            expect(result.current).toEqual({
                name: "Real Name",
                pen_names: ["Pen A", "Pen B"],
            });
        });
    });

    it("filters pen_name matching real name", async () => {
        mockGetApp.mockResolvedValue({
            author: {
                name: "Real Name",
                pen_names: ["Real Name", "Pen A"],
            },
        });
        const { useAuthorProfile } = await import("./useAuthorProfile");
        const { result } = renderHook(() => useAuthorProfile());
        await waitFor(() => {
            expect(result.current).toEqual({
                name: "Real Name",
                pen_names: ["Pen A"],
            });
        });
    });

    it("handles pen_names only (no real name)", async () => {
        mockGetApp.mockResolvedValue({
            author: { pen_names: ["Only Pen"] },
        });
        const { useAuthorProfile } = await import("./useAuthorProfile");
        const { result } = renderHook(() => useAuthorProfile());
        await waitFor(() => {
            expect(result.current).toEqual({
                name: "",
                pen_names: ["Only Pen"],
            });
        });
    });

    it("drops non-string entries from pen_names", async () => {
        mockGetApp.mockResolvedValue({
            author: {
                name: "Real",
                pen_names: ["Valid", 42, null, { o: 1 }, "Also Valid"],
            },
        });
        const { useAuthorProfile } = await import("./useAuthorProfile");
        const { result } = renderHook(() => useAuthorProfile());
        await waitFor(() => {
            expect(result.current).toEqual({
                name: "Real",
                pen_names: ["Valid", "Also Valid"],
            });
        });
    });

    it("silent fallback on API failure (returns null)", async () => {
        mockGetApp.mockRejectedValue(new Error("net"));
        const { useAuthorProfile } = await import("./useAuthorProfile");
        const { result } = renderHook(() => useAuthorProfile());
        await waitFor(() => expect(mockGetApp).toHaveBeenCalled());
        expect(result.current).toBeNull();
    });
});

describe("profileDisplayNames", () => {
    it("returns empty array for null", async () => {
        const { profileDisplayNames } = await import("./useAuthorProfile");
        expect(profileDisplayNames(null)).toEqual([]);
    });

    it("returns name + pen_names in order", async () => {
        const { profileDisplayNames } = await import("./useAuthorProfile");
        expect(
            profileDisplayNames({
                name: "Real",
                pen_names: ["Pen A", "Pen B"],
            }),
        ).toEqual(["Real", "Pen A", "Pen B"]);
    });

    it("skips empty real name", async () => {
        const { profileDisplayNames } = await import("./useAuthorProfile");
        expect(
            profileDisplayNames({ name: "", pen_names: ["Pen A"] }),
        ).toEqual(["Pen A"]);
    });
});
