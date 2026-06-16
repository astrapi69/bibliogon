/**
 * Cold-start robustness pin for CreateBookPage (issue #320).
 *
 * The "/books/new crashes on first load" report turned out to be a
 * stale-shell lazy-chunk-load failure (recovered by lib/lazyWithReload),
 * NOT a data race in the page. This test locks in the other half of that
 * finding: even on a true cold start -- empty BookType registry (unseeded)
 * and storage that resolves with no config -- the page renders the form
 * without throwing into its error boundary. If a future change adds an
 * unguarded read of cold-start data, the boundary fallback appears here.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { FeatureProvider } from "@astrapi69/feature-strategy-react";

const getApp = vi.fn().mockResolvedValue({});
const bookTypesList = vi.fn().mockResolvedValue({});
const authorsList = vi.fn().mockResolvedValue([]);

vi.mock("../storage", () => ({
    getStorage: () => ({
        settings: { getApp },
        bookTypes: { list: bookTypesList },
        authors: { list: authorsList, create: vi.fn() },
        books: { create: vi.fn() },
        i18n: { get: vi.fn().mockResolvedValue({}) },
    }),
}));

vi.mock("../api/client", async () => {
    const actual = await vi.importActual<Record<string, unknown>>("../api/client");
    return {
        ...actual,
        api: {
            templates: { list: vi.fn().mockResolvedValue([]), delete: vi.fn() },
            books: { create: vi.fn(), createFromTemplate: vi.fn() },
        },
    };
});

import CreateBookPage from "./CreateBookPage";
import { I18nProvider } from "../hooks/useI18n";
import { BookTypesProvider } from "../hooks/useBookTypes";
import { DialogProvider } from "../components/AppDialog";
import ErrorBoundary from "../components/ErrorBoundary";
import { featureRegistry } from "../features/featureConfig";

function renderCold(url: string) {
    return render(
        <MemoryRouter initialEntries={[url]}>
            <I18nProvider>
                <FeatureProvider
                    registry={featureRegistry}
                    context={{ mode: "dexie", hasAiKey: false }}
                >
                    {/* No initialTypes -> empty registry, status "loading" (cold). */}
                    <BookTypesProvider>
                        <DialogProvider>
                            <Routes>
                                <Route
                                    path="/books/new"
                                    element={
                                        <ErrorBoundary surface="create-book">
                                            <CreateBookPage />
                                        </ErrorBoundary>
                                    }
                                />
                            </Routes>
                        </DialogProvider>
                    </BookTypesProvider>
                </FeatureProvider>
            </I18nProvider>
        </MemoryRouter>,
    );
}

describe("CreateBookPage cold start (empty registry, unseeded storage)", () => {
    it("renders the prose form without hitting the error boundary (?type=prose)", async () => {
        renderCold("/books/new?type=prose");
        await waitFor(() => expect(screen.getByTestId("create-book-title-prose")).toBeTruthy());
        expect(screen.queryByTestId("error-boundary-create-book")).toBeNull();
    });

    it("renders without crashing when no ?type= is given (default-fetch path)", async () => {
        renderCold("/books/new");
        await waitFor(() => expect(screen.getByTestId("create-book-page")).toBeTruthy());
        expect(screen.queryByTestId("error-boundary-create-book")).toBeNull();
    });
});
