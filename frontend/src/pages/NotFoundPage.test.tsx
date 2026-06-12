import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import NotFoundPage from "./NotFoundPage";

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback?: string) => fallback ?? _key,
        lang: "de",
    }),
}));

describe("NotFoundPage", () => {
    it("renders the 404 message and a link home", () => {
        render(
            <MemoryRouter>
                <NotFoundPage />
            </MemoryRouter>,
        );
        expect(screen.getByTestId("not-found-page")).toBeInTheDocument();
        expect(screen.getByText("404")).toBeInTheDocument();
        const home = screen.getByTestId("not-found-home-link");
        expect(home).toHaveAttribute("href", "/");
    });

    it("is rendered by the catch-all route for an unknown path", () => {
        render(
            <MemoryRouter initialEntries={["/this/route/does/not/exist"]}>
                <Routes>
                    <Route path="/" element={<div>home</div>} />
                    <Route path="*" element={<NotFoundPage />} />
                </Routes>
            </MemoryRouter>,
        );
        expect(screen.getByTestId("not-found-page")).toBeInTheDocument();
    });
});
