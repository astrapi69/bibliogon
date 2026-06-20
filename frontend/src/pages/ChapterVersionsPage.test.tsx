/**
 * ChapterVersionsPage offline guard.
 *
 * Chapter snapshots are backend-only (`version-history` resolves to `disabled`
 * in Dexie mode, policy #78). The page chrome stays visible offline but renders
 * a disabled notice instead of the live view, so a direct deep-link fires no
 * `/api`; online it renders normally. The layout + view + i18n are stubbed so
 * the test isolates the feature guard.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

import ChapterVersionsPage from "./ChapterVersionsPage";
import { FeatureTestProvider } from "../features/FeatureTestProvider";

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({ t: (_k: string, fallback: string) => fallback }),
}));
vi.mock("../hooks/navigation/useGoBack", () => ({ useGoBack: () => vi.fn() }));
vi.mock("../components/PageLayout", () => ({
    PageLayout: ({
        children,
        testId,
    }: {
        children: React.ReactNode;
        testId?: string;
    }) => <div data-testid={testId}>{children}</div>,
}));
vi.mock("../components/book/ChapterVersionsView", () => ({
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

    it("renders the disabled notice offline (no live view, no /api)", () => {
        renderPage("dexie");
        // Page chrome stays visible; the live snapshots view does NOT mount
        // (it would fire /api), the disabled notice does.
        expect(screen.getByTestId("chapter-versions-page")).toBeInTheDocument();
        expect(screen.queryByTestId("cv-view")).toBeNull();
        expect(
            screen.getByTestId("chapter-versions-disabled"),
        ).toBeInTheDocument();
    });
});
