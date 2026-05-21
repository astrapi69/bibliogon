/**
 * AuthorProfileSelect — `<select>` of the user's-own author profile
 * (real name + pen names from app settings via useAuthorProfile()).
 *
 * RECURRING-COMPONENT-AUDIT-01 audit-followup extraction (Pattern B;
 * canonical RCU 2-site application). Replaces the duplicated
 * `<select>` + `<optgroup>` pattern that previously lived inline at:
 *
 *   - frontend/src/pages/ArticleEditor.tsx:1216
 *     (inline `function AuthorSelect`, 60 LOC, used for the
 *     article-editor author dropdown)
 *   - frontend/src/components/BookMetadataEditor.tsx:542
 *     (inline `function AuthorSelectField`, 90 LOC, used for the
 *     book-metadata author dropdown)
 *
 * Pattern history: the inline ArticleEditor doc-comment at line
 * 1213-1214 explicitly self-identifies as a mirror: *"Mirrors the
 * BookEditor AuthorPicker's matched-state ProfileSelect, simplified
 * for the Article editor."* This is the load-bearing RCU-2-site
 * signal the original 2026-05-21 audit missed (because file-level
 * scan doesn't see inline functions inside large files); surfaced
 * during candidate #4 AuthorSelectInput Pre-Coding-Reality-Check
 * on 2026-05-23.
 *
 * Distinct from `AuthorSelectInput` (Pattern A):
 *   - Pattern A: `<input>` + `<datalist>` of external Authors-DB
 *     entries; free-text allowed; "Add to Authors-DB" checkbox.
 *   - Pattern B (this component): `<select>` + `<optgroup>` of the
 *     user's-own profile (real name + pen names from
 *     useAuthorProfile()); closed list, no free-text.
 *
 * Pure-presentational. Caller owns:
 *   - the `value` state (controlled input)
 *   - the `profile` data (caller calls useAuthorProfile() and
 *     passes the result; this avoids a duplicate hook call when
 *     the caller already uses the profile elsewhere — both
 *     ArticleEditor and BookMetadataEditor already do)
 *   - the surrounding `<div className="field">` + `<label>` +
 *     manage-link (BookMetadataEditor) or bare `<select>`
 *     positioning (ArticleEditor) — wrappers stay per-site
 *
 * Site-specific variations exposed as props following the
 * AuthorSelectInput pattern (prop-driven slot fills for the
 * leading empty/placeholder option + the unknown-value option).
 */

import type {CSSProperties, ReactNode} from "react";

import type {AuthorProfile} from "../hooks/useAuthorProfile";

interface AuthorProfileSelectProps {
    /** Current value (controlled). Empty string = no author. */
    value: string;
    /** User's author profile from useAuthorProfile() hook (caller-
     *  scoped). `null` means the API hasn't resolved yet, the API
     *  failed, or the profile is empty. */
    profile: AuthorProfile | null;
    /** Fired when the user picks a different option. */
    onChange: (next: string) => void;

    /** Empty-state option label. Render policy:
     *   - non-null: render `<option value="">{emptyOptionLabel}</option>`
     *     as a leading SELECTABLE empty option (Article's
     *     "(kein Autor)", Book's "(no author)" when allowEmpty).
     *   - null + value === "" + placeholderLabel set: render a
     *     DISABLED `<option value="" disabled>{placeholderLabel}</option>`
     *     instead (Book's pre-allowEmpty behavior).
     *   - null + value === "" + placeholderLabel unset: no leading
     *     option at all (uncommon).
     *   - null + value !== "": no leading option (caller chose
     *     not to expose empty as a valid state). */
    emptyOptionLabel: string | null;
    /** Optional placeholder label rendered as a disabled
     *  `<option value="" disabled>...</option>` when `value === ""`
     *  AND `emptyOptionLabel` is null. Book uses this for the
     *  pre-allowEmpty UX. */
    placeholderLabel?: string;

    /** Optional wrapper for an unknown legacy value (value set on
     *  the model that isn't in the user's profile). Default
     *  behavior renders `<option value={value}>{value}</option>`
     *  (Article). Book passes a wrapper that returns
     *  `{label: "[unbekannt: X]", disabled: true}` so the option
     *  is shown but not re-selectable. */
    unknownValueWrapper?: (value: string) => {
        label: ReactNode;
        disabled: boolean;
    };

    /** i18n label for the pen-names-only optgroup (rendered when
     *  profile has no real name but has pen_names). Caller passes
     *  the already-translated string per the site's namespace. */
    penNamesGroupLabel: string;

    /** Required testid on the `<select>` element. Preserves the
     *  existing site testid namespaces (article-editor-author,
     *  metadata-author-select). */
    testId: string;
    /** Optional CSS class. Defaults to nothing; pass "input" for
     *  BookMetadataEditor parity. */
    selectClassName?: string;
    /** Optional inline style. Used by ArticleEditor (the bare
     *  `<select>` carries its own padding/border styling). */
    selectStyle?: CSSProperties;
}

export default function AuthorProfileSelect({
    value,
    profile,
    onChange,
    emptyOptionLabel,
    placeholderLabel,
    unknownValueWrapper,
    penNamesGroupLabel,
    testId,
    selectClassName,
    selectStyle,
}: AuthorProfileSelectProps) {
    const knownNames: string[] = [];
    if (profile) {
        if (profile.name) knownNames.push(profile.name);
        knownNames.push(...profile.pen_names);
    }
    const valueIsKnown = value === "" || knownNames.includes(value);
    const valueIsUnknown = value !== "" && !valueIsKnown;

    return (
        <select
            data-testid={testId}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={selectClassName}
            style={selectStyle}
        >
            {emptyOptionLabel !== null && (
                <option value="">{emptyOptionLabel}</option>
            )}
            {emptyOptionLabel === null &&
                placeholderLabel !== undefined &&
                value === "" && (
                    <option value="" disabled>
                        {placeholderLabel}
                    </option>
                )}
            {valueIsUnknown &&
                unknownValueWrapper &&
                (() => {
                    const {label, disabled} = unknownValueWrapper(value);
                    return (
                        <option value={value} disabled={disabled}>
                            {label}
                        </option>
                    );
                })()}
            {valueIsUnknown && !unknownValueWrapper && (
                <option value={value}>{value}</option>
            )}
            {profile && profile.name && (
                <optgroup label={profile.name}>
                    <option value={profile.name}>{profile.name}</option>
                    {profile.pen_names.map((pen) => (
                        <option key={pen} value={pen}>
                            {pen}
                        </option>
                    ))}
                </optgroup>
            )}
            {profile && !profile.name && profile.pen_names.length > 0 && (
                <optgroup label={penNamesGroupLabel}>
                    {profile.pen_names.map((pen) => (
                        <option key={pen} value={pen}>
                            {pen}
                        </option>
                    ))}
                </optgroup>
            )}
        </select>
    );
}
