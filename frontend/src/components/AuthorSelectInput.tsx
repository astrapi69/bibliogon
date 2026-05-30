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

import {Toggle} from "./settings/Toggle";

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

    return (
        <>
            <input
                id={resolvedInputId}
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
            {showAddToAuthorsCheckbox && (
                <div style={{marginTop: 8}}>
                    <Toggle
                        checked={addToAuthorsDb}
                        onChange={onAddToAuthorsDbChange}
                        label={checkboxLabel}
                        testId={`${testidPrefix}-add-to-authors-checkbox`}
                    />
                </div>
            )}
        </>
    );
}
