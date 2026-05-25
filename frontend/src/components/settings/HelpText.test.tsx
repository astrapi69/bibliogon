/**
 * Vitest coverage for HelpText (SETT-PHASE-1-QUICK-WINS-01).
 *
 * Pins SETT-QW-5: the shared HelpText component renders with the
 * canonical typography (text-muted colour, 0.75rem font size,
 * display: block, marginTop: 4) and supports the ``indented``
 * variant for checkbox-aligned help text.
 */

import {describe, it, expect} from "vitest";
import {render, screen} from "@testing-library/react";
import {HelpText} from "./HelpText";

describe("HelpText — canonical small italic help text (SETT-QW-5)", () => {
    it("renders children with the canonical inline styles", () => {
        render(<HelpText testId="probe">Hello, help</HelpText>);
        const el = screen.getByTestId("probe");
        expect(el).toBeInTheDocument();
        expect(el.tagName.toLowerCase()).toBe("small");
        expect(el).toHaveTextContent("Hello, help");
        expect(el.style.fontSize).toBe("0.75rem");
        expect(el.style.color).toBe("var(--text-muted)");
        expect(el.style.display).toBe("block");
        expect(el.style.marginTop).toBe("4px");
        expect(el.style.marginLeft).toBe("");
    });

    it("applies a 24px left margin when ``indented`` is set", () => {
        render(<HelpText testId="probe" indented>Indented</HelpText>);
        const el = screen.getByTestId("probe");
        expect(el.style.marginLeft).toBe("24px");
    });

    it("merges call-site ``style`` over the defaults", () => {
        render(<HelpText testId="probe" style={{marginTop: 0, marginBottom: 8}}>X</HelpText>);
        const el = screen.getByTestId("probe");
        expect(el.style.marginTop).toBe("0px");
        expect(el.style.marginBottom).toBe("8px");
    });
});
