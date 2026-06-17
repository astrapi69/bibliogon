/**
 * Cold-start RENDER-safety pin for `/books/new` (issue #325).
 *
 * The first-cold-load `/books/new` crash was reported as a possible render
 * race in the offline build, but the create-book tree is render-safe: the
 * actual cause is a transient chunk-load failure, fixed in
 * `lib/lazyWithReload`. This pin LOCKS IN the render-safety half of that
 * finding so a future unguarded cold-start read would surface here.
 *
 * Cold-start data state modelled here: `getStorage()` is the ApiStorage
 * fallback (DexieStorage chunk not yet loaded) whose every read rejects
 * under the offline guard. The real I18n / Feature / BookTypes / Dialog
 * providers wrap the page, and the optional-fields Collapsible is opened so
 * the full form subtree (ComboboxSelect, language options, AuthorSelectInput)
 * renders. The page must render the form, NOT crash into
 * `error-boundary-create-book`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { FeatureProvider } from "@astrapi69/feature-strategy-react";

function rejectRead(): Promise<never> {
    return Promise.reject(new Error("offline: /api blocked"));
}

vi.mock("../storage", async () => {
    const actual = await vi.importActual<Record<string, unknown>>("../storage");
    return {
        ...actual,
        getStorage: () => ({
            settings: { getApp: rejectRead, updateApp: rejectRead },
            bookTypes: { list: rejectRead },
            contentTypes: { list: rejectRead },
            authors: { list: rejectRead, create: rejectRead },
            books: { create: rejectRead },
            i18n: { get: rejectRead },
        }),
    };
});

import CreateBookPage from "./CreateBookPage";
import { I18nProvider } from "../hooks/useI18n";
import { BookTypesProvider } from "../hooks/useBookTypes";
import { DialogProvider } from "../components/AppDialog";
import ErrorBoundary from "../components/ErrorBoundary";
import { featureRegistry } from "../features/featureConfig";

function renderColdStart(url: string) {
    return render(
        <MemoryRouter initialEntries={[url]}>
            <I18nProvider>
                <FeatureProvider
                    registry={featureRegistry}
                    context={{ mode: "dexie", hasAiKey: false }}
                >
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

describe("CreateBookPage cold start (ApiStorage fallback, all reads reject)", () => {
    beforeEach(() => {
        localStorage.setItem("bibliogon.storage_mode", "dexie");
    });

    afterEach(() => {
        localStorage.clear();
    });

    it("renders the create form (?type=prose) without the route error boundary", async () => {
        renderColdStart("/books/new?type=prose");
        await waitFor(() =>
            expect(screen.getByTestId("create-book-page")).toBeTruthy(),
        );
        expect(screen.queryByTestId("error-boundary-create-book")).toBeNull();
        expect(
            screen.getByPlaceholderText("Der Titel deines Buches"),
        ).toBeTruthy();
    });

    it("renders the full form subtree (optional fields expanded) without crashing", async () => {
        renderColdStart("/books/new?type=prose");
        await waitFor(() =>
            expect(screen.getByTestId("create-book-more-details")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("create-book-more-details"));
        await waitFor(() =>
            expect(screen.getByTestId("create-book-language")).toBeTruthy(),
        );
        expect(screen.queryByTestId("error-boundary-create-book")).toBeNull();
    });

    it("renders without crashing when no ?type= is given (default-fetch path)", async () => {
        renderColdStart("/books/new");
        await waitFor(() =>
            expect(screen.getByTestId("create-book-page")).toBeTruthy(),
        );
        expect(screen.queryByTestId("error-boundary-create-book")).toBeNull();
    });
});
