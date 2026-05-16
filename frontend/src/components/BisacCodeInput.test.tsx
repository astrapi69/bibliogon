/**
 * BisacCodeInput tests (Bug 9). Pins the format-validation logic
 * (mirror of the server-side ``BISAC_CODE_RE``) + the chip
 * surface + the inline error + the BISG link.
 */

import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";

import BisacCodeInput, {isValidBisacCode} from "./BisacCodeInput";

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({t: (_k: string, fallback: string) => fallback}),
}));

describe("isValidBisacCode helper", () => {
    it.each([
        ["FIC022020", true],
        ["BIO000000", true],
        ["SCI000000", true],
        // Lowercase passes after the helper normalises.
        ["fic022020", true],
        ["fIc022020", true],
        // Padded passes (helper trims).
        ["  FIC022020  ", true],
        // Wrong segment lengths.
        ["FIC02202", false],
        ["FIC0220200", false],
        ["FI022020", false],
        // Letter-where-digit / digit-where-letter.
        ["FICX22020", false],
        ["F1C022020", false],
        // Special chars.
        ["FIC-22020", false],
        ["FIC 22020", false],
        // Empty.
        ["", false],
    ])("isValidBisacCode(%j) -> %j", (input, expected) => {
        expect(isValidBisacCode(input)).toBe(expected);
    });
});

describe("BisacCodeInput", () => {
    it("renders root + add input when codes is empty", () => {
        render(<BisacCodeInput codes={[]} onChange={() => {}} />);
        expect(screen.getByTestId("bisac-input")).toBeTruthy();
        expect(screen.getByTestId("bisac-input-add")).toBeTruthy();
        expect(screen.queryByTestId("bisac-input-chip-list")).toBeNull();
    });

    it("renders the BISG helper link unconditionally", () => {
        render(<BisacCodeInput codes={[]} onChange={() => {}} />);
        const link = screen.getByTestId("bisac-input-helper-link") as HTMLAnchorElement;
        expect(link).toBeTruthy();
        expect(link.href).toContain("bisg.org");
    });

    it("renders one chip per code", () => {
        render(
            <BisacCodeInput
                codes={["FIC022020", "BIO000000"]}
                onChange={() => {}}
            />,
        );
        expect(screen.getByTestId("bisac-chip-0").textContent).toContain(
            "FIC022020",
        );
        expect(screen.getByTestId("bisac-chip-1").textContent).toContain(
            "BIO000000",
        );
    });

    it("Add button is disabled when the draft is empty", () => {
        render(<BisacCodeInput codes={[]} onChange={() => {}} />);
        const btn = screen.getByTestId("bisac-input-add-button") as HTMLButtonElement;
        expect(btn.disabled).toBe(true);
    });

    it("Add button is disabled when the format is invalid", () => {
        render(<BisacCodeInput codes={[]} onChange={() => {}} />);
        fireEvent.change(screen.getByTestId("bisac-input-add"), {
            target: {value: "BAD"},
        });
        const btn = screen.getByTestId("bisac-input-add-button") as HTMLButtonElement;
        expect(btn.disabled).toBe(true);
    });

    it("Add button enables on a valid code", () => {
        render(<BisacCodeInput codes={[]} onChange={() => {}} />);
        fireEvent.change(screen.getByTestId("bisac-input-add"), {
            target: {value: "FIC022020"},
        });
        const btn = screen.getByTestId("bisac-input-add-button") as HTMLButtonElement;
        expect(btn.disabled).toBe(false);
    });

    it("clicking Add appends the uppercased + trimmed code", () => {
        const onChange = vi.fn();
        render(<BisacCodeInput codes={["FIC022020"]} onChange={onChange} />);
        const input = screen.getByTestId("bisac-input-add") as HTMLInputElement;
        fireEvent.change(input, {target: {value: "  bio000000  "}});
        fireEvent.click(screen.getByTestId("bisac-input-add-button"));
        expect(onChange).toHaveBeenCalledWith(["FIC022020", "BIO000000"]);
        expect(input.value).toBe("");
    });

    it("Enter key adds the code", () => {
        const onChange = vi.fn();
        render(<BisacCodeInput codes={[]} onChange={onChange} />);
        const input = screen.getByTestId("bisac-input-add") as HTMLInputElement;
        fireEvent.change(input, {target: {value: "FIC022020"}});
        fireEvent.keyDown(input, {key: "Enter"});
        expect(onChange).toHaveBeenCalledWith(["FIC022020"]);
    });

    it("dedups exact-match codes", () => {
        const onChange = vi.fn();
        render(<BisacCodeInput codes={["FIC022020"]} onChange={onChange} />);
        const input = screen.getByTestId("bisac-input-add") as HTMLInputElement;
        fireEvent.change(input, {target: {value: "fic022020"}});
        fireEvent.click(screen.getByTestId("bisac-input-add-button"));
        expect(onChange).not.toHaveBeenCalled();
        expect(input.value).toBe("");
    });

    it("delete button removes the targeted chip", () => {
        const onChange = vi.fn();
        render(
            <BisacCodeInput
                codes={["FIC022020", "BIO000000", "SCI000000"]}
                onChange={onChange}
            />,
        );
        fireEvent.click(screen.getByTestId("bisac-chip-1-delete"));
        expect(onChange).toHaveBeenCalledWith(["FIC022020", "SCI000000"]);
    });

    it("inline format error appears on invalid draft, clears on valid input", () => {
        render(<BisacCodeInput codes={[]} onChange={() => {}} />);
        const input = screen.getByTestId("bisac-input-add") as HTMLInputElement;
        fireEvent.change(input, {target: {value: "INVALID"}});
        expect(screen.getByTestId("bisac-input-format-error")).toBeTruthy();
        fireEvent.change(input, {target: {value: "FIC022020"}});
        expect(screen.queryByTestId("bisac-input-format-error")).toBeNull();
    });

    it("inline error does NOT appear when the draft is empty", () => {
        render(<BisacCodeInput codes={[]} onChange={() => {}} />);
        // Empty input is allowed (it's the natural initial state).
        expect(screen.queryByTestId("bisac-input-format-error")).toBeNull();
    });
});
