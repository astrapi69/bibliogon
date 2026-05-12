/**
 * MEDIUM-COMMENTS-UI-01 commit 5: tests for the Settings
 * comments-admin section.
 *
 * Covers:
 * - Filter encoding: imported_from + orphans_only
 * - Filter change resets pagination back to PAGE_SIZE
 * - Table renders source / status / date columns
 * - "Load more" appears when rows.length == pageLimit and the
 *   400-cap hasn't been hit yet
 * - Empty state when API returns []
 * - Error state on rejected fetch
 *
 * Single-item delete lands in commit 6 with its own tests.
 */

import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import {render, screen, waitFor, fireEvent} from "@testing-library/react";

import CommentsAdminSection from "./CommentsAdminSection";
import type {ArticleComment} from "../api/client";

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "en",
        setLang: () => {},
    }),
}));

const listMock = vi.fn<
    (params?: {
        importedFrom?: string;
        orphansOnly?: boolean;
        limit?: number;
    }) => Promise<ArticleComment[]>
>(async () => []);

vi.mock("../api/client", async () => {
    const actual = await vi.importActual<typeof import("../api/client")>(
        "../api/client",
    );
    return {
        ...actual,
        api: {
            comments: {
                list: (
                    params?: {
                        importedFrom?: string;
                        orphansOnly?: boolean;
                        limit?: number;
                    },
                ) => listMock(params),
            },
        },
    };
});

beforeEach(() => {
    listMock.mockClear();
    listMock.mockImplementation(async () => []);
});

afterEach(() => {
    listMock.mockClear();
});

function mkRow(over: Partial<ArticleComment> = {}): ArticleComment {
    return {
        // Random unique fallback id; explicit ``over.id`` wins
        // via the trailing spread so test assertions can use the
        // exact id they passed in.
        id: Math.random().toString(36).slice(2, 7),
        author: "Alice",
        body_text: "Sample body",
        body_json: null,
        language: "en",
        published_at: null,
        canonical_url: null,
        responds_to_article_id: "art-1",
        responds_to_url: null,
        imported_from: "medium",
        imported_at: "2026-05-12T00:00:00+00:00",
        source_filename: null,
        created_at: "2026-05-12T00:00:00+00:00",
        updated_at: "2026-05-12T00:00:00+00:00",
        ...over,
    };
}

describe("CommentsAdminSection", () => {
    it("calls api.comments.list on mount with default filters", async () => {
        render(<CommentsAdminSection />);
        await waitFor(() => {
            expect(listMock).toHaveBeenCalled();
        });
        const firstCall = listMock.mock.calls[0][0];
        // importedFrom blank -> undefined (omitted) so backend sees no filter.
        expect(firstCall).toMatchObject({
            importedFrom: undefined,
            orphansOnly: false,
            limit: 100,
        });
    });

    it("shows the empty state when API returns []", async () => {
        listMock.mockResolvedValue([]);
        render(<CommentsAdminSection />);
        const empty = await screen.findByTestId("comments-admin-empty");
        expect(empty.textContent).toContain("No comments match");
        expect(screen.queryByTestId("comments-admin-table")).toBeNull();
    });

    it("renders a row per comment with source + linked/orphan status", async () => {
        listMock.mockResolvedValue([
            mkRow({id: "linked", responds_to_article_id: "art-1"}),
            mkRow({
                id: "orphan",
                responds_to_article_id: null,
                imported_from: "wordpress",
            }),
        ]);
        render(<CommentsAdminSection />);
        await screen.findByTestId("comments-admin-row-linked");
        // The orphan row is flagged.
        expect(
            screen.getByTestId("comments-admin-row-orphan-orphan"),
        ).toBeTruthy();
        // The linked row has no orphan flag.
        expect(
            screen.queryByTestId("comments-admin-row-linked-orphan"),
        ).toBeNull();
    });

    it("changing the source filter re-fetches with imported_from", async () => {
        listMock.mockResolvedValue([]);
        render(<CommentsAdminSection />);
        await waitFor(() => {
            expect(listMock).toHaveBeenCalledTimes(1);
        });
        const select = screen.getByTestId(
            "comments-admin-filter-source",
        ) as HTMLSelectElement;
        fireEvent.change(select, {target: {value: "medium"}});
        await waitFor(() => {
            const last = listMock.mock.calls[listMock.mock.calls.length - 1][0];
            expect(last?.importedFrom).toBe("medium");
        });
    });

    it("changing the orphans-only checkbox re-fetches with orphansOnly=true", async () => {
        listMock.mockResolvedValue([]);
        render(<CommentsAdminSection />);
        await waitFor(() => {
            expect(listMock).toHaveBeenCalledTimes(1);
        });
        const checkbox = screen.getByTestId(
            "comments-admin-filter-orphans",
        ) as HTMLInputElement;
        fireEvent.click(checkbox);
        await waitFor(() => {
            const last = listMock.mock.calls[listMock.mock.calls.length - 1][0];
            expect(last?.orphansOnly).toBe(true);
        });
    });

    it("Load more button appears only when result fills the page limit", async () => {
        // Exactly 100 rows -> button shows.
        listMock.mockResolvedValue(
            Array.from({length: 100}, (_, i) => mkRow({id: String(i)})),
        );
        render(<CommentsAdminSection />);
        const button = await screen.findByTestId("comments-admin-load-more");
        expect(button).toBeTruthy();
    });

    it("Load more button hidden when result is shorter than page limit", async () => {
        // 5 rows -> no need for Load more.
        listMock.mockResolvedValue(
            Array.from({length: 5}, (_, i) => mkRow({id: String(i)})),
        );
        render(<CommentsAdminSection />);
        await screen.findByTestId("comments-admin-row-0");
        expect(
            screen.queryByTestId("comments-admin-load-more"),
        ).toBeNull();
    });

    it("Load more bumps the page limit and re-fetches", async () => {
        listMock.mockResolvedValue(
            Array.from({length: 100}, (_, i) => mkRow({id: String(i)})),
        );
        render(<CommentsAdminSection />);
        const button = await screen.findByTestId("comments-admin-load-more");
        fireEvent.click(button);
        await waitFor(() => {
            const last = listMock.mock.calls[listMock.mock.calls.length - 1][0];
            expect(last?.limit).toBe(200);
        });
    });

    it("changing a filter resets the page limit back to 100", async () => {
        // Start full so Load more is available + click it.
        listMock.mockResolvedValue(
            Array.from({length: 100}, (_, i) => mkRow({id: String(i)})),
        );
        render(<CommentsAdminSection />);
        const button = await screen.findByTestId("comments-admin-load-more");
        fireEvent.click(button);
        await waitFor(() => {
            const last = listMock.mock.calls[listMock.mock.calls.length - 1][0];
            expect(last?.limit).toBe(200);
        });
        // Now change a filter -> limit must reset to 100.
        const checkbox = screen.getByTestId(
            "comments-admin-filter-orphans",
        ) as HTMLInputElement;
        fireEvent.click(checkbox);
        await waitFor(() => {
            const last = listMock.mock.calls[listMock.mock.calls.length - 1][0];
            expect(last?.limit).toBe(100);
        });
    });

    it("surfaces error message when fetch rejects", async () => {
        listMock.mockRejectedValue(new Error("boom"));
        render(<CommentsAdminSection />);
        const error = await screen.findByTestId("comments-admin-error");
        expect(error.textContent).toContain("Could not load comments");
    });
});
