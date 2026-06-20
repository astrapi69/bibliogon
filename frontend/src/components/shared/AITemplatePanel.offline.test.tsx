import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AITemplatePanel from "../AITemplatePanel";
import { FeatureTestProvider } from "../../features/FeatureTestProvider";
import { HelpProvider } from "../../contexts/HelpContext";

// AI 1b C4 (feature-strategy migration). Pins the offline branch of the panel:
// Fill runs browser-direct via the ai/aiFill orchestrator (never api.*.aiFill);
// the dialog only offers offline-supported classes. Key-awareness now comes
// from the FeatureProvider context (hasAiKey), not a one-shot getAiConfig probe:
// Fill is disabled offline without a key, active with one. Export/Import
// (ai-template-file-io) call backend /api with no offline path, so they are
// visible but disabled offline regardless of the key (#67, policy #78).

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "en",
        setLang: () => {},
    }),
}));

vi.mock("../../storage/useStorageMode", () => ({
    useStorageMode: () => ({ mode: "dexie", online: false, offlineEnabled: true }),
}));

const { notifyMock, apiMock, aiMock } = vi.hoisted(() => {
    const make = () => vi.fn();
    return {
        notifyMock: {
            success: make(),
            error: make(),
            info: make(),
            warning: make(),
        },
        apiMock: {
            articles: { aiTemplate: { export: make(), import: make() }, aiFill: make() },
            books: { aiTemplate: { export: make(), import: make() }, aiFill: make() },
        },
        aiMock: { aiFillArticle: make(), aiFillBook: make() },
    };
});

vi.mock("../../utils/platform/notify", () => ({ notify: notifyMock }));
vi.mock("../../api/client", () => ({
    api: apiMock,
    ApiError: class ApiError extends Error {},
}));
vi.mock("../../ai/aiFill", () => aiMock);

function renderPanel(kind: "article" | "book", id: string, hasAiKey: boolean) {
    return render(
        <MemoryRouter>
            <HelpProvider>
                <FeatureTestProvider mode="dexie" hasAiKey={hasAiKey}>
                    <AITemplatePanel kind={kind} id={id} />
                </FeatureTestProvider>
            </HelpProvider>
        </MemoryRouter>,
    );
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("AITemplatePanel offline (article)", () => {
    it("enables Fill when a key is configured and runs aiFillArticle (never api.aiFill)", async () => {
        aiMock.aiFillArticle.mockResolvedValue({
            article_id: "a1",
            updated_fields: ["seo_title", "seo_description"],
            skipped_fields: [],
            skip_reasons: {},
            field_class_results: {},
            field_class_errors: {},
            tokens_used: 80,
            estimated_cost_usd: null,
            force: false,
        });
        renderPanel("article", "a1", true);

        const fill = screen.getByTestId("ai-template-fill") as HTMLButtonElement;
        expect(fill.disabled).toBe(false);
        fireEvent.click(fill);
        await waitFor(() => expect(screen.getByTestId("field-class-dialog")).toBeTruthy());

        expect(screen.getByTestId("field-class-seo")).toBeTruthy();
        expect(screen.getByTestId("field-class-excerpt")).toBeTruthy();
        expect(screen.queryByTestId("field-class-image_prompts")).toBeNull();

        fireEvent.click(screen.getByTestId("field-class-checkbox-seo"));
        fireEvent.click(screen.getByTestId("field-class-submit"));
        await waitFor(() => {
            expect(aiMock.aiFillArticle).toHaveBeenCalledWith("a1", {
                field_classes: ["seo"],
                force: false,
            });
            expect(apiMock.articles.aiFill).not.toHaveBeenCalled();
            expect(notifyMock.success).toHaveBeenCalled();
        });
    });

    it("disables Fill with a configure-key hint when no key is configured", () => {
        renderPanel("article", "a1", false);
        const fill = screen.getByTestId("ai-template-fill") as HTMLButtonElement;
        expect(fill.disabled).toBe(true);
        expect(fill.getAttribute("title")).toContain("Settings > AI");
    });

    it("disables Export and Import offline without a key (backend-only, policy #78)", () => {
        renderPanel("article", "a1", false);
        expect(
            (screen.getByTestId("ai-template-export") as HTMLButtonElement).disabled,
        ).toBe(true);
        expect(
            (screen.getByTestId("ai-template-import") as HTMLButtonElement).disabled,
        ).toBe(true);
    });

    it("disables Export and Import offline even with a key (backend-only, no offline path)", () => {
        renderPanel("article", "a1", true);
        expect(
            (screen.getByTestId("ai-template-export") as HTMLButtonElement).disabled,
        ).toBe(true);
        expect(
            (screen.getByTestId("ai-template-import") as HTMLButtonElement).disabled,
        ).toBe(true);
    });
});

describe("AITemplatePanel offline (book)", () => {
    it("offers only offline-supported book classes and runs aiFillBook", async () => {
        aiMock.aiFillBook.mockResolvedValue({
            book_id: "b1",
            updated_fields: ["keywords"],
            skipped_fields: [],
            skip_reasons: {},
            field_class_results: {},
            field_class_errors: {},
            dropped_chapter_summaries: [],
            tokens_used: 40,
            estimated_cost_usd: null,
            force: false,
        });
        renderPanel("book", "b1", true);
        const fill = screen.getByTestId("ai-template-fill") as HTMLButtonElement;
        expect(fill.disabled).toBe(false);
        fireEvent.click(fill);
        await waitFor(() => expect(screen.getByTestId("field-class-dialog")).toBeTruthy());

        expect(screen.getByTestId("field-class-marketing_copy")).toBeTruthy();
        expect(screen.queryByTestId("field-class-cover_prompt")).toBeNull();
        expect(screen.queryByTestId("field-class-chapter_summaries")).toBeNull();

        fireEvent.click(screen.getByTestId("field-class-checkbox-tags"));
        fireEvent.click(screen.getByTestId("field-class-submit"));
        await waitFor(() => {
            expect(aiMock.aiFillBook).toHaveBeenCalledWith("b1", {
                field_classes: ["tags"],
                force: false,
            });
            expect(apiMock.books.aiFill).not.toHaveBeenCalled();
        });
    });
});
