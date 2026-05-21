/**
 * AuthorSelectInput tests pin the shared contract:
 *   - input/datalist/checkbox render under testidPrefix-namespaced
 *     testids
 *   - value reflection + onChange wiring
 *   - suggestions render as <datalist><option>s with per-suggestion
 *     testids
 *   - showAddToAuthorsCheckbox=false hides the checkbox
 *   - checkbox toggle fires onAddToAuthorsDbChange
 *   - "{name}" substitution in the checkbox label
 *   - inputTestId override (ConvertToBookWizard backward-compat)
 *   - datalistId override
 *
 * RECURRING-COMPONENT-AUDIT-01 Candidate #4 extraction
 * (2026-05-23). Migration regression-pins live in the existing
 * CreateBookModal.test.tsx + ConvertToBookWizard.test.tsx — those
 * pin the per-site integration. This file pins the wrapper
 * contract itself.
 */

import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";

import AuthorSelectInput from "./AuthorSelectInput";

describe("AuthorSelectInput", () => {
    function baseProps(overrides: Record<string, unknown> = {}) {
        return {
            value: "",
            onChange: vi.fn(),
            suggestions: [],
            showAddToAuthorsCheckbox: false,
            addToAuthorsDb: false,
            onAddToAuthorsDbChange: vi.fn(),
            testidPrefix: "test-prefix",
            addToAuthorsLabel: '"{name}" zur Autoren-Datenbank hinzufügen',
            ...overrides,
        };
    }

    it("renders the input + datalist under testidPrefix-namespaced testids", () => {
        render(<AuthorSelectInput {...baseProps()} />);
        expect(screen.getByTestId("test-prefix-author")).toBeInTheDocument();
        expect(
            screen.getByTestId("test-prefix-author-datalist"),
        ).toBeInTheDocument();
    });

    it("renders each suggestion as a <datalist><option> with per-suggestion testid", () => {
        render(
            <AuthorSelectInput
                {...baseProps({
                    suggestions: ["Aster Raptis", "Jane Doe"],
                })}
            />,
        );
        expect(
            screen.getByTestId("test-prefix-author-suggestion-Aster Raptis"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("test-prefix-author-suggestion-Jane Doe"),
        ).toBeInTheDocument();
    });

    it("value reflects through the input + onChange fires on user input", () => {
        const onChange = vi.fn();
        render(
            <AuthorSelectInput
                {...baseProps({value: "Initial Value", onChange})}
            />,
        );
        const input = screen.getByTestId(
            "test-prefix-author",
        ) as HTMLInputElement;
        expect(input.value).toBe("Initial Value");
        fireEvent.change(input, {target: {value: "Typed"}});
        expect(onChange).toHaveBeenCalledWith("Typed");
    });

    it("showAddToAuthorsCheckbox=false hides the checkbox", () => {
        render(
            <AuthorSelectInput
                {...baseProps({showAddToAuthorsCheckbox: false})}
            />,
        );
        expect(
            screen.queryByTestId("test-prefix-add-to-authors-checkbox"),
        ).not.toBeInTheDocument();
    });

    it("showAddToAuthorsCheckbox=true renders the checkbox", () => {
        render(
            <AuthorSelectInput
                {...baseProps({
                    value: "Aster",
                    showAddToAuthorsCheckbox: true,
                })}
            />,
        );
        expect(
            screen.getByTestId("test-prefix-add-to-authors-checkbox"),
        ).toBeInTheDocument();
    });

    it("checkbox toggle fires onAddToAuthorsDbChange with the new boolean", () => {
        const onAddToAuthorsDbChange = vi.fn();
        render(
            <AuthorSelectInput
                {...baseProps({
                    value: "Aster",
                    showAddToAuthorsCheckbox: true,
                    addToAuthorsDb: false,
                    onAddToAuthorsDbChange,
                })}
            />,
        );
        const checkbox = screen.getByTestId(
            "test-prefix-add-to-authors-checkbox",
        ) as HTMLInputElement;
        expect(checkbox.checked).toBe(false);
        fireEvent.click(checkbox);
        expect(onAddToAuthorsDbChange).toHaveBeenCalledWith(true);
    });

    it("substitutes {name} placeholder in the checkbox label with value.trim()", () => {
        render(
            <AuthorSelectInput
                {...baseProps({
                    value: "  Aster Raptis  ",
                    showAddToAuthorsCheckbox: true,
                    addToAuthorsLabel:
                        '"{name}" zur Autoren-Datenbank hinzufügen',
                })}
            />,
        );
        // Substituted with the trimmed value (no leading/trailing
        // whitespace in the rendered label even though the prop
        // value carries it).
        expect(
            screen.getByText(
                '"Aster Raptis" zur Autoren-Datenbank hinzufügen',
            ),
        ).toBeInTheDocument();
    });

    it("inputTestId override preserves backward-compat with existing E2E testid", () => {
        // ConvertToBookWizard's existing input testid is
        // "convert-to-book-wizard-metadata-author" — non-standard
        // (the "metadata-" segment doesn't fit the testidPrefix
        // derivation rule). Verify the override path lets callers
        // preserve their existing testids per the
        // "Testid namespace pinning prevents silent E2E skips" LL.
        render(
            <AuthorSelectInput
                {...baseProps({
                    testidPrefix: "convert-to-book-wizard",
                    inputTestId: "convert-to-book-wizard-metadata-author",
                })}
            />,
        );
        // Override applied to the input testid:
        expect(
            screen.getByTestId("convert-to-book-wizard-metadata-author"),
        ).toBeInTheDocument();
        // Default-derived testid is NOT used:
        expect(
            screen.queryByTestId("convert-to-book-wizard-author"),
        ).not.toBeInTheDocument();
        // But the datalist + checkbox testids still derive from
        // testidPrefix (unchanged backward-compat with the existing
        // site naming):
        expect(
            screen.getByTestId("convert-to-book-wizard-author-datalist"),
        ).toBeInTheDocument();
    });

    it("datalistId override + list attribute on input match", () => {
        render(
            <AuthorSelectInput
                {...baseProps({
                    testidPrefix: "test-prefix",
                    datalistId: "my-custom-datalist-id",
                })}
            />,
        );
        const input = screen.getByTestId(
            "test-prefix-author",
        ) as HTMLInputElement;
        expect(input.getAttribute("list")).toBe("my-custom-datalist-id");
    });

    it("renders an empty datalist gracefully when suggestions is []", () => {
        render(<AuthorSelectInput {...baseProps({suggestions: []})} />);
        // Datalist still mounts so the browser's list= attribute
        // attaches an empty dropdown rather than ignoring it (per
        // ConvertToBookWizard's existing comment at the source).
        const datalist = screen.getByTestId("test-prefix-author-datalist");
        expect(datalist).toBeInTheDocument();
        expect(datalist.children.length).toBe(0);
    });

    it("placeholder propagates to the input element", () => {
        render(
            <AuthorSelectInput
                {...baseProps({
                    placeholder: "Autorenname oder Pen Name",
                })}
            />,
        );
        const input = screen.getByTestId(
            "test-prefix-author",
        ) as HTMLInputElement;
        expect(input.getAttribute("placeholder")).toBe(
            "Autorenname oder Pen Name",
        );
    });
});
