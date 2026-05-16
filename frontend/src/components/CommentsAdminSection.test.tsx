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

const deleteMock = vi.fn<(id: string) => Promise<void>>(async () => {});

const reclassifyAsArticleMock = vi.fn<
    (id: string) => Promise<{
        success: boolean;
        article_id: string;
        deleted_comment_id: string;
    }>
>(async (id) => ({success: true, article_id: "art-from-" + id, deleted_comment_id: id}));

const bulkDeleteMock = vi.fn<
    (
        ids: string[],
        permanent: boolean,
    ) => Promise<{
        deleted_count: number;
        skipped_already_trashed: string[];
        failed: {id: string; error: string}[];
    }>
>(async (ids) => ({
    deleted_count: ids.length,
    skipped_already_trashed: [],
    failed: [],
}));

// Bug 10: trash-lifecycle method mocks.
const listTrashedMock = vi.fn<() => Promise<ArticleComment[]>>(async () => []);
const restoreMock = vi.fn<(id: string) => Promise<ArticleComment>>(
    async (id) => ({
        id,
        author: null,
        body_text: "restored",
        body_json: null,
        language: "en",
        published_at: null,
        canonical_url: null,
        responds_to_article_id: null,
        responds_to_url: null,
        imported_from: "medium",
        imported_at: "2026-05-16T00:00:00+00:00",
        source_filename: null,
        created_at: "2026-05-16T00:00:00+00:00",
        updated_at: "2026-05-16T00:00:00+00:00",
    }),
);
const permanentDeleteMock = vi.fn<(id: string) => Promise<void>>(
    async () => {},
);
const emptyTrashMock = vi.fn<() => Promise<void>>(async () => {});
const bulkRestoreMock = vi.fn<
    (ids: string[]) => Promise<{
        restored_count: number;
        skipped_not_in_trash: string[];
        failed: {id: string; error: string}[];
    }>
>(async (ids) => ({
    restored_count: ids.length,
    skipped_not_in_trash: [],
    failed: [],
}));

const navigateMock = vi.fn();

const notifySuccess = vi.fn();
const notifyError = vi.fn();
const notifyBulkAction = vi.fn();
const confirmMock = vi.fn<(...args: unknown[]) => Promise<boolean>>(
    async () => true,
);

vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual<typeof import("react-router-dom")>(
        "react-router-dom",
    );
    return {
        ...actual,
        useNavigate: () => navigateMock,
    };
});

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
                delete: (id: string) => deleteMock(id),
                reclassifyAsArticle: (id: string) => reclassifyAsArticleMock(id),
                bulkDelete: (ids: string[], permanent: boolean) =>
                    bulkDeleteMock(ids, permanent),
                listTrashed: () => listTrashedMock(),
                restore: (id: string) => restoreMock(id),
                permanentDelete: (id: string) => permanentDeleteMock(id),
                emptyTrash: () => emptyTrashMock(),
                bulkRestore: (ids: string[]) => bulkRestoreMock(ids),
            },
        },
    };
});

vi.mock("./AppDialog", () => ({
    useDialog: () => ({
        confirm: (...args: unknown[]) => confirmMock(...args),
        prompt: vi.fn(),
        alert: vi.fn(),
        choose: vi.fn(),
    }),
}));

vi.mock("../utils/notify", () => ({
    notify: {
        success: (...args: unknown[]) => notifySuccess(...args),
        error: (...args: unknown[]) => notifyError(...args),
        info: vi.fn(),
        bulkAction: (...args: unknown[]) => notifyBulkAction(...args),
    },
}));

beforeEach(() => {
    listMock.mockClear();
    listMock.mockImplementation(async () => []);
    deleteMock.mockClear();
    deleteMock.mockImplementation(async () => {});
    reclassifyAsArticleMock.mockClear();
    reclassifyAsArticleMock.mockImplementation(async (id) => ({
        success: true,
        article_id: "art-from-" + id,
        deleted_comment_id: id,
    }));
    bulkDeleteMock.mockClear();
    bulkDeleteMock.mockImplementation(async (ids) => ({
        deleted_count: ids.length,
        skipped_already_trashed: [],
        failed: [],
    }));
    listTrashedMock.mockClear();
    listTrashedMock.mockImplementation(async () => []);
    restoreMock.mockClear();
    permanentDeleteMock.mockClear();
    permanentDeleteMock.mockImplementation(async () => {});
    emptyTrashMock.mockClear();
    emptyTrashMock.mockImplementation(async () => {});
    bulkRestoreMock.mockClear();
    bulkRestoreMock.mockImplementation(async (ids) => ({
        restored_count: ids.length,
        skipped_not_in_trash: [],
        failed: [],
    }));
    navigateMock.mockClear();
    notifySuccess.mockClear();
    notifyError.mockClear();
    notifyBulkAction.mockClear();
    confirmMock.mockClear();
    confirmMock.mockImplementation(async () => true);
});

afterEach(() => {
    listMock.mockClear();
    deleteMock.mockClear();
    reclassifyAsArticleMock.mockClear();
    bulkDeleteMock.mockClear();
    listTrashedMock.mockClear();
    restoreMock.mockClear();
    permanentDeleteMock.mockClear();
    emptyTrashMock.mockClear();
    bulkRestoreMock.mockClear();
    navigateMock.mockClear();
    notifySuccess.mockClear();
    notifyError.mockClear();
    notifyBulkAction.mockClear();
    confirmMock.mockClear();
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


// ---------------------------------------------------------------------------
// MEDIUM-COMMENTS-UI-01 commit 6: single-item delete flow
// ---------------------------------------------------------------------------

describe("CommentsAdminSection delete flow", () => {
    it("renders a delete button per row", async () => {
        listMock.mockResolvedValue([mkRow({id: "alpha"})]);
        render(<CommentsAdminSection />);
        const btn = await screen.findByTestId("comments-admin-delete-alpha");
        expect(btn).toBeTruthy();
    });

    it("opens the confirm dialog when delete is clicked", async () => {
        listMock.mockResolvedValue([mkRow({id: "alpha"})]);
        render(<CommentsAdminSection />);
        const btn = await screen.findByTestId("comments-admin-delete-alpha");
        fireEvent.click(btn);
        await waitFor(() => {
            expect(confirmMock).toHaveBeenCalledTimes(1);
        });
    });

    it("does not call api.comments.delete when the user cancels confirm", async () => {
        confirmMock.mockResolvedValueOnce(false);
        listMock.mockResolvedValue([mkRow({id: "alpha"})]);
        render(<CommentsAdminSection />);
        const btn = await screen.findByTestId("comments-admin-delete-alpha");
        fireEvent.click(btn);
        await waitFor(() => {
            expect(confirmMock).toHaveBeenCalledTimes(1);
        });
        // Give any pending microtasks a chance to drain.
        await Promise.resolve();
        expect(deleteMock).not.toHaveBeenCalled();
    });

    it("removes the row from the list on successful delete", async () => {
        listMock.mockResolvedValue([
            mkRow({id: "alpha", body_text: "First"}),
            mkRow({id: "beta", body_text: "Second"}),
        ]);
        render(<CommentsAdminSection />);
        const btn = await screen.findByTestId("comments-admin-delete-alpha");
        fireEvent.click(btn);
        await waitFor(() => {
            expect(deleteMock).toHaveBeenCalledWith("alpha");
        });
        await waitFor(() => {
            expect(screen.queryByTestId("comments-admin-row-alpha")).toBeNull();
        });
        // Beta remains untouched.
        expect(screen.getByTestId("comments-admin-row-beta")).toBeTruthy();
        expect(notifySuccess).toHaveBeenCalledTimes(1);
    });

    it("shows an error toast and keeps the row when delete fails", async () => {
        deleteMock.mockRejectedValueOnce(new Error("server down"));
        listMock.mockResolvedValue([mkRow({id: "alpha"})]);
        render(<CommentsAdminSection />);
        const btn = await screen.findByTestId("comments-admin-delete-alpha");
        fireEvent.click(btn);
        await waitFor(() => {
            expect(notifyError).toHaveBeenCalledTimes(1);
        });
        // Row stays in the list because the delete failed.
        expect(screen.getByTestId("comments-admin-row-alpha")).toBeTruthy();
        // No success toast on failure.
        expect(notifySuccess).not.toHaveBeenCalled();
    });

    it("substitutes the body preview into the confirm message", async () => {
        listMock.mockResolvedValue([
            mkRow({id: "alpha", body_text: "Hello there"}),
        ]);
        confirmMock.mockResolvedValueOnce(false);
        render(<CommentsAdminSection />);
        const btn = await screen.findByTestId("comments-admin-delete-alpha");
        fireEvent.click(btn);
        await waitFor(() => {
            expect(confirmMock).toHaveBeenCalled();
        });
        // confirm(title, message) signature - args[1] is the
        // message with the preview substituted.
        const [, message] = confirmMock.mock.calls[0] as [string, string];
        expect(message).toContain("Hello there");
    });

    it("truncates long body previews at 80 chars in the confirm message", async () => {
        const long = "x".repeat(200);
        listMock.mockResolvedValue([mkRow({id: "long", body_text: long})]);
        confirmMock.mockResolvedValueOnce(false);
        render(<CommentsAdminSection />);
        const btn = await screen.findByTestId("comments-admin-delete-long");
        fireEvent.click(btn);
        await waitFor(() => {
            expect(confirmMock).toHaveBeenCalled();
        });
        const [, message] = confirmMock.mock.calls[0] as [string, string];
        // Truncated to 80 chars + ellipsis -> the full 200 chars
        // do NOT appear, and an ellipsis IS present.
        expect(message).not.toContain("x".repeat(200));
        expect(message).toContain("...");
    });
});


// ---------------------------------------------------------------------------
// v0.32.0 F2c → Bug 4c: reclassify-as-article migrated from row button
// to the preview modal. The row no longer surfaces the action; tests
// fire it through ``comment-preview-reclassify`` after opening the modal
// via row click.
// ---------------------------------------------------------------------------

describe("CommentsAdminSection reclassify flow (via preview modal)", () => {
    it("Bug 4c regression pin: the row does NOT render a reclassify button", async () => {
        listMock.mockResolvedValue([mkRow({id: "alpha"})]);
        render(<CommentsAdminSection />);
        await screen.findByTestId("comments-admin-row-alpha");
        expect(
            screen.queryByTestId("comments-admin-reclassify-alpha"),
        ).toBeNull();
    });

    it("opens the confirm dialog when reclassify is clicked in the preview modal", async () => {
        listMock.mockResolvedValue([mkRow({id: "alpha"})]);
        render(<CommentsAdminSection />);
        const row = await screen.findByTestId("comments-admin-row-alpha");
        fireEvent.click(row);
        const btn = screen.getByTestId("comment-preview-reclassify");
        fireEvent.click(btn);
        await waitFor(() => {
            expect(confirmMock).toHaveBeenCalledTimes(1);
        });
        const [title] = confirmMock.mock.calls[0] as [string, string];
        expect(title).toContain("Move comment to articles");
    });

    it("does not call api.comments.reclassifyAsArticle when the user cancels", async () => {
        confirmMock.mockResolvedValueOnce(false);
        listMock.mockResolvedValue([mkRow({id: "alpha"})]);
        render(<CommentsAdminSection />);
        const row = await screen.findByTestId("comments-admin-row-alpha");
        fireEvent.click(row);
        fireEvent.click(screen.getByTestId("comment-preview-reclassify"));
        await waitFor(() => {
            expect(confirmMock).toHaveBeenCalledTimes(1);
        });
        await Promise.resolve();
        expect(reclassifyAsArticleMock).not.toHaveBeenCalled();
    });

    it("removes the row + fires the bulkAction toast on success", async () => {
        listMock.mockResolvedValue([
            mkRow({id: "alpha", body_text: "First"}),
            mkRow({id: "beta", body_text: "Second"}),
        ]);
        render(<CommentsAdminSection />);
        fireEvent.click(await screen.findByTestId("comments-admin-row-alpha"));
        fireEvent.click(screen.getByTestId("comment-preview-reclassify"));
        await waitFor(() => {
            expect(reclassifyAsArticleMock).toHaveBeenCalledWith("alpha");
        });
        await waitFor(() => {
            expect(screen.queryByTestId("comments-admin-row-alpha")).toBeNull();
        });
        // Beta still present.
        expect(screen.getByTestId("comments-admin-row-beta")).toBeTruthy();
        // Success toast fired (the action-button variant).
        expect(notifyBulkAction).toHaveBeenCalledTimes(1);
        // Modal closed (subject row no longer exists).
        await waitFor(() => {
            expect(screen.queryByTestId("comment-preview-modal")).toBeNull();
        });
    });

    it("the success toast's action callback navigates to the new article", async () => {
        listMock.mockResolvedValue([mkRow({id: "alpha"})]);
        reclassifyAsArticleMock.mockResolvedValueOnce({
            success: true,
            article_id: "new-article-id",
            deleted_comment_id: "alpha",
        });
        render(<CommentsAdminSection />);
        fireEvent.click(await screen.findByTestId("comments-admin-row-alpha"));
        fireEvent.click(screen.getByTestId("comment-preview-reclassify"));
        await waitFor(() => {
            expect(notifyBulkAction).toHaveBeenCalledTimes(1);
        });
        const args = notifyBulkAction.mock.calls[0] as [
            string,
            () => void,
            string,
        ];
        const onAction = args[1];
        onAction();
        expect(navigateMock).toHaveBeenCalledWith("/articles/new-article-id");
    });

    it("shows an error toast and keeps the row when reclassify fails", async () => {
        reclassifyAsArticleMock.mockRejectedValueOnce(new Error("server boom"));
        listMock.mockResolvedValue([mkRow({id: "alpha"})]);
        render(<CommentsAdminSection />);
        fireEvent.click(await screen.findByTestId("comments-admin-row-alpha"));
        fireEvent.click(screen.getByTestId("comment-preview-reclassify"));
        await waitFor(() => {
            expect(notifyError).toHaveBeenCalledTimes(1);
        });
        // Row stays — the move did not happen.
        expect(screen.getByTestId("comments-admin-row-alpha")).toBeTruthy();
        // No success toast on failure.
        expect(notifyBulkAction).not.toHaveBeenCalled();
        // Modal stays open on failure so the user can retry.
        expect(screen.getByTestId("comment-preview-modal")).toBeTruthy();
    });
});

// ---------------------------------------------------------------------------
// Bug 4a: bulk-delete wiring. Pins the selection-checkbox surface +
// the bar visibility rule + the row-delete reconciliation. The
// dropdown-menu open + permanent-delete confirm dialog interaction
// goes through Radix DropdownMenu + a portal, which happy-dom does
// not reliably simulate (see the lessons-learned rule about Radix +
// happy-dom). Those flows are pinned by the E2E spec instead.
// ---------------------------------------------------------------------------

describe("CommentsAdminSection bulk-delete wiring", () => {
    it("renders per-row + select-all checkboxes when rows are present", async () => {
        listMock.mockResolvedValue([
            mkRow({id: "row-1"}),
            mkRow({id: "row-2"}),
        ]);
        render(<CommentsAdminSection />);
        await screen.findByTestId("comments-admin-row-row-1");
        expect(
            screen.getByTestId("comments-admin-select-all"),
        ).toBeTruthy();
        expect(screen.getByTestId("comments-admin-select-row-1")).toBeTruthy();
        expect(screen.getByTestId("comments-admin-select-row-2")).toBeTruthy();
        // Bar starts hidden — count == 0.
        expect(screen.queryByTestId("comment-bulk-action-bar")).toBeNull();
    });

    it("toggling rows surfaces the bar at count >= 1", async () => {
        listMock.mockResolvedValue([
            mkRow({id: "row-1"}),
            mkRow({id: "row-2"}),
        ]);
        render(<CommentsAdminSection />);
        const cb = await screen.findByTestId("comments-admin-select-row-1");
        fireEvent.click(cb);
        expect(screen.getByTestId("comment-bulk-action-bar")).toBeTruthy();
        // Delete trigger disabled at count 1.
        const trigger = screen.getByTestId(
            "comment-bulk-delete-menu",
        ) as HTMLButtonElement;
        expect(trigger.disabled).toBe(true);
    });

    it("select-all + delete trigger enabled at count >= 2", async () => {
        listMock.mockResolvedValue([
            mkRow({id: "row-1"}),
            mkRow({id: "row-2"}),
            mkRow({id: "row-3"}),
        ]);
        render(<CommentsAdminSection />);
        const all = await screen.findByTestId("comments-admin-select-all");
        fireEvent.click(all);
        const bar = screen.getByTestId("comment-bulk-action-bar");
        expect(bar.textContent).toContain("3");
        const trigger = screen.getByTestId(
            "comment-bulk-delete-menu",
        ) as HTMLButtonElement;
        expect(trigger.disabled).toBe(false);
    });

    it("single-row delete also removes the row from selection (reconcile rule)", async () => {
        listMock.mockResolvedValue([
            mkRow({id: "row-1"}),
            mkRow({id: "row-2"}),
        ]);
        render(<CommentsAdminSection />);
        // Select both rows.
        fireEvent.click(await screen.findByTestId("comments-admin-select-row-1"));
        fireEvent.click(screen.getByTestId("comments-admin-select-row-2"));
        // Bar count == 2.
        expect(screen.getByTestId("comment-bulk-action-bar").textContent).toContain(
            "2",
        );
        // Delete row-1 via the per-row Trash button.
        fireEvent.click(screen.getByTestId("comments-admin-delete-row-1"));
        await waitFor(() =>
            expect(deleteMock).toHaveBeenCalledWith("row-1"),
        );
        // Bar count drops to 1 (row-1 removed from selection AND
        // visible list). Trigger therefore disabled at count 1.
        await waitFor(() => {
            const trigger = screen.queryByTestId(
                "comment-bulk-delete-menu",
            ) as HTMLButtonElement | null;
            // Bar still visible because row-2 still selected.
            expect(trigger).not.toBeNull();
            expect(trigger!.disabled).toBe(true);
        });
    });

    it("filter change clears the selection", async () => {
        listMock.mockResolvedValue([mkRow({id: "row-1"})]);
        render(<CommentsAdminSection />);
        fireEvent.click(await screen.findByTestId("comments-admin-select-row-1"));
        expect(screen.getByTestId("comment-bulk-action-bar")).toBeTruthy();
        // Flip orphans-only — the filter-change handler clears the
        // selection so the count drops to 0 and the bar hides.
        fireEvent.click(screen.getByTestId("comments-admin-filter-orphans"));
        await waitFor(() => {
            expect(screen.queryByTestId("comment-bulk-action-bar")).toBeNull();
        });
    });
});

// ---------------------------------------------------------------------------
// Bug 4b: row-click opens the CommentPreviewModal + body is JS-truncated.
// ---------------------------------------------------------------------------

describe("CommentsAdminSection preview modal + row truncation", () => {
    it("body cell renders truncated text past 120 chars + ellipsis", async () => {
        const long = "x".repeat(200);
        listMock.mockResolvedValue([mkRow({id: "long-1", body_text: long})]);
        render(<CommentsAdminSection />);
        const cell = await screen.findByTestId("comments-admin-body-long-1");
        // 120 chars + the ellipsis character.
        expect(cell.textContent!.length).toBe(121);
        expect(cell.textContent!.endsWith("…")).toBe(true);
        // Native title carries the full text for hover users.
        expect(cell.getAttribute("title")).toBe(long);
    });

    it("body cell renders full text when length <= 120", async () => {
        const short = "Short body";
        listMock.mockResolvedValue([mkRow({id: "short-1", body_text: short})]);
        render(<CommentsAdminSection />);
        const cell = await screen.findByTestId("comments-admin-body-short-1");
        expect(cell.textContent).toBe(short);
    });

    it("clicking a row opens the CommentPreviewModal with the full body", async () => {
        const long = "Full body text " + "y".repeat(200);
        listMock.mockResolvedValue([mkRow({id: "row-X", body_text: long})]);
        render(<CommentsAdminSection />);
        const row = await screen.findByTestId("comments-admin-row-row-X");
        fireEvent.click(row);
        const modal = screen.getByTestId("comment-preview-modal");
        expect(modal).toBeTruthy();
        // Modal body carries the FULL text — no truncation.
        expect(screen.getByTestId("comment-preview-body").textContent).toBe(long);
    });

    it("clicking the row's checkbox does NOT open the modal (stopPropagation)", async () => {
        listMock.mockResolvedValue([mkRow({id: "row-Y"})]);
        render(<CommentsAdminSection />);
        const cb = await screen.findByTestId("comments-admin-select-row-Y");
        fireEvent.click(cb);
        expect(screen.queryByTestId("comment-preview-modal")).toBeNull();
        // Selection toggled (bar appears).
        expect(screen.getByTestId("comment-bulk-action-bar")).toBeTruthy();
    });

    it("clicking the per-row delete button does NOT open the modal", async () => {
        listMock.mockResolvedValue([mkRow({id: "row-Z"})]);
        // Cancel the confirm dialog so the row isn't actually deleted.
        confirmMock.mockResolvedValue(false);
        render(<CommentsAdminSection />);
        const btn = await screen.findByTestId("comments-admin-delete-row-Z");
        fireEvent.click(btn);
        // Modal must NOT have opened.
        expect(screen.queryByTestId("comment-preview-modal")).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Bug 10: trash view-toggle + Restore / Permanent-Delete row actions +
// Empty-Trash CTA
// ---------------------------------------------------------------------------

describe("CommentsAdminSection trash view", () => {
    it("renders the trash-toggle button + badge when trash is non-empty", async () => {
        listTrashedMock.mockImplementation(async () => [
            mkRow({id: "t1"}),
            mkRow({id: "t2"}),
        ]);
        render(<CommentsAdminSection />);
        await waitFor(() => {
            expect(screen.getByTestId("comments-trash-toggle")).toBeTruthy();
        });
        // Badge shows the count from the initial trash probe.
        await waitFor(() => {
            const badge = screen.queryByTestId("comments-trash-badge");
            expect(badge?.textContent).toBe("2");
        });
    });

    it("hides the badge when trash is empty", async () => {
        listTrashedMock.mockImplementation(async () => []);
        render(<CommentsAdminSection />);
        await waitFor(() => {
            expect(screen.getByTestId("comments-trash-toggle")).toBeTruthy();
        });
        expect(screen.queryByTestId("comments-trash-badge")).toBeNull();
    });

    it("clicking the trash toggle fetches listTrashed + renders trash rows", async () => {
        listTrashedMock.mockImplementation(async () => [
            mkRow({id: "t-row-1", body_text: "in trash"}),
        ]);
        render(<CommentsAdminSection />);
        await waitFor(() => {
            expect(screen.getByTestId("comments-trash-toggle")).toBeTruthy();
        });
        fireEvent.click(screen.getByTestId("comments-trash-toggle"));
        await waitFor(() => {
            expect(screen.getByTestId("comments-trash-row-t-row-1")).toBeTruthy();
        });
        // Active-view row testid namespace is NOT used in trash view.
        expect(screen.queryByTestId("comments-admin-row-t-row-1")).toBeNull();
    });

    it("trash view hides the filter bar but namespaces selection under comments-trash-*", async () => {
        listTrashedMock.mockImplementation(async () => [mkRow({id: "tx"})]);
        render(<CommentsAdminSection />);
        await waitFor(() =>
            expect(screen.getByTestId("comments-trash-toggle")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("comments-trash-toggle"));
        await waitFor(() =>
            expect(screen.getByTestId("comments-trash-row-tx")).toBeTruthy(),
        );
        // Filter bar is active-view-only.
        expect(screen.queryByTestId("comments-admin-filters")).toBeNull();
        // Commit 5: select-all + per-row checkboxes ARE present in
        // trash view but under the ``comments-trash-*`` namespace so
        // they don't collide with active-view selectors.
        expect(screen.getByTestId("comments-trash-select-all")).toBeTruthy();
        expect(screen.getByTestId("comments-trash-select-tx")).toBeTruthy();
        expect(screen.queryByTestId("comments-admin-select-all")).toBeNull();
        expect(screen.queryByTestId("comments-admin-select-tx")).toBeNull();
        // Active-view bulk bar must not appear in trash view; trash-
        // view bulk bar only renders when selection.count > 0.
        expect(screen.queryByTestId("comment-bulk-action-bar")).toBeNull();
        expect(screen.queryByTestId("comments-trash-bulk-action-bar")).toBeNull();
    });

    it("renders the trash-empty CTA when trash has rows", async () => {
        listTrashedMock.mockImplementation(async () => [mkRow({id: "t1"})]);
        render(<CommentsAdminSection />);
        await waitFor(() =>
            expect(screen.getByTestId("comments-trash-toggle")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("comments-trash-toggle"));
        await waitFor(() =>
            expect(screen.getByTestId("comments-trash-row-t1")).toBeTruthy(),
        );
        expect(screen.getByTestId("comments-trash-empty")).toBeTruthy();
    });

    it("renders empty-state copy when trash is empty", async () => {
        listTrashedMock.mockImplementation(async () => []);
        render(<CommentsAdminSection />);
        await waitFor(() =>
            expect(screen.getByTestId("comments-trash-toggle")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("comments-trash-toggle"));
        await waitFor(() => {
            expect(screen.getByTestId("comments-trash-empty")).toBeTruthy();
        });
    });

    it("Restore row action calls api.comments.restore + drops row + toasts", async () => {
        listTrashedMock.mockImplementation(async () => [mkRow({id: "tr1"})]);
        render(<CommentsAdminSection />);
        await waitFor(() =>
            expect(screen.getByTestId("comments-trash-toggle")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("comments-trash-toggle"));
        await waitFor(() =>
            expect(screen.getByTestId("comments-trash-row-tr1")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("comments-trash-restore-tr1"));
        await waitFor(() => expect(restoreMock).toHaveBeenCalledWith("tr1"));
        await waitFor(() =>
            expect(screen.queryByTestId("comments-trash-row-tr1")).toBeNull(),
        );
        expect(notifySuccess).toHaveBeenCalled();
    });

    it("Permanent-Delete row action confirms then calls api.comments.permanentDelete", async () => {
        listTrashedMock.mockImplementation(async () => [mkRow({id: "pd1"})]);
        render(<CommentsAdminSection />);
        await waitFor(() =>
            expect(screen.getByTestId("comments-trash-toggle")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("comments-trash-toggle"));
        await waitFor(() =>
            expect(screen.getByTestId("comments-trash-row-pd1")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("comments-trash-permanent-pd1"));
        await waitFor(() => expect(confirmMock).toHaveBeenCalled());
        await waitFor(() =>
            expect(permanentDeleteMock).toHaveBeenCalledWith("pd1"),
        );
        await waitFor(() =>
            expect(screen.queryByTestId("comments-trash-row-pd1")).toBeNull(),
        );
        expect(notifySuccess).toHaveBeenCalled();
    });

    it("Permanent-Delete cancel keeps the row + skips the API", async () => {
        confirmMock.mockImplementation(async () => false);
        listTrashedMock.mockImplementation(async () => [mkRow({id: "safe"})]);
        render(<CommentsAdminSection />);
        await waitFor(() =>
            expect(screen.getByTestId("comments-trash-toggle")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("comments-trash-toggle"));
        await waitFor(() =>
            expect(screen.getByTestId("comments-trash-row-safe")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("comments-trash-permanent-safe"));
        await waitFor(() => expect(confirmMock).toHaveBeenCalled());
        expect(permanentDeleteMock).not.toHaveBeenCalled();
        expect(screen.getByTestId("comments-trash-row-safe")).toBeTruthy();
    });

    it("Empty-Trash CTA confirms then calls api.comments.emptyTrash", async () => {
        listTrashedMock.mockImplementation(async () => [
            mkRow({id: "e1"}),
            mkRow({id: "e2"}),
        ]);
        render(<CommentsAdminSection />);
        await waitFor(() =>
            expect(screen.getByTestId("comments-trash-toggle")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("comments-trash-toggle"));
        await waitFor(() =>
            expect(screen.getByTestId("comments-trash-empty")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("comments-trash-empty"));
        await waitFor(() => expect(confirmMock).toHaveBeenCalled());
        await waitFor(() => expect(emptyTrashMock).toHaveBeenCalled());
        // Rows wiped optimistically.
        await waitFor(() =>
            expect(screen.queryByTestId("comments-trash-row-e1")).toBeNull(),
        );
        expect(notifySuccess).toHaveBeenCalled();
    });

    it("Empty-Trash cancel skips the API", async () => {
        confirmMock.mockImplementation(async () => false);
        listTrashedMock.mockImplementation(async () => [mkRow({id: "e1"})]);
        render(<CommentsAdminSection />);
        await waitFor(() =>
            expect(screen.getByTestId("comments-trash-toggle")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("comments-trash-toggle"));
        await waitFor(() =>
            expect(screen.getByTestId("comments-trash-empty")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("comments-trash-empty"));
        await waitFor(() => expect(confirmMock).toHaveBeenCalled());
        expect(emptyTrashMock).not.toHaveBeenCalled();
    });

    it("trash-view row click does NOT open the preview modal", async () => {
        listTrashedMock.mockImplementation(async () => [mkRow({id: "rc"})]);
        render(<CommentsAdminSection />);
        await waitFor(() =>
            expect(screen.getByTestId("comments-trash-toggle")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("comments-trash-toggle"));
        const row = await screen.findByTestId("comments-trash-row-rc");
        fireEvent.click(row);
        expect(screen.queryByTestId("comment-preview-modal")).toBeNull();
    });

    it("toggling back to active re-fetches the active list", async () => {
        listMock.mockImplementation(async () => [mkRow({id: "act-1"})]);
        listTrashedMock.mockImplementation(async () => [mkRow({id: "tr-1"})]);
        render(<CommentsAdminSection />);
        await waitFor(() =>
            expect(screen.getByTestId("comments-admin-row-act-1")).toBeTruthy(),
        );
        const initialListCalls = listMock.mock.calls.length;
        fireEvent.click(screen.getByTestId("comments-trash-toggle"));
        await waitFor(() =>
            expect(screen.getByTestId("comments-trash-row-tr-1")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("comments-active-toggle"));
        await waitFor(() =>
            expect(listMock.mock.calls.length).toBeGreaterThan(initialListCalls),
        );
        await waitFor(() =>
            expect(screen.getByTestId("comments-admin-row-act-1")).toBeTruthy(),
        );
    });

    it("soft-delete from active view triggers a trash-count refresh", async () => {
        listMock.mockImplementation(async () => [mkRow({id: "live-1"})]);
        // Initial probe: 0 trashed. After delete: 1 trashed.
        let trashRows: ArticleComment[] = [];
        listTrashedMock.mockImplementation(async () => trashRows);
        render(<CommentsAdminSection />);
        await waitFor(() =>
            expect(screen.getByTestId("comments-admin-row-live-1")).toBeTruthy(),
        );
        // No badge initially.
        expect(screen.queryByTestId("comments-trash-badge")).toBeNull();
        // Click the per-row delete; mock the backend to soft-delete.
        trashRows = [mkRow({id: "live-1"})];
        fireEvent.click(screen.getByTestId("comments-admin-delete-live-1"));
        await waitFor(() => expect(deleteMock).toHaveBeenCalled());
        // Badge should reappear with count 1 after the refresh probe.
        await waitFor(() => {
            const badge = screen.queryByTestId("comments-trash-badge");
            expect(badge?.textContent).toBe("1");
        });
    });

    it("Restore error path surfaces a toast", async () => {
        restoreMock.mockImplementation(async () => {
            throw new Error("boom");
        });
        listTrashedMock.mockImplementation(async () => [mkRow({id: "rerr"})]);
        render(<CommentsAdminSection />);
        await waitFor(() =>
            expect(screen.getByTestId("comments-trash-toggle")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("comments-trash-toggle"));
        await waitFor(() =>
            expect(screen.getByTestId("comments-trash-row-rerr")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("comments-trash-restore-rerr"));
        await waitFor(() => expect(notifyError).toHaveBeenCalled());
        // Row stays since the optimistic drop is gated on success.
        expect(screen.getByTestId("comments-trash-row-rerr")).toBeTruthy();
    });
});

// ---------------------------------------------------------------------------
// Bug 10 Commit 5: bulk-restore + bulk-permanent-delete in trash view
// ---------------------------------------------------------------------------

describe("CommentsAdminSection trash bulk actions", () => {
    it("checking the trash select-all selects every trashed row", async () => {
        listTrashedMock.mockImplementation(async () => [
            mkRow({id: "t1"}),
            mkRow({id: "t2"}),
        ]);
        render(<CommentsAdminSection />);
        await waitFor(() =>
            expect(screen.getByTestId("comments-trash-toggle")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("comments-trash-toggle"));
        await waitFor(() =>
            expect(screen.getByTestId("comments-trash-select-all")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("comments-trash-select-all"));
        // Trash bulk-action bar appears with count = 2.
        await waitFor(() =>
            expect(screen.getByTestId("comments-trash-bulk-action-bar")).toBeTruthy(),
        );
        expect(screen.getByTestId("comments-trash-bulk-count").textContent).toContain("2");
    });

    it("bulk-restore button POSTs the selected ids + clears + toasts", async () => {
        listTrashedMock.mockImplementation(async () => [
            mkRow({id: "tb1"}),
            mkRow({id: "tb2"}),
        ]);
        render(<CommentsAdminSection />);
        await waitFor(() =>
            expect(screen.getByTestId("comments-trash-toggle")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("comments-trash-toggle"));
        await waitFor(() =>
            expect(screen.getByTestId("comments-trash-select-tb1")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("comments-trash-select-tb1"));
        fireEvent.click(screen.getByTestId("comments-trash-select-tb2"));
        await waitFor(() =>
            expect(screen.getByTestId("comments-trash-bulk-restore")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("comments-trash-bulk-restore"));
        await waitFor(() =>
            expect(bulkRestoreMock).toHaveBeenCalledWith(["tb1", "tb2"]),
        );
        // Rows drop optimistically + bar closes (selection.clear).
        await waitFor(() =>
            expect(screen.queryByTestId("comments-trash-row-tb1")).toBeNull(),
        );
        expect(notifySuccess).toHaveBeenCalled();
    });

    it("bulk-permanent in trash opens the type-to-confirm dialog and uses bulkDelete?permanent=true on confirm", async () => {
        listTrashedMock.mockImplementation(async () => [
            mkRow({id: "td1"}),
            mkRow({id: "td2"}),
        ]);
        render(<CommentsAdminSection />);
        await waitFor(() =>
            expect(screen.getByTestId("comments-trash-toggle")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("comments-trash-toggle"));
        await waitFor(() =>
            expect(screen.getByTestId("comments-trash-select-all")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("comments-trash-select-all"));
        await waitFor(() =>
            expect(screen.getByTestId("comments-trash-bulk-permanent")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("comments-trash-bulk-permanent"));
        // The shared TypeToConfirmDialog opens. The user must type
        // the count (``"2"`` here) into the input to enable the
        // confirm button.
        await screen.findByTestId("type-to-confirm-dialog");
        const input = screen.getByTestId(
            "type-to-confirm-input",
        ) as HTMLInputElement;
        fireEvent.change(input, {target: {value: "2"}});
        fireEvent.click(screen.getByTestId("type-to-confirm-confirm"));
        await waitFor(() =>
            expect(bulkDeleteMock).toHaveBeenCalledWith(["td1", "td2"], true),
        );
    });

    it("bulk-restore error path surfaces a toast + leaves rows", async () => {
        bulkRestoreMock.mockImplementation(async () => {
            throw new Error("boom");
        });
        listTrashedMock.mockImplementation(async () => [mkRow({id: "fail"})]);
        render(<CommentsAdminSection />);
        await waitFor(() =>
            expect(screen.getByTestId("comments-trash-toggle")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("comments-trash-toggle"));
        await waitFor(() =>
            expect(screen.getByTestId("comments-trash-select-fail")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("comments-trash-select-fail"));
        fireEvent.click(screen.getByTestId("comments-trash-bulk-restore"));
        await waitFor(() => expect(notifyError).toHaveBeenCalled());
        // Row stays because the optimistic drop is gated on success.
        expect(screen.getByTestId("comments-trash-row-fail")).toBeTruthy();
    });

    it("Clear button in the trash bulk-bar resets selection", async () => {
        listTrashedMock.mockImplementation(async () => [mkRow({id: "tc1"})]);
        render(<CommentsAdminSection />);
        await waitFor(() =>
            expect(screen.getByTestId("comments-trash-toggle")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("comments-trash-toggle"));
        await waitFor(() =>
            expect(screen.getByTestId("comments-trash-select-tc1")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("comments-trash-select-tc1"));
        await waitFor(() =>
            expect(screen.getByTestId("comments-trash-bulk-clear")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("comments-trash-bulk-clear"));
        await waitFor(() =>
            expect(screen.queryByTestId("comments-trash-bulk-action-bar")).toBeNull(),
        );
    });
});
