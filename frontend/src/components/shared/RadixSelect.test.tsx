import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import {RadixSelect} from "../RadixSelect";

/**
 * Under Vitest/happy-dom RadixSelect renders a native <select> (the
 * Radix portal is unreliable here — see lessons-learned). These pins
 * cover that contract: the trigger test id, value round-trip,
 * placeholder, per-option + whole-control disabled. Open-menu /
 * option-click coverage lives in Playwright E2E.
 */
describe("RadixSelect (test-mode native render)", () => {
    const opts = [
        {value: "a", label: "Alpha"},
        {value: "b", label: "Beta"},
        {value: "c", label: "Gamma", disabled: true},
    ];

    it("exposes the `${testId}-trigger` test id and current value", () => {
        render(
            <RadixSelect
                value="b"
                onValueChange={() => {}}
                options={opts}
                testId="demo"
            />,
        );
        const el = screen.getByTestId("demo-trigger") as HTMLSelectElement;
        expect(el).toBeInTheDocument();
        expect(el.value).toBe("b");
    });

    it("fires onValueChange with the chosen value", () => {
        const onChange = vi.fn();
        render(
            <RadixSelect
                value="a"
                onValueChange={onChange}
                options={opts}
                testId="demo"
            />,
        );
        fireEvent.change(screen.getByTestId("demo-trigger"), {
            target: {value: "b"},
        });
        expect(onChange).toHaveBeenCalledWith("b");
    });

    it("renders a hidden placeholder option when placeholder is set", () => {
        render(
            <RadixSelect
                value=""
                onValueChange={() => {}}
                options={opts}
                testId="demo"
                placeholder="Pick one"
            />,
        );
        expect(screen.getByText("Pick one")).toBeInTheDocument();
    });

    it("allOption maps the empty value to a sentinel and back", () => {
        const onChange = vi.fn();
        const {rerender} = render(
            <RadixSelect
                value=""
                onValueChange={onChange}
                options={opts}
                testId="demo"
                allOption={{label: "All"}}
            />,
        );
        const el = screen.getByTestId("demo-trigger") as HTMLSelectElement;
        // empty value resolves to the sentinel option (not a real value)
        expect(el.value).toBe("__all__");
        expect(screen.getByText("All")).toBeInTheDocument();

        // picking a real value emits that value
        fireEvent.change(el, {target: {value: "b"}});
        expect(onChange).toHaveBeenLastCalledWith("b");

        // picking "All" emits "" (not the sentinel)
        rerender(
            <RadixSelect
                value="b"
                onValueChange={onChange}
                options={opts}
                testId="demo"
                allOption={{label: "All"}}
            />,
        );
        fireEvent.change(screen.getByTestId("demo-trigger"), {
            target: {value: "__all__"},
        });
        expect(onChange).toHaveBeenLastCalledWith("");
    });

    it("honors per-option and whole-control disabled", () => {
        render(
            <RadixSelect
                value="a"
                onValueChange={() => {}}
                options={opts}
                testId="demo"
                disabled
                ariaLabel="Demo select"
            />,
        );
        const el = screen.getByTestId("demo-trigger") as HTMLSelectElement;
        expect(el).toBeDisabled();
        expect(el).toHaveAttribute("aria-label", "Demo select");
        const gamma = screen.getByText("Gamma") as HTMLOptionElement;
        expect(gamma.disabled).toBe(true);
    });
});
