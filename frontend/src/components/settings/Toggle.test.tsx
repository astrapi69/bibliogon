/**
 * Vitest coverage for Toggle (SETT-PHASE-3-TOGGLE-COMPONENT-01).
 *
 * Pins the canonical Toggle shape extracted from the recurring
 * checkbox+label+HelpText pattern across Settings.
 */

import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import {Toggle} from "./Toggle";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "de",
        setLang: vi.fn(),
    }),
}));

describe("Toggle — canonical checkbox composition (SETT-PHASE-3)", () => {
    it("renders label + checkbox in the expected shape", () => {
        render(<Toggle label="Enable feature" checked={false} onChange={vi.fn()} testId="probe"/>);
        const input = screen.getByTestId("probe") as HTMLInputElement;
        expect(input.type).toBe("checkbox");
        expect(input.checked).toBe(false);
        expect(screen.getByText("Enable feature")).toBeInTheDocument();
    });

    it("does NOT render a description paragraph when description is absent", () => {
        const {container} = render(
            <Toggle label="No description" checked={false} onChange={vi.fn()} testId="probe"/>,
        );
        expect(container.querySelector("small")).toBeNull();
    });

    it("renders the description as HelpText when present", () => {
        render(
            <Toggle
                label="With description"
                description="One short explanation line."
                checked={false}
                onChange={vi.fn()}
                testId="probe"
            />,
        );
        expect(screen.getByText("One short explanation line.")).toBeInTheDocument();
    });

    it("applies indented description style when indentedDescription is set", () => {
        const {container} = render(
            <Toggle
                label="Indented"
                description="Indented description."
                indentedDescription
                checked={false}
                onChange={vi.fn()}
                testId="probe"
            />,
        );
        const small = container.querySelector("small");
        expect(small).not.toBeNull();
        expect(small!.style.marginLeft).toBe("24px");
    });

    it("renders children between the checkbox row and the description", () => {
        render(
            <Toggle
                label="With children"
                description="After children."
                checked={true}
                onChange={vi.fn()}
                testId="probe"
            >
                <div data-testid="probe-nested">Nested control</div>
            </Toggle>,
        );
        expect(screen.getByTestId("probe-nested")).toBeInTheDocument();
        expect(screen.getByText("After children.")).toBeInTheDocument();
    });

    it("calls onChange with the new boolean state on click", () => {
        const onChange = vi.fn();
        render(<Toggle label="Click me" checked={false} onChange={onChange} testId="probe"/>);
        fireEvent.click(screen.getByTestId("probe"));
        expect(onChange).toHaveBeenCalledWith(true);
    });
});
