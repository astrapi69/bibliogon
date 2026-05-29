/**
 * Vitest cases for the useContentTypes() hook + ContentTypesProvider.
 *
 * Filed by ARTICLE-TYPES-SSOT-01 C3 (2026-05-29). Mirrors the
 * useBookTypes.test.tsx shape.
 */

import {describe, it, expect, vi, beforeEach} from "vitest";
import {render, screen, waitFor, renderHook} from "@testing-library/react";
import type {ReactNode} from "react";

import {
    ContentTypesProvider,
    contentTypeIcon,
    contentTypeLabelKey,
    useContentTypes,
} from "./useContentTypes";
import type {ContentTypeDef} from "../api/client";

vi.mock("../api/client", () => ({
    api: {
        contentTypes: {
            list: vi.fn(),
        },
    },
    ContentType: undefined,
}));

import {api} from "../api/client";

function makeContentType(overrides: Partial<ContentTypeDef> = {}): ContentTypeDef {
    return {
        id: overrides.id ?? "blogpost",
        label_key: "ui.content_types.blogpost",
        description_key: "ui.content_types.blogpost_description",
        icon: "FileText",
        default: false,
        extra_fields: [],
        ...overrides,
    } as ContentTypeDef;
}

const SAMPLE_REGISTRY: Record<string, ContentTypeDef> = {
    blogpost: makeContentType({id: "blogpost", default: true}),
    tutorial: makeContentType({
        id: "tutorial",
        label_key: "ui.content_types.tutorial",
        icon: "GraduationCap",
        extra_fields: [
            {
                name: "difficulty_level",
                type: "enum",
                label_key: "ui.content_types.tutorial_field_difficulty",
                values: ["beginner", "intermediate", "advanced"],
            },
        ],
    }),
    review: makeContentType({
        id: "review",
        label_key: "ui.content_types.review",
        icon: "Star",
        extra_fields: [
            {
                name: "rating",
                type: "number",
                label_key: "ui.content_types.review_field_rating",
                min: 1,
                max: 5,
            },
        ],
    }),
    essay: makeContentType({
        id: "essay",
        label_key: "ui.content_types.essay",
        icon: "Feather",
    }),
    newsletter: makeContentType({
        id: "newsletter",
        label_key: "ui.content_types.newsletter",
        icon: "Mail",
        extra_fields: [
            {
                name: "issue_number",
                type: "number",
                label_key: "ui.content_types.newsletter_field_issue",
            },
        ],
    }),
};

function wrapper(initialTypes?: Record<string, ContentTypeDef>) {
    return ({children}: {children: ReactNode}) => (
        <ContentTypesProvider initialTypes={initialTypes}>
            {children}
        </ContentTypesProvider>
    );
}

beforeEach(() => {
    vi.mocked(api.contentTypes.list).mockReset();
});

describe("useContentTypes() — Provider with initialTypes", () => {
    it("exposes the snapshot via the hook", () => {
        const {result} = renderHook(() => useContentTypes(), {
            wrapper: wrapper(SAMPLE_REGISTRY),
        });
        expect(result.current.types).toEqual(SAMPLE_REGISTRY);
        expect(result.current.status).toBe("ready");
    });

    it("ordered array reflects YAML order from the response", () => {
        const {result} = renderHook(() => useContentTypes(), {
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
        renderHook(() => useContentTypes(), {
            wrapper: wrapper(SAMPLE_REGISTRY),
        });
        expect(api.contentTypes.list).not.toHaveBeenCalled();
    });

    it("defaultId resolves to the type marked default: true", () => {
        const {result} = renderHook(() => useContentTypes(), {
            wrapper: wrapper(SAMPLE_REGISTRY),
        });
        expect(result.current.defaultId).toBe("blogpost");
    });

    it("defaultId falls back to first registered id when none marked", () => {
        const noDefault: Record<string, ContentTypeDef> = {
            essay: makeContentType({id: "essay", default: false}),
            review: makeContentType({id: "review", default: false}),
        };
        const {result} = renderHook(() => useContentTypes(), {
            wrapper: wrapper(noDefault),
        });
        expect(result.current.defaultId).toBe("essay");
    });

    it("defaultId falls back to 'blogpost' when registry empty", () => {
        const {result} = renderHook(() => useContentTypes(), {
            wrapper: wrapper({}),
        });
        expect(result.current.defaultId).toBe("blogpost");
    });
});

describe("useContentTypes() — Provider fetch-on-mount", () => {
    it("status='loading' before the fetch resolves, then 'ready'", async () => {
        vi.mocked(api.contentTypes.list).mockResolvedValue(SAMPLE_REGISTRY);
        const {result} = renderHook(() => useContentTypes(), {
            wrapper: wrapper(),
        });
        expect(result.current.status).toBe("loading");
        expect(result.current.types).toEqual({});
        await waitFor(() => expect(result.current.status).toBe("ready"));
        expect(result.current.types).toEqual(SAMPLE_REGISTRY);
    });

    it("status='error' on fetch failure; types stay empty", async () => {
        vi.mocked(api.contentTypes.list).mockRejectedValue(
            new Error("network down"),
        );
        const {result} = renderHook(() => useContentTypes(), {
            wrapper: wrapper(),
        });
        await waitFor(() => expect(result.current.status).toBe("error"));
        expect(result.current.types).toEqual({});
    });

    it("refresh() re-triggers the fetch", async () => {
        vi.mocked(api.contentTypes.list)
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce(SAMPLE_REGISTRY);
        const {result} = renderHook(() => useContentTypes(), {
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

describe("useContentTypes() outside a provider", () => {
    it("throws a clear error", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => {});
        function Bad() {
            useContentTypes();
            return null;
        }
        expect(() => render(<Bad />)).toThrow(
            /useContentTypes must be used within an <ContentTypesProvider>/,
        );
        spy.mockRestore();
    });
});

describe("contentTypeLabelKey selector", () => {
    it("returns the type's label_key for a known id", () => {
        const {result} = renderHook(() => useContentTypes(), {
            wrapper: wrapper(SAMPLE_REGISTRY),
        });
        expect(contentTypeLabelKey(result.current, "tutorial")).toBe(
            "ui.content_types.tutorial",
        );
    });

    it("falls back to the bare id for an unknown value", () => {
        const {result} = renderHook(() => useContentTypes(), {
            wrapper: wrapper(SAMPLE_REGISTRY),
        });
        expect(contentTypeLabelKey(result.current, "unknown_type")).toBe(
            "unknown_type",
        );
    });
});

describe("contentTypeIcon selector", () => {
    it("returns the type's icon for a known id", () => {
        const {result} = renderHook(() => useContentTypes(), {
            wrapper: wrapper(SAMPLE_REGISTRY),
        });
        expect(contentTypeIcon(result.current, "review")).toBe("Star");
    });

    it("falls back to 'FileText' for an unknown value", () => {
        const {result} = renderHook(() => useContentTypes(), {
            wrapper: wrapper(SAMPLE_REGISTRY),
        });
        expect(contentTypeIcon(result.current, "unknown_type")).toBe(
            "FileText",
        );
    });
});

describe("ContentTypesProvider — rendering children", () => {
    it("passes the snapshot to consuming components", () => {
        function Consumer() {
            const {ordered, status, defaultId} = useContentTypes();
            return (
                <div>
                    <span data-testid="status">{status}</span>
                    <span data-testid="count">{ordered.length}</span>
                    <span data-testid="default">{defaultId}</span>
                </div>
            );
        }
        render(
            <ContentTypesProvider initialTypes={SAMPLE_REGISTRY}>
                <Consumer />
            </ContentTypesProvider>,
        );
        expect(screen.getByTestId("status").textContent).toBe("ready");
        expect(screen.getByTestId("count").textContent).toBe("5");
        expect(screen.getByTestId("default").textContent).toBe("blogpost");
    });
});
