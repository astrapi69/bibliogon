/**
 * MEDIUM-COMMENTS-UI-01 commit 3: tests for the read-only
 * editor-sidebar comments panel.
 *
 * The panel:
 * - Stays invisible while the first fetch is in flight
 *   (low-noise UX, no spinner)
 * - Shows an empty-state message when the API returns []
 * - Renders a card per comment with author + date + body
 * - Falls back to "Unknown" when author is null
 * - Surfaces an error banner on fetch failure
 */

import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import {render, screen, waitFor} from "@testing-library/react";

import ArticleCommentsPanel from "./ArticleCommentsPanel";
import type {ArticleComment} from "../../api/client";

// Lock the i18n hook to a t(key, fallback) -> fallback so the
// tests don't depend on the YAML catalog state.
vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "en",
        setLang: () => {},
    }),
}));

// Mock the api client so we don't touch the network. Factory
// default returns []; per the lessons-learned rule
// ("React 18 dev-mode double-effect-mount strands
// mockImplementationOnce"), tests must NOT use mockReset (it
// strips the factory default and leaves later mounts crashing
// on undefined.then). They override via mockResolvedValue /
// mockRejectedValue / mockImplementation (no Once) and we
// mockClear (not Reset) in afterEach to keep the default alive.
const getCommentsMock = vi.fn<(id: string) => Promise<ArticleComment[]>>(
    async () => [],
);
vi.mock("../../api/client", async () => {
    const actual = await vi.importActual<typeof import("../../api/client")>(
        "../../api/client",
    );
    return {
        ...actual,
        api: {
            articles: {
                getComments: (id: string) => getCommentsMock(id),
            },
        },
    };
});

beforeEach(() => {
    getCommentsMock.mockClear();
    getCommentsMock.mockImplementation(async () => []);
});

afterEach(() => {
    getCommentsMock.mockClear();
});

const COMMENT_ALPHA = {
    id: "c-alpha",
    author: "Alice",
    body_text: "First comment",
    body_json: null,
    language: "en",
    published_at: "2026-01-01T12:00:00+00:00",
    canonical_url: null,
    responds_to_article_id: "art-1",
    responds_to_url: null,
    imported_from: "medium",
    imported_at: "2026-05-01T00:00:00+00:00",
    source_filename: null,
    created_at: "2026-05-01T00:00:00+00:00",
    updated_at: "2026-05-01T00:00:00+00:00",
};

const COMMENT_BETA = {
    ...COMMENT_ALPHA,
    id: "c-beta",
    author: null,
    body_text: "Second comment\nwith a hard line break",
    published_at: null,
};

describe("ArticleCommentsPanel", () => {
    it("renders nothing while the first fetch is in flight", () => {
        // Promise never resolves -> the loading state should stay
        // invisible (no spinner, no heading).
        getCommentsMock.mockReturnValue(new Promise(() => {}));
        const {container} = render(<ArticleCommentsPanel articleId="art-1" />);
        expect(container.textContent).toBe("");
        expect(screen.queryByTestId("article-comments-panel")).toBeNull();
    });

    it("shows the empty-state message when API returns []", async () => {
        getCommentsMock.mockResolvedValue([]);
        render(<ArticleCommentsPanel articleId="art-1" />);
        const empty = await screen.findByTestId("article-comments-panel-empty");
        expect(empty.textContent).toContain("No comments imported");
        // List is not rendered when empty.
        expect(screen.queryByTestId("article-comments-panel-list")).toBeNull();
        // Count badge is not rendered for zero.
        expect(screen.queryByTestId("article-comments-panel-count")).toBeNull();
    });

    it("renders a card per comment with author + body + count badge", async () => {
        getCommentsMock.mockResolvedValue([COMMENT_ALPHA, COMMENT_BETA]);
        render(<ArticleCommentsPanel articleId="art-1" />);
        await screen.findByTestId("article-comment-c-alpha");

        const count = screen.getByTestId("article-comments-panel-count");
        expect(count.textContent).toContain("2");

        const alphaAuthor = screen.getByTestId(
            "article-comment-author-c-alpha",
        );
        expect(alphaAuthor.textContent).toBe("Alice");

        const alphaBody = screen.getByTestId(
            "article-comment-body-c-alpha",
        );
        expect(alphaBody.textContent).toBe("First comment");

        const betaBody = screen.getByTestId("article-comment-body-c-beta");
        // Newline preserved in DOM text (CSS white-space: pre-wrap renders it).
        expect(betaBody.textContent).toContain("hard line break");
    });

    it("falls back to 'Unknown' label when author is null", async () => {
        getCommentsMock.mockResolvedValue([COMMENT_BETA]);
        render(<ArticleCommentsPanel articleId="art-1" />);
        const author = await screen.findByTestId(
            "article-comment-author-c-beta",
        );
        expect(author.textContent).toBe("Unknown");
    });

    it("omits the date row when published_at is null", async () => {
        getCommentsMock.mockResolvedValue([COMMENT_BETA]);
        render(<ArticleCommentsPanel articleId="art-1" />);
        await screen.findByTestId("article-comment-c-beta");
        expect(screen.queryByTestId("article-comment-date-c-beta")).toBeNull();
    });

    it("renders the date when published_at is present", async () => {
        getCommentsMock.mockResolvedValue([COMMENT_ALPHA]);
        render(<ArticleCommentsPanel articleId="art-1" />);
        const date = await screen.findByTestId(
            "article-comment-date-c-alpha",
        );
        // English locale ("en") - the formatter outputs e.g. "Jan 1, 2026".
        expect(date.textContent).toMatch(/2026/);
    });

    it("shows an error banner when the fetch rejects", async () => {
        getCommentsMock.mockRejectedValue(new Error("boom"));
        render(<ArticleCommentsPanel articleId="art-1" />);
        const banner = await screen.findByTestId(
            "article-comments-panel-error",
        );
        // Non-ApiError rejection falls back to the i18n
        // "Could not load comments" message rather than echoing
        // the raw Error message.
        expect(banner.textContent).toContain("Could not load comments");
    });

    it("re-fetches when articleId changes", async () => {
        getCommentsMock.mockResolvedValue([]);
        const {rerender} = render(<ArticleCommentsPanel articleId="art-1" />);
        await waitFor(() => {
            expect(getCommentsMock).toHaveBeenCalledWith("art-1");
        });
        getCommentsMock.mockResolvedValue([]);
        rerender(<ArticleCommentsPanel articleId="art-2" />);
        await waitFor(() => {
            expect(getCommentsMock).toHaveBeenCalledWith("art-2");
        });
    });
});
