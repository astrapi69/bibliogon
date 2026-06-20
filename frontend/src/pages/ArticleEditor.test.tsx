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
import type { Article, ContentTypeDef } from "../api/client";
import { ContentTypesProvider } from "../hooks/useContentTypes";
import { expectNoA11yViolations } from "../test-utils/a11y";

const TEST_ARTICLE_TYPES: Record<string, ContentTypeDef> = {
    blogpost: {
        id: "blogpost",
        label_key: "ui.content_types.blogpost",
        description_key: "ui.content_types.blogpost_description",
        icon: "FileText",
        default: true,
        core_fields: ["tags", "excerpt", "seo", "canonical_url", "featured_image"],
        extra_fields: [],
    },
    tutorial: {
        id: "tutorial",
        label_key: "ui.content_types.tutorial",
        description_key: "ui.content_types.tutorial_description",
        icon: "GraduationCap",
        default: false,
        core_fields: ["tags", "excerpt", "seo", "featured_image"],
        extra_fields: [
            {
                name: "difficulty_level",
                type: "enum",
                label_key: "ui.content_types.tutorial_field_difficulty",
                values: ["beginner", "intermediate", "advanced"],
            },
            {
                name: "estimated_duration_minutes",
                type: "number",
                label_key: "ui.content_types.tutorial_field_duration",
            },
        ],
    },
    review: {
        id: "review",
        label_key: "ui.content_types.review",
        description_key: "ui.content_types.review_description",
        icon: "Star",
        default: false,
        extra_fields: [
            {
                name: "rating",
                type: "number",
                label_key: "ui.content_types.review_field_rating",
                min: 1,
                max: 5,
            },
        ],
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
        core_fields: [],
        extra_fields: [
            {
                name: "issue_number",
                type: "number",
                label_key: "ui.content_types.newsletter_field_issue",
            },
        ],
    },
};

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

vi.mock("../hooks/content/useTopics", () => ({
    useTopics: () => ["tech", "writing"],
}));

vi.mock("../components/shared/AppDialog", () => ({
    useDialog: () => ({
        confirm: vi.fn(async () => true),
        prompt: vi.fn(),
        alert: vi.fn(),
        choose: vi.fn(),
    }),
}));

vi.mock("../utils/platform/notify", () => ({
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
            // AUTHOR-DATALIST-EXTEND-EDITORS-01: the Article editor
            // fetches api.authors.list({}) on mount to populate the
            // datalist's Authors-DB tier. Mock returns empty list —
            // the existing tests don't care about the DB suggestions;
            // useAuthorProfile mock above already supplies the
            // profile-tier suggestions.
            authors: {
                list: vi.fn(async () => []),
                create: vi.fn(async ({name}: {name: string}) => ({
                    id: `mock-${name}`,
                    name,
                    slug: name.toLowerCase(),
                    email: null,
                    bio: null,
                    website: null,
                    social_links: {},
                })),
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
vi.mock("../components/shared/AITemplatePanel", () => ({
    default: () => <div data-testid="ai-template-stub" />,
}));
vi.mock("../components/articles/ArticleImageUpload", () => ({
    default: () => <div data-testid="image-upload-stub" />,
}));
vi.mock("../components/KeywordInput", () => ({
    default: () => <div data-testid="keyword-input-stub" />,
}));
vi.mock("../components/shared/AiGenerateButton", () => ({
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
    // ARTICLE-TYPES-SSOT-01: content_type is now the article-type
    // discriminator; default for new + restored articles is
    // "blogpost". Migration u0e1f2345678 rewrites "article" →
    // "blogpost".
    content_type: "blogpost",
    article_metadata: {},
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
            <ContentTypesProvider initialTypes={TEST_ARTICLE_TYPES}>
                <Routes>
                    <Route path="/articles/:id" element={<ArticleEditor />} />
                </Routes>
            </ContentTypesProvider>
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

describe("ArticleEditor — per-content-type core-field visibility (ARTICLE-TYPES-FIELD-VISIBILITY-01)", () => {
    it("blogpost shows all configurable core fields", async () => {
        getArticleMock.mockResolvedValue({ ...stubArticle, content_type: "blogpost" });
        renderEditor();
        await screen.findByTestId("article-editor-actions-menu");
        expect(screen.queryByTestId("article-editor-seo-title")).toBeTruthy();
        expect(screen.queryByTestId("article-editor-canonical-url")).toBeTruthy();
        expect(screen.queryByTestId("article-editor-excerpt")).toBeTruthy();
        expect(screen.queryByTestId("article-editor-featured-image")).toBeTruthy();
    });

    it("tutorial hides Canonical URL but keeps SEO / Excerpt / Featured image", async () => {
        getArticleMock.mockResolvedValue({ ...stubArticle, content_type: "tutorial" });
        renderEditor();
        await screen.findByTestId("article-editor-actions-menu");
        expect(screen.queryByTestId("article-editor-canonical-url")).toBeNull();
        expect(screen.queryByTestId("article-editor-seo-title")).toBeTruthy();
        expect(screen.queryByTestId("article-editor-excerpt")).toBeTruthy();
        expect(screen.queryByTestId("article-editor-featured-image")).toBeTruthy();
    });

    it("newsletter (core_fields: []) hides every optional core field", async () => {
        getArticleMock.mockResolvedValue({ ...stubArticle, content_type: "newsletter" });
        renderEditor();
        // Editor still mounts (identity fields + actions menu remain).
        await screen.findByTestId("article-editor-actions-menu");
        expect(screen.queryByTestId("article-editor-seo-title")).toBeNull();
        expect(screen.queryByTestId("article-editor-canonical-url")).toBeNull();
        expect(screen.queryByTestId("article-editor-excerpt")).toBeNull();
        expect(screen.queryByTestId("article-editor-featured-image")).toBeNull();
    });

    it("a type with no core_fields key (undefined) shows all (permissive default)", async () => {
        // 'review' mock omits core_fields → showCore treats it as "show all".
        getArticleMock.mockResolvedValue({ ...stubArticle, content_type: "review" });
        renderEditor();
        await screen.findByTestId("article-editor-actions-menu");
        expect(screen.queryByTestId("article-editor-canonical-url")).toBeTruthy();
        expect(screen.queryByTestId("article-editor-seo-title")).toBeTruthy();
    });
});

describe("ArticleEditor — accessibility (axe)", () => {
    it("has no critical/serious axe violations", async () => {
        getArticleMock.mockResolvedValue(stubArticle);
        const { container } = renderEditor();
        await screen.findByTestId("article-editor-actions-menu");
        await expectNoA11yViolations(container);
    });
});
