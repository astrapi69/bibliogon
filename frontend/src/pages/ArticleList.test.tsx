/**
 * AR-01 Phase 1 ArticleList tests.
 *
 * Pin the contract:
 * - Empty list renders the empty-state CTA (not bare "No articles")
 * - Status filter swaps which articles are shown
 * - "New Article" creates via API and navigates to the editor
 * - Row click navigates to /articles/{id}
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import ArticleList from "./ArticleList";
import type { Article } from "../api/client";

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual =
        await vi.importActual<typeof import("react-router-dom")>(
            "react-router-dom",
        );
    return {
        ...actual,
        useNavigate: () => navigateMock,
    };
});

const mockList = vi.fn();
const mockCreate = vi.fn();
const mockListTrash = vi.fn();

vi.mock("../api/client", () => ({
    api: {
        articles: {
            list: (...args: unknown[]) => mockList(...args),
            create: (...args: unknown[]) => mockCreate(...args),
            listTrash: (...args: unknown[]) => mockListTrash(...args),
        },
        settings: {
            // Existing row-based assertions assume the list view is
            // active. Default the dashboard preference to "list" in
            // the mock so useViewMode resolves the same way.
            getApp: vi.fn().mockResolvedValue({
                ui: { dashboard: { articles_view: "list" } },
            }),
            updateApp: vi.fn().mockResolvedValue({}),
        },
    },
    ApiError: class extends Error {
        status: number;
        detail: string;
        constructor(
            status: number,
            detail: string,
            _url = "",
            _method = "GET",
            _stack = "",
        ) {
            super(detail);
            this.status = status;
            this.detail = detail;
        }
    },
}));

vi.mock("../components/AppDialog", () => ({
    useDialog: () => ({
        confirm: vi.fn().mockResolvedValue(false),
        alert: vi.fn().mockResolvedValue(undefined),
    }),
}));

vi.mock("../contexts/HelpContext", () => ({
    useHelp: () => ({
        openHelp: vi.fn(),
        closeHelp: vi.fn(),
    }),
}));

vi.mock("../components/ThemeToggle", () => ({
    default: () => null,
}));

vi.mock("../utils/notify", () => ({
    notify: {
        error: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
        info: vi.fn(),
    },
}));

function makeArticle(overrides: Partial<Article> = {}): Article {
    return {
        id: "a-1",
        title: "Test Article",
        subtitle: null,
        author: null,
        language: "en",
        content_type: "article",
        content_json: "",
        status: "draft",
        canonical_url: null,
        featured_image_url: null,
        excerpt: null,
        tags: [],
        topic: null,
        seo_title: null,
        seo_description: null,
        created_at: "2026-04-27T10:00:00Z",
        updated_at: "2026-04-27T10:00:00Z",
        ...overrides,
    };
}

async function renderList(rows: Article[] = []) {
    mockList.mockResolvedValue(rows);
    await act(async () => {
        render(
            <MemoryRouter>
                <ArticleList />
            </MemoryRouter>,
        );
    });
}

describe("ArticleList", () => {
    beforeEach(() => {
        navigateMock.mockReset();
        mockList.mockReset();
        mockCreate.mockReset();
        mockListTrash.mockReset();
        mockListTrash.mockResolvedValue([]);
    });

    it("renders empty state with CTA when list is empty", async () => {
        await renderList([]);
        await waitFor(() =>
            expect(screen.getByTestId("article-list-empty")).toBeInTheDocument(),
        );
        expect(screen.getByTestId("article-list-empty-cta")).toBeTruthy();
    });

    it("renders one row per article with title + status badge", async () => {
        await renderList([
            makeArticle({ id: "a-1", title: "First" }),
            makeArticle({ id: "a-2", title: "Second", status: "published" }),
        ]);
        await waitFor(() =>
            expect(screen.getByTestId("article-list")).toBeInTheDocument(),
        );
        expect(
            screen.getByTestId("article-list-row-a-1").textContent,
        ).toContain("First");
        expect(
            screen.getByTestId("article-list-row-a-2").textContent,
        ).toContain("Second");
        // Component passes the raw status as t() fallback; the test
        // mock returns the fallback verbatim (no transform).
        expect(
            screen.getByTestId("article-list-row-status-a-2").textContent,
        ).toContain("published");
    });

    it("clicking a row navigates to the editor", async () => {
        await renderList([makeArticle({ id: "a-99" })]);
        await waitFor(() =>
            expect(screen.getByTestId("article-list-row-a-99")).toBeInTheDocument(),
        );
        fireEvent.click(screen.getByTestId("article-list-row-a-99"));
        expect(navigateMock).toHaveBeenCalledWith("/articles/a-99");
    });

    it("status filter narrows the rendered list (client-side)", async () => {
        // Cluster E: filtering moved from server-side query to client-side
        // ``useArticleFilters``. Seed two rows with different statuses,
        // click the Published filter, assert only the published row
        // remains rendered and the API was NOT called again.
        await renderList([
            makeArticle({ id: "draft-1", status: "draft" }),
            makeArticle({ id: "pub-1", status: "published" }),
        ]);
        await waitFor(() =>
            expect(screen.getByTestId("article-list-row-draft-1")).toBeInTheDocument(),
        );
        expect(mockList).toHaveBeenCalledTimes(1);
        expect(mockList).toHaveBeenLastCalledWith();

        fireEvent.click(screen.getByTestId("article-list-filter-published"));
        await waitFor(() =>
            expect(screen.queryByTestId("article-list-row-draft-1")).not.toBeInTheDocument(),
        );
        expect(screen.getByTestId("article-list-row-pub-1")).toBeInTheDocument();
        // Filter is client-side; no second API call.
        expect(mockList).toHaveBeenCalledTimes(1);
    });

    it("New Article creates and navigates to the new editor", async () => {
        await renderList([makeArticle()]);
        await waitFor(() =>
            expect(screen.getByTestId("article-list-new")).toBeInTheDocument(),
        );
        mockCreate.mockResolvedValue(makeArticle({ id: "fresh-id" }));
        fireEvent.click(screen.getByTestId("article-list-new"));
        await waitFor(() =>
            expect(navigateMock).toHaveBeenCalledWith("/articles/fresh-id"),
        );
    });

    it("trash view back-button returns to live list", async () => {
        const trashed = makeArticle({
            id: "tr-back-1",
            title: "Trashed",
            deleted_at: "2026-04-29T10:00:00Z",
        });
        mockListTrash.mockResolvedValue([trashed]);
        await renderList([makeArticle({ id: "live-back-1" })]);

        await waitFor(() =>
            expect(
                screen.getByTestId("article-list-trash-toggle"),
            ).toBeInTheDocument(),
        );
        fireEvent.click(screen.getByTestId("article-list-trash-toggle"));
        await waitFor(() =>
            expect(screen.getByTestId("article-trash-panel")).toBeInTheDocument(),
        );

        fireEvent.click(screen.getByTestId("article-trash-back"));
        await waitFor(() =>
            expect(
                screen.queryByTestId("article-trash-panel"),
            ).not.toBeInTheDocument(),
        );
        expect(
            screen.getByTestId("article-list-row-live-back-1"),
        ).toBeInTheDocument();
    });

    it("trash view respects viewMode toggle (list <-> grid)", async () => {
        // Seed one trashed article + one live article so the toggle has
        // something to render in both modes.
        const trashed = makeArticle({
            id: "tr-1",
            title: "Trashed Article",
            deleted_at: "2026-04-29T10:00:00Z",
        });
        mockListTrash.mockResolvedValue([trashed]);
        await renderList([makeArticle({ id: "live-1" })]);

        await waitFor(() =>
            expect(
                screen.getByTestId("article-list-trash-toggle"),
            ).toBeInTheDocument(),
        );
        fireEvent.click(screen.getByTestId("article-list-trash-toggle"));

        // Default mock view is "list" -> trash list rendered.
        await waitFor(() =>
            expect(screen.getByTestId("article-trash-list")).toBeInTheDocument(),
        );
        expect(
            screen.queryByTestId("article-trash-grid"),
        ).not.toBeInTheDocument();
        expect(
            screen.getByTestId("article-trash-row-tr-1"),
        ).toBeInTheDocument();

        // Flip to grid via the global ViewToggle. The trash branch
        // must follow the same setting; before this commit it stayed
        // on <ul> regardless.
        fireEvent.click(screen.getByTestId("view-toggle-grid"));
        await waitFor(() =>
            expect(screen.getByTestId("article-trash-grid")).toBeInTheDocument(),
        );
        expect(
            screen.queryByTestId("article-trash-list"),
        ).not.toBeInTheDocument();
        expect(
            screen.getByTestId("article-trash-card-tr-1"),
        ).toBeInTheDocument();
    });

    it("empty-state CTA also creates + navigates", async () => {
        await renderList([]);
        await waitFor(() =>
            expect(
                screen.getByTestId("article-list-empty-cta"),
            ).toBeInTheDocument(),
        );
        mockCreate.mockResolvedValue(makeArticle({ id: "first" }));
        fireEvent.click(screen.getByTestId("article-list-empty-cta"));
        await waitFor(() =>
            expect(navigateMock).toHaveBeenCalledWith("/articles/first"),
        );
    });
});
