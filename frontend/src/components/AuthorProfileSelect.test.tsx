/**
 * AuthorProfileSelect tests pin the Pattern B contract:
 *   - <select> renders under testId
 *   - emptyOptionLabel non-null renders selectable leading option
 *   - emptyOptionLabel null + placeholderLabel + value="" renders
 *     disabled placeholder
 *   - profile.name renders <optgroup label={name}> with real name +
 *     pen_names as children
 *   - profile.name="" + pen_names.length > 0 renders <optgroup
 *     label={penNamesGroupLabel}> with pen_names only
 *   - unknown legacy value renders plain (default) or via
 *     unknownValueWrapper (Book pattern)
 *   - value reflection + onChange firing
 *   - profile null renders an empty option-set safely
 *
 * RECURRING-COMPONENT-AUDIT-01 audit-followup (Pattern B) extraction
 * 2026-05-23. Migration regression-pins live in BookMetadataEditor.
 * test.tsx (4 existing assertions on metadata-author-select; the
 * ArticleEditor inline AuthorSelect had no test consumers). This
 * file pins the component contract itself.
 */

import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";

import AuthorProfileSelect from "./AuthorProfileSelect";
import type {AuthorProfile} from "../hooks/useAuthorProfile";

const profileWithName: AuthorProfile = {
    name: "Aster Raptis",
    pen_names: ["Pen 1", "Pen 2"],
};
const profilePenNamesOnly: AuthorProfile = {
    name: "",
    pen_names: ["Pen 1", "Pen 2"],
};

describe("AuthorProfileSelect", () => {
    function baseProps(overrides: Record<string, unknown> = {}) {
        return {
            value: "",
            profile: null,
            onChange: vi.fn(),
            emptyOptionLabel: "(none)",
            penNamesGroupLabel: "Pen Names",
            testId: "test-author-select",
            ...overrides,
        };
    }

    it("renders the <select> under testId", () => {
        render(<AuthorProfileSelect {...baseProps()} />);
        expect(
            screen.getByTestId("test-author-select"),
        ).toBeInTheDocument();
    });

    it("emptyOptionLabel non-null renders a SELECTABLE leading option", () => {
        render(
            <AuthorProfileSelect
                {...baseProps({emptyOptionLabel: "(kein Autor)"})}
            />,
        );
        const select = screen.getByTestId(
            "test-author-select",
        ) as HTMLSelectElement;
        const emptyOption = select.querySelector(
            'option[value=""]',
        ) as HTMLOptionElement;
        expect(emptyOption.textContent).toBe("(kein Autor)");
        expect(emptyOption.disabled).toBe(false);
    });

    it("emptyOptionLabel null + placeholderLabel + value='' renders DISABLED placeholder", () => {
        render(
            <AuthorProfileSelect
                {...baseProps({
                    emptyOptionLabel: null,
                    placeholderLabel: "Autor auswählen...",
                    value: "",
                })}
            />,
        );
        const select = screen.getByTestId(
            "test-author-select",
        ) as HTMLSelectElement;
        const placeholderOption = select.querySelector(
            'option[value=""]',
        ) as HTMLOptionElement;
        expect(placeholderOption.textContent).toBe("Autor auswählen...");
        expect(placeholderOption.disabled).toBe(true);
    });

    it("emptyOptionLabel null + value !== '' renders no leading empty option", () => {
        render(
            <AuthorProfileSelect
                {...baseProps({
                    emptyOptionLabel: null,
                    value: "Aster Raptis",
                    profile: profileWithName,
                })}
            />,
        );
        const select = screen.getByTestId(
            "test-author-select",
        ) as HTMLSelectElement;
        const emptyOption = select.querySelector('option[value=""]');
        expect(emptyOption).toBeNull();
    });

    it("profile.name renders <optgroup label={name}> with real name + pen_names", () => {
        render(
            <AuthorProfileSelect
                {...baseProps({profile: profileWithName})}
            />,
        );
        const select = screen.getByTestId(
            "test-author-select",
        ) as HTMLSelectElement;
        const optgroup = select.querySelector("optgroup") as HTMLElement;
        expect(optgroup.getAttribute("label")).toBe("Aster Raptis");
        // Real name as first child option + 2 pen names
        const options = optgroup.querySelectorAll("option");
        expect(options.length).toBe(3);
        expect(options[0].value).toBe("Aster Raptis");
        expect(options[1].value).toBe("Pen 1");
        expect(options[2].value).toBe("Pen 2");
    });

    it("profile.name='' + pen_names.length > 0 renders pen-names-only optgroup with penNamesGroupLabel", () => {
        render(
            <AuthorProfileSelect
                {...baseProps({
                    profile: profilePenNamesOnly,
                    penNamesGroupLabel: "Pseudonyme",
                })}
            />,
        );
        const select = screen.getByTestId(
            "test-author-select",
        ) as HTMLSelectElement;
        const optgroup = select.querySelector("optgroup") as HTMLElement;
        expect(optgroup.getAttribute("label")).toBe("Pseudonyme");
        const options = optgroup.querySelectorAll("option");
        expect(options.length).toBe(2);
        expect(options[0].value).toBe("Pen 1");
        expect(options[1].value).toBe("Pen 2");
    });

    it("unknown legacy value renders plain option by default (Article pattern)", () => {
        render(
            <AuthorProfileSelect
                {...baseProps({
                    profile: profileWithName,
                    value: "Legacy Author",
                })}
            />,
        );
        const select = screen.getByTestId(
            "test-author-select",
        ) as HTMLSelectElement;
        const legacyOption = select.querySelector(
            'option[value="Legacy Author"]',
        ) as HTMLOptionElement;
        expect(legacyOption.textContent).toBe("Legacy Author");
        expect(legacyOption.disabled).toBe(false);
    });

    it("unknownValueWrapper renders the wrapped option (Book pattern)", () => {
        render(
            <AuthorProfileSelect
                {...baseProps({
                    profile: profileWithName,
                    value: "Legacy Author",
                    unknownValueWrapper: (v: string) => ({
                        label: `[unbekannt: ${v}]`,
                        disabled: true,
                    }),
                })}
            />,
        );
        const select = screen.getByTestId(
            "test-author-select",
        ) as HTMLSelectElement;
        const legacyOption = select.querySelector(
            'option[value="Legacy Author"]',
        ) as HTMLOptionElement;
        expect(legacyOption.textContent).toBe("[unbekannt: Legacy Author]");
        expect(legacyOption.disabled).toBe(true);
    });

    it("value reflection through the <select>", () => {
        render(
            <AuthorProfileSelect
                {...baseProps({
                    profile: profileWithName,
                    value: "Pen 1",
                })}
            />,
        );
        const select = screen.getByTestId(
            "test-author-select",
        ) as HTMLSelectElement;
        expect(select.value).toBe("Pen 1");
    });

    it("onChange fires with the new value when user picks a different option", () => {
        const onChange = vi.fn();
        render(
            <AuthorProfileSelect
                {...baseProps({
                    profile: profileWithName,
                    value: "Aster Raptis",
                    onChange,
                })}
            />,
        );
        const select = screen.getByTestId(
            "test-author-select",
        ) as HTMLSelectElement;
        fireEvent.change(select, {target: {value: "Pen 2"}});
        expect(onChange).toHaveBeenCalledWith("Pen 2");
    });

    it("profile=null does not crash; renders only the leading empty option (if any)", () => {
        render(
            <AuthorProfileSelect
                {...baseProps({
                    profile: null,
                    emptyOptionLabel: "(no author)",
                })}
            />,
        );
        const select = screen.getByTestId(
            "test-author-select",
        ) as HTMLSelectElement;
        const optgroups = select.querySelectorAll("optgroup");
        expect(optgroups.length).toBe(0);
        const emptyOption = select.querySelector(
            'option[value=""]',
        ) as HTMLOptionElement;
        expect(emptyOption.textContent).toBe("(no author)");
    });

    it("selectClassName + selectStyle propagate to the <select>", () => {
        render(
            <AuthorProfileSelect
                {...baseProps({
                    selectClassName: "input",
                    selectStyle: {padding: "6px 8px"},
                })}
            />,
        );
        const select = screen.getByTestId(
            "test-author-select",
        ) as HTMLSelectElement;
        expect(select.className).toBe("input");
        expect(select.style.padding).toBe("6px 8px");
    });
});
