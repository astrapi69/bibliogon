/**
 * TokenInput — secret field that must not trigger the browser password manager
 * (#448). Pins: never `type="password"`, password-manager suppression
 * attributes, the own eye-toggle masking, and the absence of a `<form>` wrapper.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TokenInput } from "./TokenInput";

describe("TokenInput", () => {
    it("renders type=text (never type=password)", () => {
        render(<TokenInput value="secret" onChange={vi.fn()} testId="tok" />);
        const input = screen.getByTestId("tok");
        expect(input).toHaveAttribute("type", "text");
        expect(input.getAttribute("type")).not.toBe("password");
    });

    it("carries the password-manager suppression attributes", () => {
        render(<TokenInput value="" onChange={vi.fn()} testId="tok" />);
        const input = screen.getByTestId("tok");
        expect(input).toHaveAttribute("autocomplete", "off");
        expect(input).toHaveAttribute("data-1p-ignore", "true");
        expect(input).toHaveAttribute("data-lpignore", "true");
        expect(input).toHaveAttribute("data-form-type", "other");
    });

    it("starts masked and the eye toggle flips masked <-> visible", () => {
        render(
            <TokenInput
                value="sk-123"
                onChange={vi.fn()}
                testId="tok"
                showLabel="Anzeigen"
                hideLabel="Ausblenden"
            />,
        );
        const input = screen.getByTestId("tok");
        const toggle = screen.getByTestId("tok-toggle");
        expect(input).toHaveAttribute("data-masked", "true");
        expect(toggle).toHaveAttribute("aria-label", "Anzeigen");

        fireEvent.click(toggle);
        expect(input).toHaveAttribute("data-masked", "false");
        expect(toggle).toHaveAttribute("aria-label", "Ausblenden");

        fireEvent.click(toggle);
        expect(input).toHaveAttribute("data-masked", "true");
    });

    it("propagates edits through onChange", () => {
        const onChange = vi.fn();
        render(<TokenInput value="" onChange={onChange} testId="tok" />);
        fireEvent.change(screen.getByTestId("tok"), { target: { value: "ghp_abc" } });
        expect(onChange).toHaveBeenCalledWith("ghp_abc");
    });

    it("renders no <form> wrapper and the toggle is type=button", () => {
        const { container } = render(<TokenInput value="x" onChange={vi.fn()} testId="tok" />);
        expect(container.querySelector("form")).toBeNull();
        expect(screen.getByTestId("tok-toggle")).toHaveAttribute("type", "button");
    });

    it("masked={false}: plain value, no toggle, no text-security", () => {
        render(<TokenInput value="visible" onChange={vi.fn()} masked={false} testId="tok" />);
        const input = screen.getByTestId("tok");
        expect(input).toHaveAttribute("data-masked", "false");
        expect(screen.queryByTestId("tok-toggle")).toBeNull();
    });
});
