/**
 * EmptyState tests pin the render-variant contract:
 *  - icon only (CoverUpload-shape)
 *  - icon + title (Dashboard trash-shape)
 *  - icon + title + body (article filter-empty + body string)
 *  - icon + title + body + actions (Dashboard welcome / article list empty)
 *  - testId is forwarded to the root div
 *  - JSX title/body bypasses the default string-wrapping
 */

import {describe, it, expect} from "vitest";
import {render, screen} from "@testing-library/react";
import {EmptyState} from "./EmptyState";

describe("EmptyState", () => {
    it("renders just an icon when title + body + actions are omitted", () => {
        render(
            <EmptyState
                testId="solo-icon"
                icon={<svg data-testid="my-icon" />}
            />,
        );
        expect(screen.getByTestId("solo-icon")).toBeTruthy();
        expect(screen.getByTestId("my-icon")).toBeTruthy();
    });

    it("renders title + body as paragraphs when given strings", () => {
        render(
            <EmptyState
                testId="basic"
                title="No items"
                body="Create your first one."
            />,
        );
        expect(screen.getByText("No items")).toBeTruthy();
        expect(screen.getByText("Create your first one.")).toBeTruthy();
    });

    it("renders title as JSX when given a JSX element (no default wrap)", () => {
        render(
            <EmptyState
                testId="jsx-title"
                title={<h3 data-testid="custom-h3">Custom heading</h3>}
            />,
        );
        // The custom-h3 should be present and the EmptyState should NOT wrap
        // it in its own ``<p class="title">``.
        const h3 = screen.getByTestId("custom-h3");
        expect(h3).toBeTruthy();
        expect(h3.tagName).toBe("H3");
    });

    it("renders body as JSX when given a JSX element", () => {
        render(
            <EmptyState
                testId="jsx-body"
                body={<div data-testid="custom-body">Rich content</div>}
            />,
        );
        expect(screen.getByTestId("custom-body")).toBeTruthy();
    });

    it("renders actions row with one button", () => {
        render(
            <EmptyState
                testId="one-action"
                title="No results"
                actions={<button data-testid="reset">Reset</button>}
            />,
        );
        expect(screen.getByTestId("reset")).toBeTruthy();
    });

    it("renders actions row with multiple buttons", () => {
        render(
            <EmptyState
                testId="multi-action"
                title="Welcome"
                actions={
                    <>
                        <button data-testid="primary">Create</button>
                        <button data-testid="secondary">Import</button>
                    </>
                }
            />,
        );
        expect(screen.getByTestId("primary")).toBeTruthy();
        expect(screen.getByTestId("secondary")).toBeTruthy();
    });

    it("forwards testId to the wrapper div", () => {
        render(<EmptyState testId="my-empty" title="x" />);
        expect(screen.getByTestId("my-empty")).toBeTruthy();
    });

    it("renders without testId (defensive — no crash)", () => {
        const {container} = render(<EmptyState title="No testid here" />);
        expect(container.querySelector("[data-testid]")).toBeNull();
        expect(screen.getByText("No testid here")).toBeTruthy();
    });

    it("omits empty/null title + body sections", () => {
        const {container} = render(
            <EmptyState testId="empty-strings" title="" body={null} />,
        );
        // No ``.title`` or ``.body`` paragraphs should render.
        const root = container.querySelector('[data-testid="empty-strings"]');
        expect(root).toBeTruthy();
        expect(root?.querySelectorAll("p").length).toBe(0);
    });

    it("merges className prop with default root styles", () => {
        const {container} = render(
            <EmptyState testId="with-class" title="x" className="extra-class" />,
        );
        const root = container.querySelector('[data-testid="with-class"]');
        expect(root?.className).toContain("extra-class");
    });
});
