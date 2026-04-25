/**
 * Author picker for the import wizard's Step 3.
 *
 * Three states drive the rendering:
 *
 * 1. **Matched.** ``value`` equals the profile's real name or one of
 *    the pen names. Renders a plain ``<select>`` so the user can
 *    switch to a different known author without leaving the row.
 *
 * 2. **Unmatched + non-empty value.** The imported source carries an
 *    author name that is not in Settings. The picker surfaces a
 *    banner offering three resolutions:
 *      - Create the unknown name as a new pen name (default).
 *      - Pick a different existing author from the select.
 *      - Defer (clear the value; the user fills it in later via the
 *        metadata editor).
 *
 * 3. **Empty value AND no profile.** The user has not configured an
 *    author profile in Settings yet. Banner offers create-new
 *    (will become the real name on the very first add) plus defer.
 *
 * Author management proper lives ONLY in Settings. The picker calls
 * ``POST /api/settings/author/pen-name`` to add the unknown name as
 * a pen name on the existing profile, then refreshes the hook so
 * the UI immediately picks up the new entry.
 */

import { useState } from "react";
import { api, ApiError } from "../../../api/client";
import { useI18n } from "../../../hooks/useI18n";
import { useAllowBooksWithoutAuthor } from "../../../hooks/useAllowBooksWithoutAuthor";
import {
    type AuthorProfile,
    profileDisplayNames,
} from "../../../hooks/useAuthorProfile";

type Mode = "create" | "existing" | "defer";

export function AuthorPicker({
    value,
    detectedName,
    profile,
    onChange,
    onProfileRefresh,
    invalid,
}: {
    value: string;
    /** Original author from the import source. Drives the
     * "create as new pen name" default. Can equal ``value`` when
     * the user has not edited yet. */
    detectedName: string;
    profile: AuthorProfile | null;
    onChange: (next: string) => void;
    /** Called after a successful create-new so the parent's hook
     * can refetch the profile and surface the new name in any
     * downstream selects. */
    onProfileRefresh: (next: AuthorProfile) => void;
    invalid: boolean;
}) {
    const { t } = useI18n();
    const choices = profileDisplayNames(profile);
    const matched = value !== "" && choices.includes(value);

    if (matched) {
        return (
            <ProfileSelect
                value={value}
                profile={profile}
                onChange={onChange}
                invalid={invalid}
            />
        );
    }

    return (
        <UnmatchedAuthor
            value={value}
            detectedName={detectedName}
            profile={profile}
            choices={choices}
            onChange={onChange}
            onProfileRefresh={onProfileRefresh}
            invalid={invalid}
            t={t}
        />
    );
}

function ProfileSelect({
    value,
    profile,
    onChange,
    invalid,
}: {
    value: string;
    profile: AuthorProfile | null;
    onChange: (v: string) => void;
    invalid: boolean;
}) {
    return (
        <select
            data-testid="preview-author-select"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={invalid}
            style={{
                width: "100%",
                padding: "6px 8px",
                border: invalid
                    ? "1px solid var(--danger)"
                    : "1px solid var(--border)",
                borderRadius: 4,
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
            }}
        >
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
                <optgroup label="Pen names">
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

function UnmatchedAuthor({
    value,
    detectedName,
    profile,
    choices,
    onChange,
    onProfileRefresh,
    invalid,
    t,
}: {
    value: string;
    detectedName: string;
    profile: AuthorProfile | null;
    choices: string[];
    onChange: (v: string) => void;
    onProfileRefresh: (next: AuthorProfile) => void;
    invalid: boolean;
    t: (k: string, fallback?: string) => string;
}) {
    const allowDefer = useAllowBooksWithoutAuthor();
    const initialMode: Mode = profile && choices.length > 0 ? "create" : "create";
    const [mode, setMode] = useState<Mode>(initialMode);
    const [proposedName, setProposedName] = useState<string>(
        detectedName.trim() || value.trim() || "",
    );
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const sourceName = (detectedName || value).trim();
    const banner =
        sourceName !== ""
            ? t(
                  "ui.import_wizard.author_not_in_settings",
                  `Author "${sourceName}" is not in your Settings.`,
              ).replace("{name}", sourceName)
            : t(
                  "ui.import_wizard.author_no_source",
                  "No author detected in source.",
              );

    const handleCreate = async () => {
        const cleaned = proposedName.trim();
        if (!cleaned) {
            setError(
                t(
                    "ui.import_wizard.author_name_required",
                    "Name must not be empty.",
                ),
            );
            return;
        }
        setCreating(true);
        setError(null);
        try {
            const updated = await api.settings.addPenName(cleaned);
            onProfileRefresh(updated);
            onChange(cleaned);
        } catch (err) {
            const detail =
                err instanceof ApiError
                    ? err.detail
                    : err instanceof Error
                      ? err.message
                      : String(err);
            setError(detail);
        } finally {
            setCreating(false);
        }
    };

    return (
        <div data-testid="preview-author-picker">
            <div
                data-testid="preview-author-banner"
                style={{
                    padding: "8px 10px",
                    marginBottom: 8,
                    border: "1px solid var(--warning, var(--border))",
                    borderRadius: 4,
                    background: "var(--bg-warning, var(--bg-hover))",
                    fontSize: "0.8125rem",
                }}
            >
                {banner}
            </div>
            <div
                role="radiogroup"
                aria-invalid={invalid}
                style={{ display: "flex", flexDirection: "column", gap: 6 }}
            >
                <label
                    data-testid="preview-author-mode-create"
                    data-selected={mode === "create" ? "true" : "false"}
                    style={{
                        display: "flex",
                        gap: 8,
                        padding: 8,
                        border:
                            mode === "create"
                                ? "2px solid var(--accent)"
                                : "1px solid var(--border)",
                        borderRadius: 4,
                        background:
                            mode === "create"
                                ? "var(--bg-hover)"
                                : "var(--bg-primary)",
                        cursor: "pointer",
                    }}
                >
                    <input
                        type="radio"
                        name="preview-author-mode"
                        value="create"
                        checked={mode === "create"}
                        onChange={() => setMode("create")}
                        data-testid="preview-author-mode-create-radio"
                        style={{ marginTop: 3 }}
                    />
                    <span style={{ flex: 1 }}>
                        <span style={{ fontWeight: 500, fontSize: "0.875rem" }}>
                            {t(
                                "ui.import_wizard.author_action_create",
                                `Create "${sourceName || ""}" as a new author profile`,
                            ).replace("{name}", sourceName || "")}
                        </span>
                        {mode === "create" && (
                            <div style={{ marginTop: 8 }}>
                                <input
                                    data-testid="preview-author-create-input"
                                    value={proposedName}
                                    onChange={(e) =>
                                        setProposedName(e.target.value)
                                    }
                                    style={{
                                        width: "100%",
                                        padding: "4px 6px",
                                        border: "1px solid var(--border)",
                                        borderRadius: 4,
                                        fontSize: "0.875rem",
                                    }}
                                />
                                <div
                                    style={{
                                        display: "flex",
                                        gap: 8,
                                        marginTop: 6,
                                    }}
                                >
                                    <button
                                        type="button"
                                        data-testid="preview-author-create-confirm"
                                        onClick={handleCreate}
                                        disabled={
                                            creating || !proposedName.trim()
                                        }
                                        style={{
                                            padding: "4px 10px",
                                            border: "1px solid var(--accent)",
                                            borderRadius: 4,
                                            background: "var(--accent)",
                                            color: "white",
                                            fontSize: "0.8125rem",
                                            cursor: creating
                                                ? "not-allowed"
                                                : "pointer",
                                            opacity: creating ? 0.6 : 1,
                                        }}
                                    >
                                        {creating
                                            ? t(
                                                  "ui.import_wizard.author_create_loading",
                                                  "Creating...",
                                              )
                                            : t(
                                                  "ui.import_wizard.author_create_button",
                                                  "Create",
                                              )}
                                    </button>
                                </div>
                                {error && (
                                    <p
                                        data-testid="preview-author-create-error"
                                        style={{
                                            margin: "4px 0 0 0",
                                            color: "var(--danger)",
                                            fontSize: "0.75rem",
                                        }}
                                    >
                                        {error}
                                    </p>
                                )}
                            </div>
                        )}
                    </span>
                </label>

                {choices.length > 0 && (
                    <label
                        data-testid="preview-author-mode-existing"
                        data-selected={mode === "existing" ? "true" : "false"}
                        style={{
                            display: "flex",
                            gap: 8,
                            padding: 8,
                            border:
                                mode === "existing"
                                    ? "2px solid var(--accent)"
                                    : "1px solid var(--border)",
                            borderRadius: 4,
                            background:
                                mode === "existing"
                                    ? "var(--bg-hover)"
                                    : "var(--bg-primary)",
                            cursor: "pointer",
                        }}
                    >
                        <input
                            type="radio"
                            name="preview-author-mode"
                            value="existing"
                            checked={mode === "existing"}
                            onChange={() => setMode("existing")}
                            data-testid="preview-author-mode-existing-radio"
                            style={{ marginTop: 3 }}
                        />
                        <span style={{ flex: 1 }}>
                            <span
                                style={{
                                    fontWeight: 500,
                                    fontSize: "0.875rem",
                                }}
                            >
                                {t(
                                    "ui.import_wizard.author_action_existing",
                                    "Use a different existing author",
                                )}
                            </span>
                            {mode === "existing" && (
                                <div style={{ marginTop: 8 }}>
                                    <ProfileSelect
                                        value={
                                            choices.includes(value)
                                                ? value
                                                : choices[0] || ""
                                        }
                                        profile={profile}
                                        onChange={onChange}
                                        invalid={false}
                                    />
                                </div>
                            )}
                        </span>
                    </label>
                )}

                {allowDefer && (
                    <label
                        data-testid="preview-author-mode-defer"
                        data-selected={mode === "defer" ? "true" : "false"}
                        style={{
                            display: "flex",
                            gap: 8,
                            padding: 8,
                            border:
                                mode === "defer"
                                    ? "2px solid var(--accent)"
                                    : "1px solid var(--border)",
                            borderRadius: 4,
                            background:
                                mode === "defer"
                                    ? "var(--bg-hover)"
                                    : "var(--bg-primary)",
                            cursor: "pointer",
                        }}
                    >
                        <input
                            type="radio"
                            name="preview-author-mode"
                            value="defer"
                            checked={mode === "defer"}
                            onChange={() => {
                                setMode("defer");
                                // Empty string flows through validate_overrides
                                // (allow_null_author=True) and lands as
                                // book.author = NULL via apply_book_overrides.
                                onChange("");
                            }}
                            data-testid="preview-author-mode-defer-radio"
                            style={{ marginTop: 3 }}
                        />
                        <span>
                            <span
                                style={{
                                    fontWeight: 500,
                                    fontSize: "0.875rem",
                                }}
                            >
                                {t(
                                    "ui.import_wizard.author_action_defer",
                                    "Skip - set author later",
                                )}
                            </span>
                            <span
                                style={{
                                    display: "block",
                                    fontSize: "0.75rem",
                                    color: "var(--text-muted)",
                                    marginTop: 2,
                                }}
                            >
                                {t(
                                    "ui.import_wizard.author_action_defer_hint",
                                    "Imports without an author; edit via the metadata editor.",
                                )}
                            </span>
                        </span>
                    </label>
                )}
            </div>
        </div>
    );
}
