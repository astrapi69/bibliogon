import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import {MemoryRouter} from "react-router-dom";

import {PageLayout} from "./PageLayout";

function renderLayout(ui: React.ReactNode) {
    // PageLayout uses useNavigate (brand -> dashboard), so it needs a router.
    return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("PageLayout (Dialog->Pages shared layout)", () => {
    it("renders the title, children, and root testid", () => {
        renderLayout(
            <PageLayout title="My Page" testId="my-page">
                <p>Body content</p>
            </PageLayout>,
        );
        expect(screen.getByRole("heading", {name: "My Page"})).toBeInTheDocument();
        expect(screen.getByText("Body content")).toBeInTheDocument();
        expect(screen.getByTestId("my-page")).toBeInTheDocument();
    });

    it("carries the app-chrome header: Bibliogon brand + theme toggle", () => {
        renderLayout(
            <PageLayout title="P" testId="p">
                x
            </PageLayout>,
        );
        // Brand reads as "still inside Bibliogon" and links home.
        expect(screen.getByTestId("p-home")).toBeInTheDocument();
        expect(screen.getByText("Bibliogon")).toBeInTheDocument();
        // Same theme control as the other page headers.
        expect(screen.getByTestId("theme-toggle")).toBeInTheDocument();
    });

    it("hides the brand text on narrow viewports (icon-only on mobile)", () => {
        // #392: the "Bibliogon" wordmark is `hidden sm:inline` so only the
        // BookOpen icon shows below the `sm` (640px) breakpoint.
        renderLayout(
            <PageLayout title="P" testId="p">
                x
            </PageLayout>,
        );
        const brand = screen.getByText("Bibliogon");
        expect(brand).toHaveClass("hidden");
        expect(brand).toHaveClass("sm:inline");
        // The home button (with the icon) stays visible at every viewport.
        expect(screen.getByTestId("p-home")).toBeInTheDocument();
    });

    it("renders a back button that calls onBack and carries the i18n aria-label", () => {
        const onBack = vi.fn();
        renderLayout(
            <PageLayout title="P" testId="p" onBack={onBack} backLabel="Zurück">
                x
            </PageLayout>,
        );
        const back = screen.getByTestId("p-back");
        expect(back).toHaveAttribute("aria-label", "Zurück");
        fireEvent.click(back);
        expect(onBack).toHaveBeenCalledOnce();
    });

    it("hides the back button when onBack is omitted", () => {
        renderLayout(
            <PageLayout title="P" testId="p">
                x
            </PageLayout>,
        );
        expect(screen.queryByTestId("p-back")).toBeNull();
    });

    it("applies the maxWidth bucket class to the content column", () => {
        renderLayout(
            <PageLayout title="P" testId="p" maxWidth="xl">
                x
            </PageLayout>,
        );
        expect(screen.getByTestId("p").querySelector(".max-w-5xl")).toBeTruthy();
    });

    it("renders header actions left of the theme toggle", () => {
        renderLayout(
            <PageLayout title="P" testId="p" actions={<button>Act</button>}>
                x
            </PageLayout>,
        );
        expect(screen.getByRole("button", {name: "Act"})).toBeInTheDocument();
    });

    it("applies the titleTestId to the heading", () => {
        renderLayout(
            <PageLayout title="P" testId="p" titleTestId="my-title">
                x
            </PageLayout>,
        );
        expect(screen.getByTestId("my-title").textContent).toBe("P");
    });
});
