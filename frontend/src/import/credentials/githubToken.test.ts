import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    LEGACY_TOKEN_KEY,
    deleteCredentialStore,
    loadGitHubToken,
    saveGitHubToken,
} from "./githubToken";

beforeEach(async () => {
    localStorage.clear();
    await deleteCredentialStore();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("GitHub token storage (#880)", () => {
    it("returns an empty string when no token was ever stored", async () => {
        expect(await loadGitHubToken()).toBe("");
    });

    it("stores the trimmed token in IndexedDB, never in localStorage", async () => {
        await saveGitHubToken("  github_pat_abc  ");
        expect(await loadGitHubToken()).toBe("github_pat_abc");
        expect(localStorage.getItem(LEGACY_TOKEN_KEY)).toBeNull();
        expect(JSON.stringify({ ...localStorage })).not.toContain("github_pat_abc");
    });

    it("deletes the stored token when saved empty or whitespace-only", async () => {
        await saveGitHubToken("github_pat_abc");
        await saveGitHubToken("   ");
        expect(await loadGitHubToken()).toBe("");
    });

    it("migrates a legacy localStorage token into IndexedDB and removes the old key", async () => {
        localStorage.setItem(LEGACY_TOKEN_KEY, "ghp_legacy");
        expect(await loadGitHubToken()).toBe("ghp_legacy");
        expect(localStorage.getItem(LEGACY_TOKEN_KEY)).toBeNull();
        expect(await loadGitHubToken()).toBe("ghp_legacy");
    });

    it("keeps the IndexedDB token when a stale legacy key also exists, and drops the legacy key", async () => {
        await saveGitHubToken("github_pat_new");
        localStorage.setItem(LEGACY_TOKEN_KEY, "ghp_old");
        expect(await loadGitHubToken()).toBe("github_pat_new");
        expect(localStorage.getItem(LEGACY_TOKEN_KEY)).toBeNull();
    });

    it("ignores a whitespace-only legacy value and still removes it", async () => {
        localStorage.setItem(LEGACY_TOKEN_KEY, "   ");
        expect(await loadGitHubToken()).toBe("");
        expect(localStorage.getItem(LEGACY_TOKEN_KEY)).toBeNull();
    });

    it("saving also removes a legacy key that was never read", async () => {
        localStorage.setItem(LEGACY_TOKEN_KEY, "ghp_old");
        await saveGitHubToken("github_pat_new");
        expect(localStorage.getItem(LEGACY_TOKEN_KEY)).toBeNull();
    });

    it("deleteCredentialStore removes the token completely", async () => {
        await saveGitHubToken("github_pat_abc");
        await deleteCredentialStore();
        expect(await loadGitHubToken()).toBe("");
    });

    it("still works when localStorage throws", async () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("storage disabled");
        });
        vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
            throw new Error("storage disabled");
        });
        await saveGitHubToken("github_pat_abc");
        expect(await loadGitHubToken()).toBe("github_pat_abc");
    });
});
