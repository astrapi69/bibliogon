/**
 * Client-side GitHub import (#353).
 *
 * Imports files directly from a public (or, with a token, private) GitHub
 * repository through the GitHub REST API
 * (`GET /repos/{owner}/{repo}/contents/{path}`) — no git binary, so it works
 * in the backendless PWA exactly like the desktop. Listed entries are
 * downloaded as `File`s and routed through the existing client-side
 * {@link detectImportFormat} + {@link importFile} path, so a Markdown file
 * becomes a chapter, a folder of Markdown becomes one book with chapters, a
 * `.bgb`/JSON bundle runs the backup importer, and a Medium ZIP runs the
 * Medium importer — all via the `getStorage()` seam (zero `/api`).
 *
 * Only the GitHub REST API + raw download hosts are contacted; the optional
 * token is read from {@link getGitHubToken} and sent only to those hosts.
 */

import { detectImportFormat, type ImportFormat } from "./detectFormat";
import { importFile } from "./importRouter";
import type { ChapterImportTarget } from "./chapterImporters";

const GITHUB_API = "https://api.github.com";

/** A repository reference parsed from a user-entered URL or `owner/repo`. */
export interface GitHubRepoRef {
    owner: string;
    repo: string;
    /** Branch, tag or commit SHA; undefined means the repo's default branch. */
    ref?: string;
    /** Sub-path the URL pointed at ("" for the repository root). */
    path: string;
}

/** A single entry returned by the contents API. */
export interface GitHubEntry {
    name: string;
    path: string;
    type: "file" | "dir";
    size: number;
    download_url: string | null;
    sha: string;
}

/** Base class for every GitHub-import failure. */
export class GitHubImportError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "GitHubImportError";
    }
}

/** Thrown when the repository or path does not exist (HTTP 404). */
export class GitHubNotFoundError extends GitHubImportError {
    constructor(message = "Repository or path not found") {
        super(message);
        this.name = "GitHubNotFoundError";
    }
}

/** Thrown when the GitHub API rate limit is exhausted (HTTP 403/429). */
export class GitHubRateLimitError extends GitHubImportError {
    constructor(
        message = "GitHub API rate limit exceeded",
        public readonly resetAt?: Date,
    ) {
        super(message);
        this.name = "GitHubRateLimitError";
    }
}

const CHAPTER_FORMATS: readonly ImportFormat[] = ["markdown", "text", "html"];

/**
 * Parse a GitHub repository reference from a URL or an `owner/repo` shorthand.
 *
 * Accepts `https://github.com/owner/repo`, `.../tree/<ref>/<path>`,
 * `.../blob/<ref>/<path>`, a trailing `.git`, and the bare `owner/repo[/path]`
 * shorthand. Returns `null` for anything that is not a github.com reference.
 */
export function parseGitHubUrl(input: string): GitHubRepoRef | null {
    const trimmed = input.trim();
    if (!trimmed) return null;

    let segments: string[];
    if (/^https?:\/\//i.test(trimmed)) {
        let url: URL;
        try {
            url = new URL(trimmed);
        } catch {
            return null;
        }
        if (!/(^|\.)github\.com$/i.test(url.hostname)) return null;
        segments = url.pathname.replace(/^\/+|\/+$/g, "").split("/");
    } else {
        segments = trimmed.replace(/^\/+|\/+$/g, "").split("/");
    }

    if (segments.length < 2 || !segments[0] || !segments[1]) return null;
    const owner = segments[0];
    const repo = segments[1].replace(/\.git$/i, "");

    let ref: string | undefined;
    let path = "";
    if (segments.length >= 4 && (segments[2] === "tree" || segments[2] === "blob")) {
        ref = segments[3];
        path = segments.slice(4).join("/");
    } else if (!/^https?:\/\//i.test(trimmed) && segments.length > 2) {
        path = segments.slice(2).join("/");
    }

    return { owner, repo, ref, path };
}

function authHeaders(token?: string | null): HeadersInit {
    const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
}

async function githubFetch(url: string, token?: string | null): Promise<Response> {
    let response: Response;
    try {
        response = await fetch(url, { headers: authHeaders(token) });
    } catch (err) {
        throw new GitHubImportError(`Network error contacting GitHub: ${(err as Error).message}`);
    }
    if (response.status === 404) throw new GitHubNotFoundError();
    if (response.status === 403 || response.status === 429) {
        const remaining = response.headers.get("x-ratelimit-remaining");
        if (response.status === 429 || remaining === "0") {
            const reset = response.headers.get("x-ratelimit-reset");
            throw new GitHubRateLimitError(
                undefined,
                reset ? new Date(Number(reset) * 1000) : undefined,
            );
        }
        throw new GitHubImportError(`GitHub request forbidden (HTTP ${response.status})`);
    }
    if (!response.ok) {
        throw new GitHubImportError(`GitHub request failed (HTTP ${response.status})`);
    }
    return response;
}

/**
 * List the contents of a repository directory via the GitHub contents API.
 *
 * @param ref - the parsed repository reference (owner/repo/ref).
 * @param subPath - the directory path to list ("" for the repo root).
 * @param token - optional auth token (private repos / higher rate limit).
 * @returns the directory's files and sub-directories, dirs first then files,
 *   each group alphabetical.
 */
export async function listGitHubContents(
    ref: GitHubRepoRef,
    subPath: string,
    token?: string | null,
): Promise<GitHubEntry[]> {
    const query = ref.ref ? `?ref=${encodeURIComponent(ref.ref)}` : "";
    const cleanPath = subPath.replace(/^\/+|\/+$/g, "");
    const url =
        `${GITHUB_API}/repos/${encodeURIComponent(ref.owner)}/` +
        `${encodeURIComponent(ref.repo)}/contents/${cleanPath}${query}`;
    const response = await githubFetch(url, token);
    const json = (await response.json()) as unknown;
    const raw = Array.isArray(json) ? json : [json];
    const entries = raw
        .map((entry) => {
            const e = entry as Record<string, unknown>;
            return {
                name: String(e.name ?? ""),
                path: String(e.path ?? ""),
                type: e.type === "dir" ? "dir" : "file",
                size: Number(e.size ?? 0),
                download_url: (e.download_url as string | null) ?? null,
                sha: String(e.sha ?? ""),
            } satisfies GitHubEntry;
        })
        .filter((e) => e.type === "file" || e.type === "dir");
    return entries.sort((a, b) => {
        if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
}

/**
 * Download one repository file as a `File` for the import pipeline.
 *
 * The contents API's `download_url` already embeds a short-lived token for
 * private repos, so it is fetched without the auth header.
 */
export async function downloadGitHubFile(entry: GitHubEntry, token?: string | null): Promise<File> {
    const url = entry.download_url;
    if (!url) {
        throw new GitHubImportError(`No download URL for ${entry.path}`);
    }
    let response: Response;
    try {
        response = await fetch(url, token ? { headers: authHeaders(token) } : undefined);
    } catch (err) {
        throw new GitHubImportError(`Failed to download ${entry.path}: ${(err as Error).message}`);
    }
    if (!response.ok) {
        throw new GitHubImportError(`Failed to download ${entry.path} (HTTP ${response.status})`);
    }
    const blob = await response.blob();
    return new File([blob], entry.name, {
        type: blob.type || "application/octet-stream",
    });
}

/** Per-file outcome of a GitHub import run. */
export interface GitHubImportItemOutcome {
    path: string;
    name: string;
    status: "imported" | "skipped" | "error";
    format?: ImportFormat;
    message?: string;
}

/** Aggregate outcome of a GitHub import run. */
export interface GitHubImportSummary {
    items: GitHubImportItemOutcome[];
    importedCount: number;
    skippedCount: number;
    errorCount: number;
    /** Book the grouped chapter files landed in, if any were imported. */
    createdBookId?: string;
}

export interface RunGitHubImportOptions {
    token?: string | null;
    onProgress?: (done: number, total: number, current: string) => void;
}

/**
 * Download + import a set of selected repository file entries.
 *
 * Chapter-shaped files (Markdown/Text/HTML) are grouped into a single new book
 * (first file creates the book, the rest append as chapters); backup and
 * Medium files import independently. Unsupported files are skipped rather than
 * failing the whole run.
 */
export async function runGitHubImport(
    entries: GitHubEntry[],
    options: RunGitHubImportOptions = {},
): Promise<GitHubImportSummary> {
    const { token, onProgress } = options;
    const files = entries.filter((entry) => entry.type === "file");
    const items: GitHubImportItemOutcome[] = [];
    let importedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    let groupBookId: string | undefined;

    for (let i = 0; i < files.length; i++) {
        const entry = files[i];
        onProgress?.(i, files.length, entry.name);
        try {
            const file = await downloadGitHubFile(entry, token);
            const format = await detectImportFormat(file);
            if (format === "unknown") {
                items.push({ path: entry.path, name: entry.name, status: "skipped", format });
                skippedCount++;
                continue;
            }
            const target: ChapterImportTarget =
                CHAPTER_FORMATS.includes(format) && groupBookId
                    ? { kind: "existing-book", bookId: groupBookId }
                    : { kind: "new-book" };
            const result = await importFile(file, format, { target });
            if (result.kind === "chapter" && result.result.createdBook) {
                groupBookId = result.result.bookId;
            }
            items.push({ path: entry.path, name: entry.name, status: "imported", format });
            importedCount++;
        } catch (err) {
            items.push({
                path: entry.path,
                name: entry.name,
                status: "error",
                message: err instanceof Error ? err.message : String(err),
            });
            errorCount++;
        }
    }
    onProgress?.(files.length, files.length, "");

    return { items, importedCount, skippedCount, errorCount, createdBookId: groupBookId };
}
