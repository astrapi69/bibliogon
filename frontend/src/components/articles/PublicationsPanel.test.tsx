/**
 * AR-02 Phase 2 PublicationsPanel tests.
 *
 * Pin the contract:
 * - Empty state renders when no publications exist
 * - Publication rows show platform label + status pill
 * - Drift warning appears for out_of_sync rows
 * - mark-published / verify-live forward to the right API
 * - AddPublicationModal forwards platform + metadata to create
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

import { PublicationsPanel } from "./PublicationsPanel";
import type { PlatformSchema, Publication } from "../../api/client";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

const mockListPubs = vi.fn();
const mockCreatePub = vi.fn();
const mockMarkPublished = vi.fn();
const mockVerifyLive = vi.fn();
const mockDeletePub = vi.fn();
const mockListPlatforms = vi.fn();

vi.mock("../../api/client", () => ({
    api: {
        publications: {
            list: (...args: unknown[]) => mockListPubs(...args),
            create: (...args: unknown[]) => mockCreatePub(...args),
            markPublished: (...args: unknown[]) => mockMarkPublished(...args),
            verifyLive: (...args: unknown[]) => mockVerifyLive(...args),
            delete: (...args: unknown[]) => mockDeletePub(...args),
        },
        articlePlatforms: {
            list: (...args: unknown[]) => mockListPlatforms(...args),
        },
    },
    ApiError: class extends Error {
        status: number;
        detail: string;
        detailBody?: Record<string, unknown>;
        constructor(
            status: number,
            detail: string,
            _url = "",
            _method = "POST",
            _stack = "",
            detailBody?: Record<string, unknown>,
        ) {
            super(detail);
            this.status = status;
            this.detail = detail;
            this.detailBody = detailBody;
        }
    },
}));

vi.mock("../../utils/notify", () => ({
    notify: {
        error: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
        info: vi.fn(),
    },
}));

const confirmMock = vi.fn();
vi.mock("../AppDialog", () => ({
    useDialog: () => ({
        confirm: confirmMock,
        prompt: vi.fn(),
        alert: vi.fn(),
        choose: vi.fn(),
    }),
}));

const SCHEMAS: Record<string, PlatformSchema> = {
    medium: {
        display_name: "Medium",
        required_metadata: ["title", "tags"],
        optional_metadata: ["subtitle", "canonical_url"],
        max_tags: 5,
        publishing_method: "manual",
    },
    x: {
        display_name: "X (Twitter)",
        required_metadata: ["body"],
        optional_metadata: ["hashtags"],
        max_chars_per_post: 280,
        publishing_method: "manual",
    },
};

function makePub(overrides: Partial<Publication> = {}): Publication {
    return {
        id: "p-1",
        article_id: "a-1",
        platform: "medium",
        is_promo: false,
        status: "planned",
        platform_metadata: {},
        content_snapshot_at_publish: null,
        scheduled_at: null,
        published_at: null,
        last_verified_at: null,
        notes: null,
        created_at: "2026-04-27T18:00:00Z",
        updated_at: "2026-04-27T18:00:00Z",
        ...overrides,
    };
}

async function renderPanel(pubs: Publication[]): Promise<void> {
    mockListPubs.mockResolvedValue(pubs);
    mockListPlatforms.mockResolvedValue(SCHEMAS);
    await act(async () => {
        render(<PublicationsPanel articleId="a-1" />);
    });
    await waitFor(() => expect(mockListPubs).toHaveBeenCalled());
}

describe("PublicationsPanel", () => {
    beforeEach(() => {
        mockListPubs.mockReset();
        mockCreatePub.mockReset();
        mockMarkPublished.mockReset();
        mockVerifyLive.mockReset();
        mockDeletePub.mockReset();
        mockListPlatforms.mockReset();
        confirmMock.mockReset();
    });

    it("renders empty state when no publications", async () => {
        await renderPanel([]);
        expect(
            screen.getByTestId("publications-empty"),
        ).toBeInTheDocument();
    });

    it("renders one row per publication with platform label + status", async () => {
        await renderPanel([
            makePub({ id: "p-1", platform: "medium", status: "planned" }),
            makePub({ id: "p-2", platform: "x", status: "published" }),
        ]);
        await waitFor(() =>
            expect(screen.getByTestId("publication-row-p-1")).toBeInTheDocument(),
        );
        expect(
            screen.getByTestId("publication-row-p-1").textContent,
        ).toContain("Medium");
        expect(
            screen.getByTestId("publication-row-status-p-1").textContent,
        ).toContain("planned");
        expect(
            screen.getByTestId("publication-row-p-2").textContent,
        ).toContain("X (Twitter)");
    });

    it("renders drift warning for out_of_sync rows", async () => {
        await renderPanel([
            makePub({ id: "p-drift", status: "out_of_sync" }),
        ]);
        await waitFor(() =>
            expect(
                screen.getByTestId("publication-drift-warning-p-drift"),
            ).toBeInTheDocument(),
        );
    });

    it("Mark-Published button forwards to api.publications.markPublished", async () => {
        await renderPanel([makePub({ id: "p-mark", status: "planned" })]);
        mockMarkPublished.mockResolvedValue(
            makePub({ id: "p-mark", status: "published" }),
        );
        // Refresh after mark calls listPubs again with the same article.
        mockListPubs.mockResolvedValue([
            makePub({ id: "p-mark", status: "published" }),
        ]);

        fireEvent.click(
            screen.getByTestId("publication-mark-published-p-mark"),
        );
        await waitFor(() =>
            expect(mockMarkPublished).toHaveBeenCalledWith("a-1", "p-mark", {}),
        );
    });

    it("Verify-Live button shows on published rows and forwards", async () => {
        await renderPanel([
            makePub({ id: "p-pub", status: "published" }),
        ]);
        mockVerifyLive.mockResolvedValue(
            makePub({ id: "p-pub", status: "published" }),
        );

        fireEvent.click(screen.getByTestId("publication-verify-live-p-pub"));
        await waitFor(() =>
            expect(mockVerifyLive).toHaveBeenCalledWith("a-1", "p-pub"),
        );
    });

    it("Add modal forwards platform + metadata to create", async () => {
        await renderPanel([]);
        mockCreatePub.mockResolvedValue(makePub({ id: "new-id" }));

        fireEvent.click(screen.getByTestId("publications-add-btn"));
        await waitFor(() =>
            expect(
                screen.getByTestId("publications-add-modal"),
            ).toBeInTheDocument(),
        );
        // Default platform is the first in schema map (medium).
        fireEvent.change(screen.getByTestId("publications-add-field-title"), {
            target: { value: "My Article" },
        });
        fireEvent.change(screen.getByTestId("publications-add-field-tags"), {
            target: { value: "ai, python" },
        });
        fireEvent.click(screen.getByTestId("publications-add-submit"));

        await waitFor(() => expect(mockCreatePub).toHaveBeenCalledTimes(1));
        const [, payload] = mockCreatePub.mock.calls[0];
        expect(payload.platform).toBe("medium");
        expect(payload.platform_metadata.title).toBe("My Article");
        expect(payload.platform_metadata.tags).toEqual(["ai", "python"]);
    });

    it("Add modal surfaces 400 errors from backend", async () => {
        await renderPanel([]);
        const ApiError = (await import("../../api/client")).ApiError;
        mockCreatePub.mockRejectedValue(
            new ApiError(
                400,
                "validation",
                "/...",
                "POST",
                "",
                {
                    error: "platform_metadata_invalid",
                    errors: ["missing required field: title"],
                },
            ),
        );

        fireEvent.click(screen.getByTestId("publications-add-btn"));
        await waitFor(() =>
            expect(
                screen.getByTestId("publications-add-modal"),
            ).toBeInTheDocument(),
        );
        fireEvent.click(screen.getByTestId("publications-add-submit"));

        await waitFor(() =>
            expect(screen.getByTestId("publications-add-errors")).toBeInTheDocument(),
        );
        expect(
            screen.getByTestId("publications-add-errors").textContent,
        ).toContain("missing required field: title");
    });
});
