import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import ArticleTranslatePanel from "./ArticleTranslatePanel";
import { FeatureTestProvider } from "../../features/FeatureTestProvider";
import type { Article } from "../../api/client";

// #34 Maximal Offline: article translation executes DeepL/LMStudio through the
// backend translation plugin, so offline (Dexie) it must resolve disabled and
// fire ZERO /api - not fail on the guardedFetch backstop. Online it stays the
// active panel that fetches providers/health.

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "en",
        setLang: () => {},
    }),
}));

const { notifyMock, apiMock } = vi.hoisted(() => ({
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
vi.mock("../../api/client", () => ({
    api: apiMock,
    ApiError: class ApiError extends Error {},
}));

const ARTICLE = { id: "art1", language: "de" } as unknown as Article;

function renderPanel(mode: "api" | "dexie") {
    return render(
        <MemoryRouter>
            <FeatureTestProvider mode={mode}>
                <ArticleTranslatePanel article={ARTICLE} />
            </FeatureTestProvider>
        </MemoryRouter>,
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    apiMock.articleTranslation.providers.mockResolvedValue([]);
    apiMock.articleTranslation.health.mockResolvedValue({});
});

describe("ArticleTranslatePanel offline (Dexie)", () => {
    it("renders the translate control disabled with the desktop-app reason (policy #78)", () => {
        renderPanel("dexie");
        const open = screen.getByTestId("article-editor-translate-open") as HTMLButtonElement;
        expect(open.disabled).toBe(true);
        expect(open.getAttribute("title")).toContain("Desktop-App");
        expect(screen.getByTestId("article-editor-translate-offline")).toBeTruthy();
        // The interactive panel is never mounted offline.
        expect(screen.queryByTestId("article-editor-translate-panel")).toBeNull();
    });

    it("fires ZERO translation /api offline (no providers/health/translate)", async () => {
        renderPanel("dexie");
        // Give any stray effect a tick to (not) run.
        await waitFor(() => expect(screen.getByTestId("article-editor-translate-open")).toBeTruthy());
        expect(apiMock.articleTranslation.providers).not.toHaveBeenCalled();
        expect(apiMock.articleTranslation.health).not.toHaveBeenCalled();
        expect(apiMock.articleTranslation.translate).not.toHaveBeenCalled();
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
