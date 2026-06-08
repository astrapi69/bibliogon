import {describe, it, expect, vi, beforeEach} from "vitest"
import {render, screen, fireEvent, waitFor} from "@testing-library/react"
import AITemplatePanel from "./AITemplatePanel"

// AI 1b C4. Pins the offline branch of the panel: Fill runs browser-direct via
// the ai/aiFill orchestrator (never api.*.aiFill), availability follows whether
// an AI key is configured, the dialog only offers offline-supported classes,
// and Export/Import stay gated offline.

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "en",
        setLang: () => {},
    }),
}))

vi.mock("../storage/useOfflineFeatureGate", () => ({
    useOfflineFeatureGate: () => ({offline: true, message: "requires desktop"}),
}))

const {notifyMock, apiMock, aiMock, configMock} = vi.hoisted(() => {
    const make = () => vi.fn()
    return {
        notifyMock: {success: make(), error: make(), info: make(), warning: make()},
        apiMock: {
            articles: {aiTemplate: {export: make(), import: make()}, aiFill: make()},
            books: {aiTemplate: {export: make(), import: make()}, aiFill: make()},
        },
        aiMock: {aiFillArticle: make(), aiFillBook: make()},
        configMock: {getAiConfig: make(), isAiConfigured: make()},
    }
})

vi.mock("../utils/notify", () => ({notify: notifyMock}))
vi.mock("../api/client", () => ({
    api: apiMock,
    ApiError: class ApiError extends Error {},
}))
vi.mock("../ai/aiFill", () => aiMock)
vi.mock("../ai/llmClient", () => configMock)

beforeEach(() => {
    vi.clearAllMocks()
    configMock.getAiConfig.mockResolvedValue({
        provider: "openai",
        base_url: "https://api.openai.com/v1",
        model: "gpt-4o",
        api_key: "sk-test",
    })
    configMock.isAiConfigured.mockReturnValue(true)
})

describe("AITemplatePanel offline (article)", () => {
    it("enables Fill when configured and runs aiFillArticle (never api.aiFill)", async () => {
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
        })
        render(<AITemplatePanel kind="article" id="a1"/>)

        const fill = await waitFor(() => {
            const btn = screen.getByTestId("ai-template-fill") as HTMLButtonElement
            expect(btn.disabled).toBe(false)
            return btn
        })
        fireEvent.click(fill)
        await waitFor(() => expect(screen.getByTestId("field-class-dialog")).toBeTruthy())

        // Only offline-supported classes are offered; image_prompts is absent.
        expect(screen.getByTestId("field-class-seo")).toBeTruthy()
        expect(screen.getByTestId("field-class-excerpt")).toBeTruthy()
        expect(screen.queryByTestId("field-class-image_prompts")).toBeNull()

        fireEvent.click(screen.getByTestId("field-class-checkbox-seo"))
        fireEvent.click(screen.getByTestId("field-class-submit"))
        await waitFor(() => {
            expect(aiMock.aiFillArticle).toHaveBeenCalledWith("a1", {
                field_classes: ["seo"],
                force: false,
            })
            expect(apiMock.articles.aiFill).not.toHaveBeenCalled()
            expect(notifyMock.success).toHaveBeenCalled()
        })
    })

    it("disables Fill with a configure-key hint when no key is configured", async () => {
        configMock.isAiConfigured.mockReturnValue(false)
        render(<AITemplatePanel kind="article" id="a1"/>)
        // The readiness probe resolves to not-ready; the button stays disabled.
        await waitFor(() => expect(configMock.getAiConfig).toHaveBeenCalled())
        const fill = screen.getByTestId("ai-template-fill") as HTMLButtonElement
        expect(fill.disabled).toBe(true)
        expect(fill.getAttribute("title")).toContain("Settings > AI")
    })

    it("keeps Export and Import gated offline", () => {
        render(<AITemplatePanel kind="article" id="a1"/>)
        expect(
            (screen.getByTestId("ai-template-export") as HTMLButtonElement).disabled,
        ).toBe(true)
        expect(
            (screen.getByTestId("ai-template-import") as HTMLButtonElement).disabled,
        ).toBe(true)
    })
})

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
        })
        render(<AITemplatePanel kind="book" id="b1"/>)
        const fill = await waitFor(() => {
            const btn = screen.getByTestId("ai-template-fill") as HTMLButtonElement
            expect(btn.disabled).toBe(false)
            return btn
        })
        fireEvent.click(fill)
        await waitFor(() => expect(screen.getByTestId("field-class-dialog")).toBeTruthy())

        expect(screen.getByTestId("field-class-marketing_copy")).toBeTruthy()
        expect(screen.queryByTestId("field-class-cover_prompt")).toBeNull()
        expect(screen.queryByTestId("field-class-chapter_summaries")).toBeNull()

        fireEvent.click(screen.getByTestId("field-class-checkbox-tags"))
        fireEvent.click(screen.getByTestId("field-class-submit"))
        await waitFor(() => {
            expect(aiMock.aiFillBook).toHaveBeenCalledWith("b1", {
                field_classes: ["tags"],
                force: false,
            })
            expect(apiMock.books.aiFill).not.toHaveBeenCalled()
        })
    })
})
