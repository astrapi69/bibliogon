/**
 * BisacCodeInput — chip-style multi-value input for Book.bisac_codes.
 *
 * Bug 9 (Books-only subject categorisation). BISAC codes are the
 * industry-standard 9-char identifier (3 uppercase letters + 6
 * digits, e.g. ``FIC022020``) used by every retail catalogue.
 * Format validation is client-side AND server-side (the server
 * is canonical; this is the inline preview to catch typos before
 * the user submits).
 *
 * Per D3 NO bundled BISAC catalogue ships with Bibliogon — the
 * BISG licensing terms are incompatible with the local-first
 * model. The component renders helper text + a link to
 * bisg.org's free public lookup so the user can find codes.
 * ``BISAC-DATABASE-LOOKUP-01`` (P5) tracks the deferred bundled-
 * catalogue path.
 *
 * Lowercase input auto-uppercases for parity with the server-side
 * coercion. Invalid format shows an inline error and disables the
 * Add button (the user can still type — the validation only gates
 * the add action).
 *
 * Testid namespace: ``bisac-*`` per the testid-discipline rule.
 */

import {useState, KeyboardEvent} from "react";
import {Plus, X} from "lucide-react";
import {useI18n} from "../hooks/useI18n";

/** Mirrors the server-side ``BISAC_CODE_RE`` in
 *  ``backend/app/schemas/__init__.py``. Keep in sync. */
export const BISAC_CODE_RE = /^[A-Z]{3}[0-9]{6}$/;

export function isValidBisacCode(value: string): boolean {
    return BISAC_CODE_RE.test(value.trim().toUpperCase());
}

interface Props {
    codes: string[];
    onChange: (next: string[]) => void;
}

export default function BisacCodeInput({codes, onChange}: Props) {
    const {t} = useI18n();
    const [draft, setDraft] = useState("");

    const normalised = draft.trim().toUpperCase();
    const isValid = normalised === "" || isValidBisacCode(normalised);

    const addCode = () => {
        if (!normalised || !isValidBisacCode(normalised)) return;
        if (codes.includes(normalised)) {
            setDraft("");
            return;
        }
        onChange([...codes, normalised]);
        setDraft("");
    };

    const removeAt = (index: number) => {
        onChange(codes.filter((_, i) => i !== index));
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            addCode();
        }
    };

    return (
        <div data-testid="bisac-input">
            {codes.length > 0 && (
                <div
                    data-testid="bisac-input-chip-list"
                    style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 6,
                        marginBottom: 8,
                    }}
                >
                    {codes.map((code, i) => (
                        <span
                            key={`${code}-${i}`}
                            data-testid={`bisac-chip-${i}`}
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                padding: "4px 8px",
                                background: "var(--bg-secondary, #f3f4f6)",
                                borderRadius: "var(--radius-sm, 4px)",
                                fontFamily: "monospace",
                                fontSize: "0.875rem",
                            }}
                        >
                            <span>{code}</span>
                            <button
                                type="button"
                                onClick={() => removeAt(i)}
                                data-testid={`bisac-chip-${i}-delete`}
                                aria-label={t(
                                    "ui.book_meta.bisac_remove",
                                    "BISAC-Code entfernen",
                                )}
                                style={{
                                    background: "transparent",
                                    border: "none",
                                    padding: 0,
                                    cursor: "pointer",
                                    color: "var(--text-muted, #6b7280)",
                                    display: "inline-flex",
                                }}
                            >
                                <X size={12} />
                            </button>
                        </span>
                    ))}
                </div>
            )}
            <div style={{display: "flex", gap: 6}}>
                <input
                    className="input"
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={t(
                        "ui.book_meta.bisac_placeholder",
                        "z. B. FIC022020",
                    )}
                    maxLength={9}
                    data-testid="bisac-input-add"
                    style={{flex: 1, fontFamily: "monospace"}}
                />
                <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={addCode}
                    disabled={!isValid || normalised === ""}
                    data-testid="bisac-input-add-button"
                    style={{display: "flex", alignItems: "center", gap: 4}}
                >
                    <Plus size={14} />{" "}
                    {t("ui.common.add", "Hinzufügen")}
                </button>
            </div>
            {!isValid && normalised !== "" && (
                <small
                    data-testid="bisac-input-format-error"
                    style={{
                        color: "var(--danger, #b91c1c)",
                        display: "block",
                        marginTop: 4,
                    }}
                >
                    {t(
                        "ui.book_meta.bisac_format_error",
                        "Ungültiges Format. Erwartet: 3 Großbuchstaben + 6 Ziffern (z. B. FIC022020).",
                    )}
                </small>
            )}
            <small
                style={{
                    color: "var(--text-muted, #6b7280)",
                    display: "block",
                    marginTop: 6,
                    fontSize: "0.75rem",
                }}
            >
                {t(
                    "ui.book_meta.bisac_helper",
                    "Vollständige Liste der BISAC-Codes:",
                )}{" "}
                <a
                    href="https://www.bisg.org/complete-bisac-subject-headings-list"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="bisac-input-helper-link"
                >
                    www.bisg.org
                </a>
            </small>
        </div>
    );
}
