/**
 * Vitest coverage for useGitStatus (#358 / #359).
 *
 * - API mode (git-backup active): fetches status + sync-status and
 *   exposes branch + ahead/behind/state.
 * - Dexie mode (git-backup disabled): fires NO /api request and leaves
 *   branch/state null, matching the backendless PWA's zero-/api rule.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { useGitStatus } from "./useGitStatus";

let featureActive = true;
vi.mock("@astrapi69/feature-strategy-react", () => ({
    useFeature: () => ({ isActive: featureActive }),
}));

const mockStatus = vi.fn();
const mockSyncStatus = vi.fn();
vi.mock("../api/client", () => ({
    api: {
        git: {
            status: (...a: unknown[]) => mockStatus(...a),
            syncStatus: (...a: unknown[]) => mockSyncStatus(...a),
        },
    },
}));

describe("useGitStatus", () => {
    beforeEach(() => {
        featureActive = true;
        mockStatus.mockReset();
        mockSyncStatus.mockReset();
    });

    it("fetches branch + sync status in API mode", async () => {
        mockStatus.mockResolvedValue({ initialized: true, branch: "main" });
        mockSyncStatus.mockResolvedValue({ ahead: 0, behind: 2, state: "remote_ahead" });
        const { result } = renderHook(() => useGitStatus("b1"));
        await waitFor(() => expect(result.current.branch).toBe("main"));
        expect(result.current.initialized).toBe(true);
        expect(result.current.behind).toBe(2);
        expect(result.current.syncState).toBe("remote_ahead");
        expect(result.current.available).toBe(true);
    });

    it("fires NO /api request in Dexie mode", async () => {
        featureActive = false;
        const { result } = renderHook(() => useGitStatus("b1"));
        await waitFor(() => expect(result.current.available).toBe(false));
        expect(mockStatus).not.toHaveBeenCalled();
        expect(mockSyncStatus).not.toHaveBeenCalled();
        expect(result.current.branch).toBeNull();
    });
});
