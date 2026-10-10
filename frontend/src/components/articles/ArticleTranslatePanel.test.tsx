import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import ArticleTranslatePanel from "./ArticleTranslatePanel";
import { FeatureTestProvider } from "../../features/FeatureTestProvider";
import type { Article } from "../../api/client";

// #34 Maximal Offline, revised by #751. DeepL and LMStudio still run
// through the backend plugin, but offline the article is translated through
// the user's own AI provider, so the gate is a key rather than "requires the
// desktop app". Without a key: disabled, explained, ZERO /api. With a key:
// active, and the AI path runs instead of the backend one. Online is
// unchanged - the provider dropdown and its providers/health fetch.

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        // Feature-reason keys come back as the KEY, not the fallback: the
        // assertion that matters is which reason the gate chose, and a mock
        // that always returns the fallback would make every reason look the
        // same.
        t: (key: string, fallback: string) =>
            key.startsWith("ui.feature.") ? key : fallback,
        lang: "en",
        setLang: () => {},
    }),
}));

const { notifyMock, apiMock, storageMock, translateMock } = vi.hoisted(() => ({
    storageMock: { mode: "api" as "api" | "dexie" },
    translateMock: vi.fn(),
    notifyMock: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
    apiMock: {
        articleTranslation: {
            providers: vi.fn(),
            health: vi.fn(),
            translate: vi.fn(),
        },
    },
}));

vi.mock("../../utils/platform/notify", () => ({ notify: notifyMock }));
vi.mock("../../storage", () => ({ getStorage: () => storageMock }));
vi.mock("../../utils/translation/translateArticleWithAi", () => ({
    translateArticleWithAi: translateMock,
}));
vi.mock("../../api/client", () => ({
    api: apiMock,
    ApiError: class ApiError extends Error {},
}));

const ARTICLE = { id: "art1", language: "de" } as unknown as Article;

function renderPanel(mode: "api" | "dexie", hasAiKey = true) {
    storageMock.mode = mode;
    return render(
        <MemoryRouter>
            <FeatureTestProvider mode={mode} hasAiKey={hasAiKey}>
                <ArticleTranslatePanel article={ARTICLE} />
            </FeatureTestProvider>
        </MemoryRouter>,
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    apiMock.articleTranslation.providers.mockResolvedValue([]);
    apiMock.articleTranslation.health.mockResolvedValue({});
    storageMock.mode = "api";
    translateMock.mockResolvedValue({ articleId: "new-1", untranslatedPieces: 0 });
});

describe("ArticleTranslatePanel offline without a key (Dexie)", () => {
    it("renders the control disabled and explains the key, not the desktop (policy #78)", () => {
        // The reason comes from the registry rather than a hardcoded
        // string: telling a PWA user to install the desktop app when what
        // they need is an API key sends them to the wrong place.
        renderPanel("dexie", false);
        const open = screen.getByTestId("article-editor-translate-open") as HTMLButtonElement;
        expect(open.disabled).toBe(true);
        expect(open.getAttribute("title")).toBe("ui.feature.requires_ai_key");
        expect(screen.getByTestId("article-editor-translate-offline")).toBeTruthy();
        // The interactive panel is never mounted while unavailable.
        expect(screen.queryByTestId("article-editor-translate-panel")).toBeNull();
    });

    it("fires ZERO translation /api (no providers/health/translate)", async () => {
        renderPanel("dexie", false);
        await waitFor(() => expect(screen.getByTestId("article-editor-translate-open")).toBeTruthy());
        expect(apiMock.articleTranslation.providers).not.toHaveBeenCalled();
        expect(apiMock.articleTranslation.health).not.toHaveBeenCalled();
        expect(apiMock.articleTranslation.translate).not.toHaveBeenCalled();
    });
});

describe("ArticleTranslatePanel offline with a key (Dexie, #751)", () => {
    it("opens the panel and asks no provider endpoint", async () => {
        // There is no provider choice offline - it is whichever AI provider
        // the user configured - so the dropdown and the /providers +
        // /health fetch that fills it stay away.
        renderPanel("dexie");
        const open = screen.getByTestId("article-editor-translate-open") as HTMLButtonElement;
        expect(open.disabled).toBe(false);
        fireEvent.click(open);
        await waitFor(() =>
            expect(screen.getByTestId("article-editor-translate-panel")).toBeTruthy(),
        );
        expect(apiMock.articleTranslation.providers).not.toHaveBeenCalled();
        expect(apiMock.articleTranslation.health).not.toHaveBeenCalled();
    });

    it("translates through the AI path, never the backend one", async () => {
        renderPanel("dexie");
        fireEvent.click(screen.getByTestId("article-editor-translate-open"));
        await waitFor(() =>
            expect(screen.getByTestId("article-editor-translate-panel")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("article-editor-translate-submit"));

        await waitFor(() => expect(translateMock).toHaveBeenCalled());
        expect(translateMock.mock.calls[0][1]).toMatchObject({targetLang: "en"});
        expect(apiMock.articleTranslation.translate).not.toHaveBeenCalled();
        expect(notifyMock.success).toHaveBeenCalled();
    });

    it("says so when a piece came back untranslated", async () => {
        // Passing a partly-translated article off as a clean translation
        // is the outcome this prevents; the user needs to know which
        // article to re-read.
        translateMock.mockResolvedValue({articleId: "new-1", untranslatedPieces: 2});
        renderPanel("dexie");
        fireEvent.click(screen.getByTestId("article-editor-translate-open"));
        await waitFor(() =>
            expect(screen.getByTestId("article-editor-translate-panel")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("article-editor-translate-submit"));

        await waitFor(() => expect(notifyMock.warning).toHaveBeenCalled());
        expect(String(notifyMock.warning.mock.calls[0][0])).toContain("2");
    });
});

describe("ArticleTranslatePanel online (api)", () => {
    it("renders the open control enabled (feature active)", () => {
        renderPanel("api");
        const open = screen.getByTestId("article-editor-translate-open") as HTMLButtonElement;
        expect(open.disabled).toBe(false);
        expect(screen.queryByTestId("article-editor-translate-offline")).toBeNull();
    });

    it("fetches providers + health when the panel is opened (active path)", async () => {
        renderPanel("api");
        fireEvent.click(screen.getByTestId("article-editor-translate-open"));
        await waitFor(() => {
            expect(apiMock.articleTranslation.providers).toHaveBeenCalled();
            expect(apiMock.articleTranslation.health).toHaveBeenCalled();
        });
    });
});
