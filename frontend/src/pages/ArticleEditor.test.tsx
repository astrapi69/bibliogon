/**
 * v0.32.0 F2c kebab-menu smoke.
 *
 * Focused Vitest for the new "Move to comments" action surface in
 * the ArticleEditor header. Pins:
 *
 *  - The kebab trigger renders in the header (no regression to the
 *    kebab being missing or hidden)
 *  - The article load path works through the rendered editor (the
 *    handler exists in a fully-mounted ArticleEditor; if the load
 *    path is broken, the kebab never reaches the DOM)
 *
 * The dropdown-interaction layer (open menu → click item → run
 * confirm → call api.articles.reclassifyAsComment → navigate + toast)
 * is exercised end-to-end by the matching Playwright smoke at
 * ``e2e/smoke/reclassify.spec.ts`` — Radix DropdownMenu's pointer-
 * event + focus-scope behavior is brittle in happy-dom and is more
 * reliably covered in a real browser. The handler logic itself is
 * symmetric with the reciprocal Comment→Article action and has full
 * Vitest coverage in CommentsAdminSection.test.tsx (5 dedicated
 * reclassify-flow tests there).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import ArticleEditor from "./ArticleEditor";
import type { Article } from "../api/client";

// --- Mocks -----------------------------------------------------------------

const navigateMock = vi.fn();
const getArticleMock = vi.fn<(id: string) => Promise<Article>>();

const stableT = (_key: string, fallback: string) => fallback;
const stableI18n = { t: stableT, lang: "en", setLang: () => {} };

vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual<typeof import("react-router-dom")>(
        "react-router-dom",
    );
    return {
        ...actual,
        useNavigate: () => navigateMock,
    };
});

// Stable identity per the lessons-learned rule
// "React useEffect deps + i18n test mocks: the t function isn't stable":
// ArticleEditor's load effect has ``t`` in its dep array, and a fresh
// ``t`` on every render cancels the previous fetch run before its
// resolved promise lands.
vi.mock("../hooks/useI18n", () => ({
    useI18n: () => stableI18n,
}));

vi.mock("../hooks/useAuthorProfile", () => ({
    useAuthorProfile: () => ({ name: "Asterios", pen_names: [] }),
    profileDisplayNames: (profile: { name: string; pen_names: string[] } | null) =>
        profile ? [profile.name, ...profile.pen_names].filter(Boolean) : [],
}));

vi.mock("../hooks/useTopics", () => ({
    useTopics: () => ["tech", "writing"],
}));

vi.mock("../components/AppDialog", () => ({
    useDialog: () => ({
        confirm: vi.fn(async () => true),
        prompt: vi.fn(),
        alert: vi.fn(),
        choose: vi.fn(),
    }),
}));

vi.mock("../utils/notify", () => ({
    notify: {
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        bulkAction: vi.fn(),
    },
}));

vi.mock("../api/client", async () => {
    const actual = await vi.importActual<typeof import("../api/client")>(
        "../api/client",
    );
    return {
        ...actual,
        api: {
            ...actual.api,
            articles: {
                get: (id: string) => getArticleMock(id),
                update: vi.fn(async () => ({}) as unknown as Article),
                delete: vi.fn(async () => {}),
                reclassifyAsComment: vi.fn(async (id: string) => ({
                    success: true,
                    comment_id: "cmt-from-" + id,
                    deleted_article_id: id,
                })),
                getComments: vi.fn(async () => []),
            },
            settings: { updateApp: vi.fn(async () => ({})) },
        },
    };
});

// The Editor component is heavy (TipTap, plugin status, etc.).
// Stub it so the header-level smoke stays focused.
vi.mock("../components/Editor", () => ({
    default: () => <div data-testid="editor-stub" />,
    pluginsForContentKind: () => ({
        markdownMode: false,
        focusMode: false,
        styleCheck: false,
        spellcheck: false,
        searchInDocument: false,
        previewAudio: false,
        aiPanel: false,
        aiReview: false,
    }),
}));

// Sidebar panels pull their own data on mount; stub them so the
// kebab-render test doesn't pay for them.
vi.mock("../components/articles/PublicationsPanel", () => ({
    PublicationsPanel: () => <div data-testid="publications-stub" />,
}));
vi.mock("../components/articles/ArticleCommentsPanel", () => ({
    default: () => <div data-testid="comments-panel-stub" />,
}));
vi.mock("../components/AITemplatePanel", () => ({
    default: () => <div data-testid="ai-template-stub" />,
}));
vi.mock("../components/ArticleImageUpload", () => ({
    default: () => <div data-testid="image-upload-stub" />,
}));
vi.mock("../components/KeywordInput", () => ({
    default: () => <div data-testid="keyword-input-stub" />,
}));
vi.mock("../components/AiGenerateButton", () => ({
    default: () => <div data-testid="ai-generate-stub" />,
}));
vi.mock("../components/ThemeToggle", () => ({
    default: () => <div data-testid="theme-toggle-stub" />,
}));
vi.mock("../components/Tooltip", () => ({
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// --- Setup -----------------------------------------------------------------

const stubArticle: Article = {
    id: "art-1",
    title: "Reply-shaped article",
    subtitle: null,
    author: "Asterios",
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
    created_at: "2026-05-14T00:00:00+00:00",
    updated_at: "2026-05-14T00:00:00+00:00",
    deleted_at: null,
    original_published_at: null,
    comments_count: 0,
};

beforeEach(() => {
    navigateMock.mockClear();
    getArticleMock.mockClear();
    getArticleMock.mockResolvedValue(stubArticle);
});

afterEach(() => {
    vi.clearAllMocks();
});

function renderEditor() {
    return render(
        <MemoryRouter initialEntries={["/articles/art-1"]}>
            <Routes>
                <Route path="/articles/:id" element={<ArticleEditor />} />
            </Routes>
        </MemoryRouter>,
    );
}

// --- Tests -----------------------------------------------------------------

describe("ArticleEditor — kebab menu reclassify smoke (F2c)", () => {
    it("loads the article and renders the actions kebab trigger", async () => {
        renderEditor();
        // The kebab only mounts once the article load completes, so
        // this implicitly checks the load path too.
        const trigger = await screen.findByTestId("article-editor-actions-menu");
        expect(trigger).toBeTruthy();
        await waitFor(() => {
            expect(getArticleMock).toHaveBeenCalledWith("art-1");
        });
    });
});
