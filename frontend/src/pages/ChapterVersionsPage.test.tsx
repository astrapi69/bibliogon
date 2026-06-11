/**
 * ChapterVersionsPage offline guard.
 *
 * Chapter snapshots are backend-only (`version-history` resolves to `hidden`
 * in Dexie mode). The page must render nothing offline so a direct deep-link
 * fires no `/api`, and render normally online. The layout + view + i18n are
 * stubbed so the test isolates the feature guard.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

import ChapterVersionsPage from "./ChapterVersionsPage";
import { FeatureTestProvider } from "../features/FeatureTestProvider";

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({ t: (_k: string, fallback: string) => fallback }),
}));
vi.mock("../hooks/useGoBack", () => ({ useGoBack: () => vi.fn() }));
vi.mock("../components/PageLayout", () => ({
    PageLayout: ({
        children,
        testId,
    }: {
        children: React.ReactNode;
        testId?: string;
    }) => <div data-testid={testId}>{children}</div>,
}));
vi.mock("../components/ChapterVersionsView", () => ({
    default: () => <div data-testid="cv-view" />,
}));

function renderPage(mode: "api" | "dexie") {
    return render(
        <FeatureTestProvider mode={mode}>
            <MemoryRouter initialEntries={["/books/b1/chapters/c1/snapshots"]}>
                <Routes>
                    <Route
                        path="/books/:bookId/chapters/:chapterId/snapshots"
                        element={<ChapterVersionsPage />}
                    />
                </Routes>
            </MemoryRouter>
        </FeatureTestProvider>,
    );
}

describe("ChapterVersionsPage offline guard", () => {
    it("renders the snapshots page online (api mode)", () => {
        renderPage("api");
        expect(screen.getByTestId("chapter-versions-page")).toBeInTheDocument();
        expect(screen.getByTestId("cv-view")).toBeInTheDocument();
    });

    it("renders nothing offline (version-history hidden in dexie mode)", () => {
        const { container } = renderPage("dexie");
        expect(screen.queryByTestId("chapter-versions-page")).toBeNull();
        expect(container.textContent).toBe("");
    });
});
