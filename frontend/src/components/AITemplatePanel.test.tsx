import { describe, it, expect, vi, beforeEach } from "vitest";
import { render as rtlRender, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import AITemplatePanel from "./AITemplatePanel";
import { HelpProvider } from "../contexts/HelpContext";

// AITemplatePanel now reads useNavigate (Settings deep-link) + useHelp
// (intro "Mehr erfahren"), so unit renders wrap it in a Router +
// HelpProvider the way the real app (BookMetadataEditor / article
// editor) always does.
function render(ui: ReactElement) {
    return rtlRender(
        <MemoryRouter>
            <HelpProvider>{ui}</HelpProvider>
        </MemoryRouter>,
    );
}

vi.mock("@astrapi69/feature-strategy-react", () => ({
    useFeature: () => ({
        state: "active",
        isActive: true,
        isDisabled: false,
        isHidden: false,
        reason: undefined,
    }),
}));

// UNIVERSAL-AI-TEMPLATE-02 Session 2, commit 3/10. Pins the
// panel contract: three buttons each wired to the right API
// method, toast feedback on success / partial / error, blob
// download via synthetic anchor, import dialog reads file as
// text before calling the import API, force toggle flows
// through.

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "en",
        setLang: () => {},
    }),
}));

const { notifyMock, apiMock } = vi.hoisted(() => {
    const make = () => vi.fn();
    return {
        notifyMock: {
            success: make(),
            error: make(),
            info: make(),
            warning: make(),
            saveError: make(),
            bulkAction: make(),
        },
        apiMock: {
            articles: {
                aiTemplate: { export: make(), import: make() },
                aiFill: make(),
            },
            books: {
                aiTemplate: { export: make(), import: make() },
                aiFill: make(),
            },
        },
    };
});

vi.mock("../utils/platform/notify", () => ({ notify: notifyMock }));

vi.mock("../api/client", () => ({
    api: apiMock,
    ApiError: class ApiError extends Error {
        constructor(
            public status: number,
            public detail: string,
        ) {
            super(detail);
            this.name = "ApiError";
        }
    },
}));

const originalCreateObjectURL = globalThis.URL.createObjectURL;
const originalRevokeObjectURL = globalThis.URL.revokeObjectURL;

beforeEach(() => {
    notifyMock.success.mockReset();
    notifyMock.error.mockReset();
    notifyMock.info.mockReset();
    notifyMock.warning.mockReset();
    apiMock.articles.aiTemplate.export.mockReset();
    apiMock.articles.aiTemplate.import.mockReset();
    apiMock.articles.aiFill.mockReset();
    apiMock.books.aiTemplate.export.mockReset();
    apiMock.books.aiTemplate.import.mockReset();
    apiMock.books.aiFill.mockReset();

    // Stub URL APIs that happy-dom doesn't fully implement.
    globalThis.URL.createObjectURL = vi.fn(() => "blob:fake");
    globalThis.URL.revokeObjectURL = vi.fn();
});

// Restore after the suite so other tests aren't affected.
afterAll(() => {
    if (originalCreateObjectURL) globalThis.URL.createObjectURL = originalCreateObjectURL;
    if (originalRevokeObjectURL) globalThis.URL.revokeObjectURL = originalRevokeObjectURL;
});

// AfterAll is exposed by Vitest globals; declare for TS.
declare const afterAll: (fn: () => void) => void;

describe("AITemplatePanel (article)", () => {
    it("renders the three first-class buttons", () => {
        render(<AITemplatePanel kind="article" id="abc" />);
        expect(screen.getByTestId("ai-template-fill")).toBeTruthy();
        expect(screen.getByTestId("ai-template-export")).toBeTruthy();
        expect(screen.getByTestId("ai-template-import")).toBeTruthy();
    });

    it("renders the intro section (default open) with explanation + learn-more link", () => {
        render(<AITemplatePanel kind="article" id="abc" />);
        expect(screen.getByTestId("ai-template-intro-section-trigger")).toBeTruthy();
        expect(screen.getByTestId("ai-template-intro-body")).toBeTruthy();
        expect(screen.getByTestId("ai-template-intro-learn-more")).toBeTruthy();
    });

    it("data-kind reflects the kind prop", () => {
        render(<AITemplatePanel kind="article" id="abc" />);
        expect(screen.getByTestId("ai-template-panel").getAttribute("data-kind")).toBe("article");
    });

    it("Export button downloads the blob via synthetic anchor", async () => {
        const blob = new Blob(["type: article\n"], { type: "text/yaml" });
        apiMock.articles.aiTemplate.export.mockResolvedValue({
            blob,
            filename: "alpha.biblio.yaml",
        });
        render(<AITemplatePanel kind="article" id="abc" />);
        fireEvent.click(screen.getByTestId("ai-template-export"));
        await waitFor(() => {
            expect(apiMock.articles.aiTemplate.export).toHaveBeenCalledWith("abc");
            expect(notifyMock.success).toHaveBeenCalled();
        });
        expect(globalThis.URL.createObjectURL).toHaveBeenCalledWith(blob);
        expect(globalThis.URL.revokeObjectURL).toHaveBeenCalled();
    });

    it("Export error surfaces ApiError detail via notify.error", async () => {
        const { ApiError } = await import("../api/client");
        apiMock.articles.aiTemplate.export.mockRejectedValue(
            new ApiError(404, "Article not found", "/api/x", "GET"),
        );
        render(<AITemplatePanel kind="article" id="abc" />);
        fireEvent.click(screen.getByTestId("ai-template-export"));
        await waitFor(() => {
            expect(notifyMock.error).toHaveBeenCalledWith("Article not found", expect.any(Object));
        });
    });

    it("Fill button opens FieldClassDialog and submit calls aiFill", async () => {
        apiMock.articles.aiFill.mockResolvedValue({
            article_id: "abc",
            updated_fields: ["seo_title", "seo_description"],
            skipped_fields: [],
            skip_reasons: {},
            field_class_results: {},
            field_class_errors: {},
            tokens_used: 120,
            estimated_cost_usd: 0.0024,
            force: false,
        });
        render(<AITemplatePanel kind="article" id="abc" />);
        fireEvent.click(screen.getByTestId("ai-template-fill"));
        await waitFor(() => expect(screen.getByTestId("field-class-dialog")).toBeTruthy());
        fireEvent.click(screen.getByTestId("field-class-checkbox-seo"));
        fireEvent.click(screen.getByTestId("field-class-submit"));
        await waitFor(() => {
            expect(apiMock.articles.aiFill).toHaveBeenCalledWith("abc", {
                field_classes: ["seo"],
                force: false,
            });
            expect(notifyMock.success).toHaveBeenCalled();
        });
    });

    it("Fill with partial errors emits a warning toast (not success)", async () => {
        apiMock.articles.aiFill.mockResolvedValue({
            article_id: "abc",
            updated_fields: [],
            skipped_fields: [],
            skip_reasons: {},
            field_class_results: {},
            field_class_errors: { seo: "Outage" },
            tokens_used: 0,
            estimated_cost_usd: null,
            force: false,
        });
        render(<AITemplatePanel kind="article" id="abc" />);
        fireEvent.click(screen.getByTestId("ai-template-fill"));
        fireEvent.click(screen.getByTestId("field-class-checkbox-seo"));
        fireEvent.click(screen.getByTestId("field-class-submit"));
        await waitFor(() => {
            expect(notifyMock.warning).toHaveBeenCalled();
            expect(notifyMock.success).not.toHaveBeenCalled();
        });
    });

    it("Fill failure surfaces ApiError detail via notify.error", async () => {
        const { ApiError } = await import("../api/client");
        apiMock.articles.aiFill.mockRejectedValue(
            new ApiError(403, "AI features are disabled", "/api/x", "POST"),
        );
        render(<AITemplatePanel kind="article" id="abc" />);
        fireEvent.click(screen.getByTestId("ai-template-fill"));
        fireEvent.click(screen.getByTestId("field-class-checkbox-seo"));
        fireEvent.click(screen.getByTestId("field-class-submit"));
        await waitFor(() =>
            expect(notifyMock.error).toHaveBeenCalledWith(
                "AI features are disabled",
                expect.any(Object),
            ),
        );
    });

    it("Import button opens the import dialog with drop zone", async () => {
        render(<AITemplatePanel kind="article" id="abc" />);
        fireEvent.click(screen.getByTestId("ai-template-import"));
        await waitFor(() => expect(screen.getByTestId("ai-template-import-dialog")).toBeTruthy());
        expect(screen.getByTestId("template-import-dropzone")).toBeTruthy();
    });

    it("Import submit reads the file as text and POSTs it", async () => {
        apiMock.articles.aiTemplate.import.mockResolvedValue({
            article_id: "abc",
            updated_fields: ["seo_title"],
            skipped_fields: [],
            skip_reasons: {},
            force: false,
        });
        const onApplied = vi.fn() as () => void;

        render(<AITemplatePanel kind="article" id="abc" onApplied={onApplied} />);
        fireEvent.click(screen.getByTestId("ai-template-import"));
        const dropzone = screen.getByTestId("template-import-dropzone");
        const file = new File(["type: article\nschema_version: 1\n"], "alpha.biblio.yaml");
        fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

        // File preview confirms the drop registered.
        await waitFor(() =>
            expect(screen.getByTestId("template-import-file-preview")).toBeTruthy(),
        );

        fireEvent.click(screen.getByTestId("ai-template-import-submit"));
        await waitFor(() => {
            expect(apiMock.articles.aiTemplate.import).toHaveBeenCalledWith(
                "abc",
                "type: article\nschema_version: 1\n",
                false,
            );
            expect(notifyMock.success).toHaveBeenCalled();
            expect(onApplied).toHaveBeenCalledTimes(1);
        });
    });

    it("Import submit is disabled until a file is picked", () => {
        render(<AITemplatePanel kind="article" id="abc" />);
        fireEvent.click(screen.getByTestId("ai-template-import"));
        const submit = screen.getByTestId("ai-template-import-submit") as HTMLButtonElement;
        expect(submit.disabled).toBe(true);
    });

    it("Import force toggle propagates to the API call", async () => {
        apiMock.articles.aiTemplate.import.mockResolvedValue({
            article_id: "abc",
            updated_fields: [],
            skipped_fields: [],
            skip_reasons: {},
            force: true,
        });
        render(<AITemplatePanel kind="article" id="abc" />);
        fireEvent.click(screen.getByTestId("ai-template-import"));
        fireEvent.click(screen.getByTestId("ai-template-import-force"));
        const file = new File(["x"], "x.biblio.yaml");
        fireEvent.drop(screen.getByTestId("template-import-dropzone"), {
            dataTransfer: { files: [file] },
        });
        fireEvent.click(screen.getByTestId("ai-template-import-submit"));
        await waitFor(() =>
            expect(apiMock.articles.aiTemplate.import).toHaveBeenCalledWith("abc", "x", true),
        );
    });

    it("Import with zero updates emits info (not success) toast", async () => {
        apiMock.articles.aiTemplate.import.mockResolvedValue({
            article_id: "abc",
            updated_fields: [],
            skipped_fields: ["title"],
            skip_reasons: { title: "field-already-populated" },
            force: false,
        });
        render(<AITemplatePanel kind="article" id="abc" />);
        fireEvent.click(screen.getByTestId("ai-template-import"));
        const file = new File(["x"], "x.biblio.yaml");
        fireEvent.drop(screen.getByTestId("template-import-dropzone"), {
            dataTransfer: { files: [file] },
        });
        fireEvent.click(screen.getByTestId("ai-template-import-submit"));
        await waitFor(() => {
            expect(notifyMock.info).toHaveBeenCalled();
            expect(notifyMock.success).not.toHaveBeenCalled();
        });
    });
});

describe("AITemplatePanel (book)", () => {
    it("routes to api.books namespace", async () => {
        const blob = new Blob(["type: book\n"], { type: "text/yaml" });
        apiMock.books.aiTemplate.export.mockResolvedValue({
            blob,
            filename: "the-book.biblio.yaml",
        });
        render(<AITemplatePanel kind="book" id="b1" />);
        fireEvent.click(screen.getByTestId("ai-template-export"));
        await waitFor(() => {
            expect(apiMock.books.aiTemplate.export).toHaveBeenCalledWith("b1");
            expect(apiMock.articles.aiTemplate.export).not.toHaveBeenCalled();
        });
    });

    it("Import with dropped_chapter_summaries emits a follow-up info toast", async () => {
        apiMock.books.aiTemplate.import.mockResolvedValue({
            book_id: "b1",
            updated_fields: ["chapter_summaries"],
            skipped_fields: [],
            skip_reasons: {},
            dropped_chapter_summaries: [{ reason: "no-matching-chapter", chapter_id: "ghost" }],
            force: false,
        });
        render(<AITemplatePanel kind="book" id="b1" />);
        fireEvent.click(screen.getByTestId("ai-template-import"));
        const file = new File(["x"], "x.biblio.yaml");
        fireEvent.drop(screen.getByTestId("template-import-dropzone"), {
            dataTransfer: { files: [file] },
        });
        fireEvent.click(screen.getByTestId("ai-template-import-submit"));
        await waitFor(() => {
            // Success toast (1 field updated) + dropped-summaries info toast.
            expect(notifyMock.success).toHaveBeenCalledTimes(1);
            expect(notifyMock.info).toHaveBeenCalledTimes(1);
        });
    });

    it("book Fill kind renders book-specific field-classes", async () => {
        render(<AITemplatePanel kind="book" id="b1" />);
        fireEvent.click(screen.getByTestId("ai-template-fill"));
        await waitFor(() => expect(screen.getByTestId("field-class-marketing_copy")).toBeTruthy());
        // Article-only class must NOT appear.
        expect(screen.queryByTestId("field-class-image_prompts")).toBeNull();
    });
});
