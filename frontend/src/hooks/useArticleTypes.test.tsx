/**
 * Vitest cases for the useArticleTypes() hook + ArticleTypesProvider.
 *
 * Filed by ARTICLE-TYPES-SSOT-01 C3 (2026-05-29). Mirrors the
 * useBookTypes.test.tsx shape.
 */

import {describe, it, expect, vi, beforeEach} from "vitest";
import {render, screen, waitFor, renderHook} from "@testing-library/react";
import type {ReactNode} from "react";

import {
    ArticleTypesProvider,
    articleTypeIcon,
    articleTypeLabelKey,
    useArticleTypes,
} from "./useArticleTypes";
import type {ArticleTypeDef} from "../api/client";

vi.mock("../api/client", () => ({
    api: {
        articleTypes: {
            list: vi.fn(),
        },
    },
    ArticleType: undefined,
}));

import {api} from "../api/client";

function makeArticleType(overrides: Partial<ArticleTypeDef> = {}): ArticleTypeDef {
    return {
        id: overrides.id ?? "blogpost",
        label_key: "ui.article_types.blogpost",
        description_key: "ui.article_types.blogpost_description",
        icon: "FileText",
        default: false,
        extra_fields: [],
        ...overrides,
    } as ArticleTypeDef;
}

const SAMPLE_REGISTRY: Record<string, ArticleTypeDef> = {
    blogpost: makeArticleType({id: "blogpost", default: true}),
    tutorial: makeArticleType({
        id: "tutorial",
        label_key: "ui.article_types.tutorial",
        icon: "GraduationCap",
        extra_fields: [
            {
                name: "difficulty_level",
                type: "enum",
                label_key: "ui.article_types.tutorial_field_difficulty",
                values: ["beginner", "intermediate", "advanced"],
            },
        ],
    }),
    review: makeArticleType({
        id: "review",
        label_key: "ui.article_types.review",
        icon: "Star",
        extra_fields: [
            {
                name: "rating",
                type: "number",
                label_key: "ui.article_types.review_field_rating",
                min: 1,
                max: 5,
            },
        ],
    }),
    essay: makeArticleType({
        id: "essay",
        label_key: "ui.article_types.essay",
        icon: "Feather",
    }),
    newsletter: makeArticleType({
        id: "newsletter",
        label_key: "ui.article_types.newsletter",
        icon: "Mail",
        extra_fields: [
            {
                name: "issue_number",
                type: "number",
                label_key: "ui.article_types.newsletter_field_issue",
            },
        ],
    }),
};

function wrapper(initialTypes?: Record<string, ArticleTypeDef>) {
    return ({children}: {children: ReactNode}) => (
        <ArticleTypesProvider initialTypes={initialTypes}>
            {children}
        </ArticleTypesProvider>
    );
}

beforeEach(() => {
    vi.mocked(api.articleTypes.list).mockReset();
});

describe("useArticleTypes() — Provider with initialTypes", () => {
    it("exposes the snapshot via the hook", () => {
        const {result} = renderHook(() => useArticleTypes(), {
            wrapper: wrapper(SAMPLE_REGISTRY),
        });
        expect(result.current.types).toEqual(SAMPLE_REGISTRY);
        expect(result.current.status).toBe("ready");
    });

    it("ordered array reflects YAML order from the response", () => {
        const {result} = renderHook(() => useArticleTypes(), {
            wrapper: wrapper(SAMPLE_REGISTRY),
        });
        expect(result.current.ordered.map((at) => at.id)).toEqual([
            "blogpost",
            "tutorial",
            "review",
            "essay",
            "newsletter",
        ]);
    });

    it("skips the network fetch when initialTypes is provided", () => {
        renderHook(() => useArticleTypes(), {
            wrapper: wrapper(SAMPLE_REGISTRY),
        });
        expect(api.articleTypes.list).not.toHaveBeenCalled();
    });

    it("defaultId resolves to the type marked default: true", () => {
        const {result} = renderHook(() => useArticleTypes(), {
            wrapper: wrapper(SAMPLE_REGISTRY),
        });
        expect(result.current.defaultId).toBe("blogpost");
    });

    it("defaultId falls back to first registered id when none marked", () => {
        const noDefault: Record<string, ArticleTypeDef> = {
            essay: makeArticleType({id: "essay", default: false}),
            review: makeArticleType({id: "review", default: false}),
        };
        const {result} = renderHook(() => useArticleTypes(), {
            wrapper: wrapper(noDefault),
        });
        expect(result.current.defaultId).toBe("essay");
    });

    it("defaultId falls back to 'blogpost' when registry empty", () => {
        const {result} = renderHook(() => useArticleTypes(), {
            wrapper: wrapper({}),
        });
        expect(result.current.defaultId).toBe("blogpost");
    });
});

describe("useArticleTypes() — Provider fetch-on-mount", () => {
    it("status='loading' before the fetch resolves, then 'ready'", async () => {
        vi.mocked(api.articleTypes.list).mockResolvedValue(SAMPLE_REGISTRY);
        const {result} = renderHook(() => useArticleTypes(), {
            wrapper: wrapper(),
        });
        expect(result.current.status).toBe("loading");
        expect(result.current.types).toEqual({});
        await waitFor(() => expect(result.current.status).toBe("ready"));
        expect(result.current.types).toEqual(SAMPLE_REGISTRY);
    });

    it("status='error' on fetch failure; types stay empty", async () => {
        vi.mocked(api.articleTypes.list).mockRejectedValue(
            new Error("network down"),
        );
        const {result} = renderHook(() => useArticleTypes(), {
            wrapper: wrapper(),
        });
        await waitFor(() => expect(result.current.status).toBe("error"));
        expect(result.current.types).toEqual({});
    });

    it("refresh() re-triggers the fetch", async () => {
        vi.mocked(api.articleTypes.list)
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce(SAMPLE_REGISTRY);
        const {result} = renderHook(() => useArticleTypes(), {
            wrapper: wrapper(),
        });
        await waitFor(() => expect(result.current.status).toBe("ready"));
        expect(result.current.types).toEqual({});
        await result.current.refresh();
        await waitFor(() =>
            expect(result.current.types).toEqual(SAMPLE_REGISTRY),
        );
    });
});

describe("useArticleTypes() outside a provider", () => {
    it("throws a clear error", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => {});
        function Bad() {
            useArticleTypes();
            return null;
        }
        expect(() => render(<Bad />)).toThrow(
            /useArticleTypes must be used within an <ArticleTypesProvider>/,
        );
        spy.mockRestore();
    });
});

describe("articleTypeLabelKey selector", () => {
    it("returns the type's label_key for a known id", () => {
        const {result} = renderHook(() => useArticleTypes(), {
            wrapper: wrapper(SAMPLE_REGISTRY),
        });
        expect(articleTypeLabelKey(result.current, "tutorial")).toBe(
            "ui.article_types.tutorial",
        );
    });

    it("falls back to the bare id for an unknown value", () => {
        const {result} = renderHook(() => useArticleTypes(), {
            wrapper: wrapper(SAMPLE_REGISTRY),
        });
        expect(articleTypeLabelKey(result.current, "unknown_type")).toBe(
            "unknown_type",
        );
    });
});

describe("articleTypeIcon selector", () => {
    it("returns the type's icon for a known id", () => {
        const {result} = renderHook(() => useArticleTypes(), {
            wrapper: wrapper(SAMPLE_REGISTRY),
        });
        expect(articleTypeIcon(result.current, "review")).toBe("Star");
    });

    it("falls back to 'FileText' for an unknown value", () => {
        const {result} = renderHook(() => useArticleTypes(), {
            wrapper: wrapper(SAMPLE_REGISTRY),
        });
        expect(articleTypeIcon(result.current, "unknown_type")).toBe(
            "FileText",
        );
    });
});

describe("ArticleTypesProvider — rendering children", () => {
    it("passes the snapshot to consuming components", () => {
        function Consumer() {
            const {ordered, status, defaultId} = useArticleTypes();
            return (
                <div>
                    <span data-testid="status">{status}</span>
                    <span data-testid="count">{ordered.length}</span>
                    <span data-testid="default">{defaultId}</span>
                </div>
            );
        }
        render(
            <ArticleTypesProvider initialTypes={SAMPLE_REGISTRY}>
                <Consumer />
            </ArticleTypesProvider>,
        );
        expect(screen.getByTestId("status").textContent).toBe("ready");
        expect(screen.getByTestId("count").textContent).toBe("5");
        expect(screen.getByTestId("default").textContent).toBe("blogpost");
    });
});
