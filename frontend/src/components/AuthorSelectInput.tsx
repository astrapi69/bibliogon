/**
 * AuthorSelectInput — author free-text input with Authors-DB
 * autocomplete + optional "Add to Authors-DB" checkbox.
 *
 * RECURRING-COMPONENT-AUDIT-01 Candidate #4 extraction (canonical
 * RCU 2-site application). Replaces the duplicated input + datalist
 * + checkbox pattern that previously appeared in:
 *
 *   - frontend/src/components/CreateBookModal.tsx
 *   - frontend/src/components/articles/ConvertToBookWizard.tsx
 *
 * Pattern history: the Bug 8 Phase 2 wizard (2026-04) shipped the
 * input + datalist + "Add to Authors-DB" pattern. The 2026-05-19
 * CreateBookModal fix cloned it directly (commit 49510d0). This
 * extraction unifies the two sites under one component while
 * keeping each site's testid namespace + i18n keys intact (per the
 * "Testid namespace pinning prevents silent E2E skips" Lessons-
 * Learned rule).
 *
 * Pure-presentational. The caller owns:
 *   - the `value` state (controlled input)
 *   - the `suggestions` list (caller unions per-site choices with
 *     globalAuthors from api.authors.list)
 *   - the `showAddToAuthorsCheckbox` computed flag
 *   - the `addToAuthorsDb` checkbox state
 *   - any required/error message (rendered outside this component
 *     at the caller's preferred position)
 *
 * Site-specific differences (testid namespace, input id, i18n
 * labels, placeholder, classNames) are exposed as props following
 * the Tier1Section RCU pattern (testidPrefix-style n-site reuse).
 */

import {useState} from "react";
import {Toggle} from "./settings/Toggle";

/** Select value used for the "type a custom name" escape option. */
const CUSTOM_VALUE = "__author_custom__";

interface AuthorSelectInputProps {
    /** Current author value (controlled). */
    value: string;
    /** Fired when the user types. */
    onChange: (next: string) => void;
    /** Pre-computed author suggestions for the <datalist>. Caller
     *  unions per-site author choices (user-profile names,
     *  article-author names, etc.) with globalAuthors from
     *  api.authors.list. */
    suggestions: string[];

    /** The user's profile identities (real name + pen names). When it
     *  holds 2+ names (i.e. at least one pen name exists), the control
     *  renders a real <select> dropdown listing every profile name as
     *  its own option plus a "custom name" escape that reveals the
     *  free-text input. This fixes the native <datalist> filtering its
     *  options by the pre-filled value (which hid pen names whenever the
     *  field was pre-set to the real name). With 0 or 1 entry (no pen
     *  names) the pure free-text + datalist input stays — a single-name
     *  profile needs no picker, and free-text typing stays the default
     *  (e.g. the import wizard, where any author name may be typed). */
    profileChoices?: string[];
    /** Already-translated label for the "type a custom name" option
     *  in the profile <select>. Required only when profileChoices is
     *  used. */
    customOptionLabel?: string;

    /** Whether to render the "Add to Authors-DB" checkbox. Caller
     *  computes this: typically `value.trim() !== "" && NOT in
     *  globalAuthors`. */
    showAddToAuthorsCheckbox: boolean;
    /** Current addToAuthorsDb checkbox state (controlled). */
    addToAuthorsDb: boolean;
    /** Fired when the user toggles the checkbox. */
    onAddToAuthorsDbChange: (next: boolean) => void;

    /** Base testid prefix. Generates:
     *   - datalist testid: `${testidPrefix}-author-datalist`
     *   - suggestion option testids:
     *     `${testidPrefix}-author-suggestion-${name}`
     *   - checkbox testid: `${testidPrefix}-add-to-authors-checkbox`
     *  The input's testid defaults to `${testidPrefix}-author`
     *  unless overridden via `inputTestId` (ConvertToBookWizard
     *  uses the non-standard "convert-to-book-wizard-metadata-
     *  author" for E2E backward-compat). */
    testidPrefix: string;
    /** Override the input's testid when the existing site uses a
     *  non-standard naming the wider E2E suite already pins. */
    inputTestId?: string;
    /** Datalist id. Defaults to `${testidPrefix}-author-suggestions`
     *  unless overridden. Matches the input's `list=` attribute. */
    datalistId?: string;

    /** Optional input id (for `htmlFor`-linking to a separate
     *  <label>). Defaults to `${testidPrefix}-author`. */
    inputId?: string;
    /** Optional className for the input. Defaults to "input". */
    inputClassName?: string;
    /** Optional placeholder for the input. Caller passes the
     *  already-translated string. */
    placeholder?: string;

    /** Already-translated label for the "Add to Authors-DB"
     *  checkbox. The component substitutes "{name}" with
     *  `value.trim()`. */
    addToAuthorsLabel: string;
}

export default function AuthorSelectInput({
    value,
    onChange,
    suggestions,
    profileChoices,
    customOptionLabel,
    showAddToAuthorsCheckbox,
    addToAuthorsDb,
    onAddToAuthorsDbChange,
    testidPrefix,
    inputTestId,
    datalistId,
    inputId,
    inputClassName,
    placeholder,
    addToAuthorsLabel,
}: AuthorSelectInputProps) {
    const resolvedInputTestId = inputTestId ?? `${testidPrefix}-author`;
    const resolvedDatalistId =
        datalistId ?? `${testidPrefix}-author-suggestions`;
    const resolvedInputId = inputId ?? resolvedInputTestId;
    const checkboxLabel = addToAuthorsLabel.replace("{name}", value.trim());

    // Only switch to the <select> when there is something to pick BETWEEN —
    // i.e. at least one pen name beside the real name. A single-name profile
    // keeps the free-text input (no regression for the common case, and
    // co-authors stay typeable without detouring through a "custom" option).
    const hasProfileSelect =
        Array.isArray(profileChoices) && profileChoices.length >= 2;
    const valueIsChoice = hasProfileSelect && profileChoices!.includes(value);
    // Custom mode = the free-text input is shown. Entered explicitly via the
    // "custom name" option, or implicitly when the current value is a
    // non-empty name that is NOT one of the profile identities (editing a
    // book whose author is a co-author / imported / ghostwritten name).
    const [customMode, setCustomMode] = useState(
        hasProfileSelect ? !valueIsChoice && value.trim() !== "" : false,
    );
    const inCustom =
        hasProfileSelect &&
        (customMode || (!valueIsChoice && value.trim() !== ""));

    const freeText = (
        <>
            <input
                id={inCustom ? resolvedInputId : `${resolvedInputId}-custom`}
                className={inputClassName ?? "input"}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                list={resolvedDatalistId}
                autoComplete="off"
                data-testid={resolvedInputTestId}
            />
            <datalist
                id={resolvedDatalistId}
                data-testid={`${testidPrefix}-author-datalist`}
            >
                {suggestions.map((name) => (
                    <option
                        key={name}
                        value={name}
                        data-testid={`${testidPrefix}-author-suggestion-${name}`}
                    />
                ))}
            </datalist>
        </>
    );

    const checkbox = showAddToAuthorsCheckbox && (
        <div style={{marginTop: 8}}>
            <Toggle
                checked={addToAuthorsDb}
                onChange={onAddToAuthorsDbChange}
                label={checkboxLabel}
                testId={`${testidPrefix}-add-to-authors-checkbox`}
            />
        </div>
    );

    if (!hasProfileSelect) {
        return (
            <>
                {freeText}
                {checkbox}
            </>
        );
    }

    const selectValue = inCustom
        ? CUSTOM_VALUE
        : valueIsChoice
          ? value
          : "";
    const handleSelectChange = (next: string) => {
        if (next === CUSTOM_VALUE) {
            setCustomMode(true);
            return;
        }
        setCustomMode(false);
        onChange(next);
    };

    return (
        <>
            <select
                id={inCustom ? undefined : resolvedInputId}
                className={inputClassName ?? "input"}
                value={selectValue}
                onChange={(e) => handleSelectChange(e.target.value)}
                data-testid={`${testidPrefix}-author-select`}
            >
                {!valueIsChoice && !inCustom && (
                    <option value="">{placeholder ?? "—"}</option>
                )}
                {profileChoices!.map((name) => (
                    <option
                        key={name}
                        value={name}
                        data-testid={`${testidPrefix}-author-option-${name}`}
                    >
                        {name}
                    </option>
                ))}
                <option
                    value={CUSTOM_VALUE}
                    data-testid={`${testidPrefix}-author-option-custom`}
                >
                    {customOptionLabel ?? "Custom name…"}
                </option>
            </select>
            {inCustom && (
                <div style={{marginTop: 8}}>
                    {freeText}
                    {checkbox}
                </div>
            )}
        </>
    );
}
