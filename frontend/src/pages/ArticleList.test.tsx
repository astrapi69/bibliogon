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
import { api } from "../api/client";
import type { Article, ContentTypeDef } from "../api/client";
import { ContentTypesProvider } from "../hooks/useContentTypes";

const TEST_ARTICLE_TYPES: Record<string, ContentTypeDef> = {
    blogpost: {
        id: "blogpost",
        label_key: "ui.content_types.blogpost",
        description_key: "ui.content_types.blogpost_description",
        icon: "FileText",
        default: true,
        extra_fields: [],
    },
    tutorial: {
        id: "tutorial",
        label_key: "ui.content_types.tutorial",
        description_key: "ui.content_types.tutorial_description",
        icon: "GraduationCap",
        default: false,
        extra_fields: [],
    },
    review: {
        id: "review",
        label_key: "ui.content_types.review",
        description_key: "ui.content_types.review_description",
        icon: "Star",
        default: false,
        extra_fields: [],
    },
    essay: {
        id: "essay",
        label_key: "ui.content_types.essay",
        description_key: "ui.content_types.essay_description",
        icon: "Feather",
        default: false,
        extra_fields: [],
    },
    newsletter: {
        id: "newsletter",
        label_key: "ui.content_types.newsletter",
        description_key: "ui.content_types.newsletter_description",
        icon: "Mail",
        default: false,
        extra_fields: [],
    },
};

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
        contentTypes: {
            list: vi.fn().mockResolvedValue({}),
        },
        settings: {
            // Existing row-based assertions assume the list view is
            // active. Default the dashboard preference to "list" in
            // the mock so useViewMode resolves the same way.
            //
            // Bug 3 (commit 5767289) introduced a deliberate
            // decoupling: trash uses ``useTrashViewMode`` which reads
            // a SEPARATE YAML key (``articles_trash_view``). Without
            // a mock value for that key the hook stays at its
            // hard-coded ``"grid"`` initial state, and the trash-list
            // assertions in the "trash view respects viewMode toggle"
            // test fall through (Bug 7 from 2026-05-16). The trash key
            // is mirrored here so both view-mode hooks resolve to
            // "list" cleanly. The TrashPanel renders its own
            // ViewToggle (the global one is hidden in trash mode), so
            // ``view-toggle-grid`` in the trash flow flips the trash
            // view via setTrashViewMode — the test's assertions are
            // correct against that local toggle.
            getApp: vi.fn().mockResolvedValue({
                ui: {
                    dashboard: {
                        articles_view: "list",
                        articles_trash_view: "list",
                    },
                },
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
        series: null,
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
                <ContentTypesProvider initialTypes={TEST_ARTICLE_TYPES}>
                    <ArticleList />
                </ContentTypesProvider>
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

    // CONFIGURABLE-DEFAULT-CONTENT-BOOK-TYPE-01 Bug B: the SplitButton
    // primary deep-links the configured default content-type so
    // CreateArticlePage renders the type-specific title.
    it("primary deep-links the configured non-default content type", async () => {
        vi.mocked(api.settings.getApp).mockResolvedValue({
            ui: {
                dashboard: {
                    articles_view: "list",
                    articles_trash_view: "list",
                },
                defaults: { content_type: "tutorial" },
            },
        });
        await renderList([]);
        const btn = await screen.findByTestId("article-list-new");
        await waitFor(() => expect(api.settings.getApp).toHaveBeenCalled());
        fireEvent.click(btn);
        expect(navigateMock).toHaveBeenCalledWith("/articles/new?type=tutorial");
    });

    it("primary uses bare /articles/new when the default is the registry default (blogpost)", async () => {
        vi.mocked(api.settings.getApp).mockResolvedValue({
            ui: {
                dashboard: {
                    articles_view: "list",
                    articles_trash_view: "list",
                },
                defaults: { content_type: "blogpost" },
            },
        });
        await renderList([]);
        const btn = await screen.findByTestId("article-list-new");
        await waitFor(() => expect(api.settings.getApp).toHaveBeenCalled());
        fireEvent.click(btn);
        expect(navigateMock).toHaveBeenCalledWith("/articles/new");
    });

    it("list row renders exactly 9 grid children when bulk-select is enabled (status+lang overlap regression pin)", async () => {
        // Regression pin for 6818b88 -> bug surfaced 2026-05-12:
        // bulk-select introduced a leading checkbox cell, taking the
        // rendered child count to 9, but grid-template-columns
        // stayed at 8 columns. CSS Grid auto-flow then shifted every
        // cell left by one column, causing the status badge to
        // overflow the 60px lang column visually. The fix adds a
        // ``.gridRowSelectable`` modifier that bumps the template to
        // 9 columns; this test pins that the JSX still emits 9
        // direct children when ``onToggleSelect`` is supplied, so a
        // future commit that removes a cell (e.g. drops the topic
        // column) is forced to re-evaluate the template.
        await renderList([makeArticle({ id: "row-shape", title: "Layout" })]);
        const row = await screen.findByTestId("article-list-row-row-shape");
        expect(row.children.length).toBe(9);
        // The class modifier carries the 9-column grid template.
        expect(row.className).toMatch(/gridRowSelectable/);
    });

    it("list row shows comments-count badge when comments_count > 0 (LIST-VIEW-COMMENTS-COUNT-PARITY-01)", async () => {
        // Parity with the grid view's ArticleCard badge (shipped in
        // 87ab959). The badge is integrated into the title cell so
        // the grid template stays at 9 columns - adding a 10th
        // fixed column would have crushed the 1fr title column at
        // ~768px tablet width.
        await renderList([
            makeArticle({ id: "with-comments", title: "Has comments", comments_count: 5 }),
            makeArticle({ id: "no-comments", title: "Zero comments", comments_count: 0 }),
        ]);
        await screen.findByTestId("article-list-row-with-comments");
        const badge = screen.getByTestId(
            "article-list-row-comments-count-with-comments",
        );
        expect(badge.textContent).toContain("5");
        // Zero-count row does NOT render the badge.
        expect(
            screen.queryByTestId("article-list-row-comments-count-no-comments"),
        ).toBeNull();
    });

    it("list row badge is hidden when comments_count is undefined (legacy API responses)", async () => {
        // Pre-MEDIUM-COMMENTS-UI-01 commit 1 (fa0427d) backends
        // didn't emit comments_count. The component must hide the
        // badge in that case (not display "0" or render an empty
        // span).
        await renderList([makeArticle({ id: "legacy", title: "Legacy" })]);
        await screen.findByTestId("article-list-row-legacy");
        expect(
            screen.queryByTestId("article-list-row-comments-count-legacy"),
        ).toBeNull();
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

    it("New Article navigates to the create page", async () => {
        // Dialog->Pages migration (C2): the split-button no longer
        // creates inline; it routes to the /articles/new create page.
        await renderList([makeArticle()]);
        await waitFor(() =>
            expect(screen.getByTestId("article-list-new")).toBeInTheDocument(),
        );
        fireEvent.click(screen.getByTestId("article-list-new"));
        await waitFor(() =>
            expect(navigateMock).toHaveBeenCalledWith("/articles/new"),
        );
        expect(mockCreate).not.toHaveBeenCalled();
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

        // Flip to grid via the TrashPanel's local ViewToggle.
        // ArticleList hides the global ViewToggle when ``showTrash``
        // is true (ArticleList.tsx renders it inside a
        // ``{!showTrash && ...}`` block), so ``view-toggle-grid``
        // here resolves to the trash-panel's own ViewToggle, which
        // calls ``setTrashViewMode("grid")`` per Bug 3's decoupled
        // hook contract.
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

    it("empty-state CTA also navigates to the create page", async () => {
        await renderList([]);
        await waitFor(() =>
            expect(
                screen.getByTestId("article-list-empty-cta"),
            ).toBeInTheDocument(),
        );
        fireEvent.click(screen.getByTestId("article-list-empty-cta"));
        await waitFor(() =>
            expect(navigateMock).toHaveBeenCalledWith("/articles/new"),
        );
        expect(mockCreate).not.toHaveBeenCalled();
    });
});
