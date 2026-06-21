/**
 * LoadingIndicator tests pin the render-variant contract:
 *  - spinner-only (no label)
 *  - spinner + string label (default <p> wrap)
 *  - spinner + JSX label (no default wrap)
 *  - aria-busy + role=status set on the wrapper
 *  - inline + block variant root class differs
 *  - testId is forwarded
 */

import {describe, it, expect} from "vitest";
import {render, screen} from "@testing-library/react";
import {LoadingIndicator} from "./LoadingIndicator";

describe("LoadingIndicator", () => {
    it("renders just the spinner when no label is given", () => {
        const {container} = render(<LoadingIndicator testId="solo" />);
        expect(screen.getByTestId("solo")).toBeTruthy();
        // The Loader2 icon has the .spin class.
        expect(container.querySelector(".spin")).toBeTruthy();
    });

    it("renders the label as a paragraph when given a string", () => {
        render(<LoadingIndicator testId="with-label" label="Loading data" />);
        expect(screen.getByText("Loading data").tagName).toBe("P");
    });

    it("renders the label as JSX when given a JSX element (no <p> wrap)", () => {
        render(
            <LoadingIndicator
                testId="jsx-label"
                label={<span data-testid="custom-label">Custom</span>}
            />,
        );
        const span = screen.getByTestId("custom-label");
        expect(span).toBeTruthy();
        expect(span.tagName).toBe("SPAN");
    });

    it("sets aria-busy + role=status + aria-live for screen readers", () => {
        render(<LoadingIndicator testId="aria-check" label="Loading" />);
        const root = screen.getByTestId("aria-check");
        expect(root.getAttribute("aria-busy")).toBe("true");
        expect(root.getAttribute("role")).toBe("status");
        expect(root.getAttribute("aria-live")).toBe("polite");
    });

    it("uses block variant class when variant=block", () => {
        const {container: inlineCt} = render(
            <LoadingIndicator testId="inline-default" />,
        );
        const {container: blockCt} = render(
            <LoadingIndicator testId="block" variant="block" />,
        );
        // Block + inline have different root classnames (CSS-module-hashed).
        const inlineRoot = inlineCt.querySelector('[data-testid="inline-default"]');
        const blockRoot = blockCt.querySelector('[data-testid="block"]');
        expect(inlineRoot?.className).not.toBe(blockRoot?.className);
    });

    it("respects an explicit size prop", () => {
        const {container} = render(<LoadingIndicator testId="custom-size" size={64} />);
        const icon = container.querySelector("svg");
        // Lucide icons render with width/height attributes matching ``size``.
        expect(icon?.getAttribute("width")).toBe("64");
    });

    it("renders without a testId (defensive — no crash)", () => {
        const {container} = render(<LoadingIndicator label="Test" />);
        expect(container.querySelector("[data-testid]")).toBeNull();
        expect(screen.getByText("Test")).toBeTruthy();
    });

    it("merges className with the variant root class", () => {
        const {container} = render(
            <LoadingIndicator testId="extra-class" className="extra" />,
        );
        const root = container.querySelector('[data-testid="extra-class"]');
        expect(root?.className).toContain("extra");
    });
});
