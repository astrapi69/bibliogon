import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";

import {PageLayout} from "./PageLayout";

describe("PageLayout (Dialog->Pages shared layout)", () => {
    it("renders the title, children, and root testid", () => {
        render(
            <PageLayout title="My Page" testId="my-page">
                <p>Body content</p>
            </PageLayout>,
        );
        expect(screen.getByRole("heading", {name: "My Page"})).toBeInTheDocument();
        expect(screen.getByText("Body content")).toBeInTheDocument();
        expect(screen.getByTestId("my-page")).toBeInTheDocument();
    });

    it("renders a back button that calls onBack and carries the i18n aria-label", () => {
        const onBack = vi.fn();
        render(
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
        render(
            <PageLayout title="P" testId="p">
                x
            </PageLayout>,
        );
        expect(screen.queryByTestId("p-back")).toBeNull();
    });

    it("applies the maxWidth bucket class", () => {
        render(
            <PageLayout title="P" testId="p" maxWidth="xl">
                x
            </PageLayout>,
        );
        expect(screen.getByTestId("p").querySelector(".max-w-5xl")).toBeTruthy();
    });

    it("renders header actions", () => {
        render(
            <PageLayout title="P" testId="p" actions={<button>Act</button>}>
                x
            </PageLayout>,
        );
        expect(screen.getByRole("button", {name: "Act"})).toBeInTheDocument();
    });
});
