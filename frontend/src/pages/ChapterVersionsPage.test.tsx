/**
 * ChapterVersionsPage feature gate.
 *
 * Chapter snapshots run through the storage seam (#728), so the live view
 * mounts in BOTH modes — the offline build keeps a real save history instead
 * of a disabled notice. The registry check stays in place as the single
 * kill-switch (chrome + a FeatureNotice instead of the live view, policy
 * #78), but no evaluation context reaches that branch any more now that the
 * feature is unconditionally active — FeatureNotice has its own tests. The
 * layout + view + i18n are stubbed so the test isolates the gate.
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
vi.mock("../components/shared/PageLayout", () => ({
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

describe("ChapterVersionsPage feature gate", () => {
    // The desktop path stays pinned alongside the offline one: the seam port
    // must not change what online users see.
    it.each(["api", "dexie"] as const)("renders the live snapshots view in %s mode", (mode) => {
        renderPage(mode);
        expect(screen.getByTestId("chapter-versions-page")).toBeInTheDocument();
        expect(screen.getByTestId("cv-view")).toBeInTheDocument();
        expect(screen.queryByTestId("chapter-versions-disabled")).toBeNull();
    });
});
