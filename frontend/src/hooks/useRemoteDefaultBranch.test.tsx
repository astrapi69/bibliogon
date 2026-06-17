/**
 * Vitest coverage for useRemoteDefaultBranch + parseGitHubRepo (#363).
 *
 * Four required categories per the bug-test policy:
 * 1. Reproduction (would be "error"/no-branch pre-fix; now resolves the
 *    remote default branch from the GitHub API).
 * 2. Happy path (public GitHub repo → default_branch).
 * 3. Edge cases (disabled, null/empty URL, missing default_branch,
 *    failed/private/rate-limited request).
 * 4. Boundaries (.git suffix, trailing slash, extra path segments,
 *    long + special-char names, slash-containing branch, non-GitHub URL,
 *    sessionStorage caching).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { parseGitHubRepo, useRemoteDefaultBranch } from "./useRemoteDefaultBranch";

function mockFetchOnce(body: unknown, ok = true, status = 200) {
    const fetchMock = vi.fn().mockResolvedValue({
        ok,
        status,
        json: async () => body,
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

describe("parseGitHubRepo", () => {
    it("parses a plain github URL", () => {
        expect(parseGitHubRepo("https://github.com/astrapi69/bibliogon")).toEqual({
            owner: "astrapi69",
            repo: "bibliogon",
        });
    });

    it("strips a .git suffix and a trailing slash", () => {
        expect(parseGitHubRepo("https://github.com/me/my-book.git/")).toEqual({
            owner: "me",
            repo: "my-book",
        });
    });

    it("ignores extra path segments (tree/branch)", () => {
        expect(parseGitHubRepo("https://github.com/o/r/tree/main")).toEqual({
            owner: "o",
            repo: "r",
        });
    });

    it("handles www.github.com and long + special-char names", () => {
        const longRepo = "die-souveraenitaet-des-musters_v2.0";
        expect(parseGitHubRepo(`https://www.github.com/astrapi69/${longRepo}`)).toEqual({
            owner: "astrapi69",
            repo: longRepo,
        });
    });

    it("rejects non-GitHub hosts, SSH form, garbage, and empty input", () => {
        expect(parseGitHubRepo("https://gitlab.com/o/r")).toBeNull();
        expect(parseGitHubRepo("git@github.com:o/r.git")).toBeNull();
        expect(parseGitHubRepo("https://github.com/onlyowner")).toBeNull();
        expect(parseGitHubRepo("not a url")).toBeNull();
        expect(parseGitHubRepo("")).toBeNull();
    });
});

describe("useRemoteDefaultBranch", () => {
    beforeEach(() => {
        sessionStorage.clear();
        vi.unstubAllGlobals();
    });

    // 1. Reproduction + 2. happy path
    it("resolves the GitHub default branch for a public repo", async () => {
        const fetchMock = mockFetchOnce({ default_branch: "develop" });
        const { result } = renderHook(() =>
            useRemoteDefaultBranch("https://github.com/astrapi69/bibliogon", true),
        );
        await waitFor(() => expect(result.current).toEqual({ status: "ok", branch: "develop" }));
        expect(fetchMock).toHaveBeenCalledWith(
            "https://api.github.com/repos/astrapi69/bibliogon",
            expect.objectContaining({ headers: expect.any(Object) }),
        );
    });

    // 3. Edge: disabled → no fetch, idle
    it("stays idle and fires no request when disabled", async () => {
        const fetchMock = mockFetchOnce({ default_branch: "main" });
        const { result } = renderHook(() =>
            useRemoteDefaultBranch("https://github.com/o/r", false),
        );
        await waitFor(() => expect(result.current.status).toBe("idle"));
        expect(fetchMock).not.toHaveBeenCalled();
    });

    // 3. Edge: null URL → idle
    it("stays idle for a null URL", async () => {
        const fetchMock = mockFetchOnce({ default_branch: "main" });
        const { result } = renderHook(() => useRemoteDefaultBranch(null, true));
        await waitFor(() => expect(result.current.status).toBe("idle"));
        expect(fetchMock).not.toHaveBeenCalled();
    });

    // 3. Edge: non-GitHub URL → unsupported, no fetch
    it("reports unsupported for a non-GitHub URL without fetching", async () => {
        const fetchMock = mockFetchOnce({ default_branch: "main" });
        const { result } = renderHook(() => useRemoteDefaultBranch("https://gitlab.com/o/r", true));
        await waitFor(() => expect(result.current.status).toBe("unsupported"));
        expect(fetchMock).not.toHaveBeenCalled();
    });

    // 3. Edge: private/rate-limited (non-ok) → error
    it("reports error on a non-ok response (private repo / rate limit)", async () => {
        mockFetchOnce({ message: "Not Found" }, false, 404);
        const { result } = renderHook(() =>
            useRemoteDefaultBranch("https://github.com/o/private", true),
        );
        await waitFor(() => expect(result.current.status).toBe("error"));
    });

    // 3. Edge: missing default_branch field → error
    it("reports error when default_branch is absent", async () => {
        mockFetchOnce({});
        const { result } = renderHook(() => useRemoteDefaultBranch("https://github.com/o/r", true));
        await waitFor(() => expect(result.current.status).toBe("error"));
    });

    // 3. Edge: network rejection → error
    it("reports error when the request rejects", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
        const { result } = renderHook(() => useRemoteDefaultBranch("https://github.com/o/r", true));
        await waitFor(() => expect(result.current.status).toBe("error"));
    });

    // 4. Boundary: slash-containing branch name survives
    it("preserves a slash in the branch name", async () => {
        mockFetchOnce({ default_branch: "feature/new-thing" });
        const { result } = renderHook(() => useRemoteDefaultBranch("https://github.com/o/r", true));
        await waitFor(() =>
            expect(result.current).toEqual({ status: "ok", branch: "feature/new-thing" }),
        );
    });

    // 4. Boundary: sessionStorage cache → second mount fires no fetch
    it("caches in sessionStorage and does not re-fetch on a second mount", async () => {
        const fetchMock = mockFetchOnce({ default_branch: "main" });
        const first = renderHook(() => useRemoteDefaultBranch("https://github.com/o/r", true));
        await waitFor(() => expect(first.result.current).toEqual({ status: "ok", branch: "main" }));
        expect(fetchMock).toHaveBeenCalledTimes(1);

        const second = renderHook(() => useRemoteDefaultBranch("https://github.com/o/r", true));
        await waitFor(() =>
            expect(second.result.current).toEqual({ status: "ok", branch: "main" }),
        );
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
