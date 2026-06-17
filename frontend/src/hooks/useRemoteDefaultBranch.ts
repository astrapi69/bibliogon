import { useEffect, useState } from "react";

/**
 * Resolved remote default-branch lookup state.
 *
 * - `idle`: lookup not requested (a local branch is available, or no URL).
 * - `unsupported`: the URL is not a parseable `github.com/{owner}/{repo}`.
 * - `loading`: the GitHub API request is in flight.
 * - `ok`: the repository's default branch was resolved.
 * - `error`: the request failed (private repo, rate limit, offline).
 */
export type RemoteBranchState =
    | { status: "idle" }
    | { status: "unsupported" }
    | { status: "loading" }
    | { status: "ok"; branch: string }
    | { status: "error" };

const CACHE_PREFIX = "bibliogon.gh_default_branch:";

/**
 * Parse a GitHub repository URL into `{owner, repo}`.
 *
 * Accepts the `https://github.com/{owner}/{repo}` shape (with or without
 * a trailing `.git`, a trailing slash, or extra path segments). Returns
 * null for non-GitHub hosts and SSH/`git@` forms — the caller then shows
 * the "GitHub only" hint.
 */
export function parseGitHubRepo(url: string): { owner: string; repo: string } | null {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return null;
    }
    if (parsed.hostname !== "github.com" && parsed.hostname !== "www.github.com") {
        return null;
    }
    const segments = parsed.pathname.replace(/^\/+/, "").split("/");
    if (segments.length < 2) return null;
    const owner = segments[0];
    const repo = segments[1].replace(/\.git$/, "");
    if (!owner || !repo) return null;
    return { owner, repo };
}

function readCache(owner: string, repo: string): string | null {
    try {
        return sessionStorage.getItem(`${CACHE_PREFIX}${owner}/${repo}`);
    } catch {
        return null;
    }
}

function writeCache(owner: string, repo: string, branch: string): void {
    try {
        sessionStorage.setItem(`${CACHE_PREFIX}${owner}/${repo}`, branch);
    } catch {
        /* sessionStorage unavailable — skip caching, lookup still works */
    }
}

/**
 * Resolve a GitHub repository's default branch from the public REST API
 * (no token; 60 req/h is plenty for this read), used to surface a useful
 * branch line when no local clone exists (#363).
 *
 * The result is cached in `sessionStorage` per `{owner}/{repo}`, so a
 * repeated render or revisit within the session does not re-fetch. Only
 * runs when `enabled` is true — the caller gates this on "no local branch
 * available" so a present local branch never triggers a network call.
 */
export function useRemoteDefaultBranch(url: string | null, enabled: boolean): RemoteBranchState {
    const [state, setState] = useState<RemoteBranchState>({ status: "idle" });

    useEffect(() => {
        if (!enabled || !url) {
            setState({ status: "idle" });
            return;
        }
        const repo = parseGitHubRepo(url);
        if (!repo) {
            setState({ status: "unsupported" });
            return;
        }
        const cached = readCache(repo.owner, repo.repo);
        if (cached) {
            setState({ status: "ok", branch: cached });
            return;
        }

        let cancelled = false;
        const controller = new AbortController();
        setState({ status: "loading" });
        fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}`, {
            headers: { Accept: "application/vnd.github+json" },
            signal: controller.signal,
        })
            .then(async (response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data: { default_branch?: string } = await response.json();
                const branch = data.default_branch;
                if (!branch) throw new Error("no default_branch");
                if (cancelled) return;
                writeCache(repo.owner, repo.repo, branch);
                setState({ status: "ok", branch });
            })
            .catch(() => {
                if (!cancelled) setState({ status: "error" });
            });

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [url, enabled]);

    return state;
}
