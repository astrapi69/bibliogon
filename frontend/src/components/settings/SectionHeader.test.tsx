/**
 * Vitest coverage for SectionHeader (SETT-PHASE-1-QUICK-WINS-01).
 *
 * Pins SETT-QW-7 (infrastructure half — content + i18n land in C8):
 * the shared SectionHeader renders the canonical h2.sectionTitle
 * with optional icon + optional p.sectionDescription. Sections
 * without a description must NOT render the description paragraph
 * (no empty <p> in the DOM).
 */

import {describe, it, expect} from "vitest";
import {render, screen} from "@testing-library/react";
import {SectionHeader} from "./SectionHeader";

describe("SectionHeader — section heading composition (SETT-QW-7)", () => {
    it("renders the h2 with the provided title", () => {
        render(<SectionHeader title="Hello World" testId="probe"/>);
        const wrapper = screen.getByTestId("probe");
        const h2 = wrapper.querySelector("h2");
        expect(h2).not.toBeNull();
        expect(h2!.textContent).toContain("Hello World");
    });

    it("does NOT render a description paragraph when description is absent", () => {
        render(<SectionHeader title="No description" testId="probe"/>);
        const wrapper = screen.getByTestId("probe");
        expect(wrapper.querySelector("p")).toBeNull();
    });

    it("renders the description paragraph when description is set", () => {
        render(
            <SectionHeader
                title="With description"
                description="One short explanation line."
                testId="probe"
            />,
        );
        const wrapper = screen.getByTestId("probe");
        const p = wrapper.querySelector("p");
        expect(p).not.toBeNull();
        expect(p!.textContent).toBe("One short explanation line.");
    });

    it("prepends the icon before the title when icon prop is set", () => {
        render(
            <SectionHeader
                title="Icon test"
                icon={<svg data-testid="icon-marker"/>}
                testId="probe"
            />,
        );
        const h2 = screen.getByTestId("probe").querySelector("h2")!;
        const icon = h2.querySelector("[data-testid='icon-marker']");
        expect(icon).not.toBeNull();
        expect(h2.textContent).toContain("Icon test");
    });
});
