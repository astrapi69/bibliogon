/**
 * Inline-editable override fields for step 3.
 *
 * Backend handlers (.bgb, markdown) accept a fixed allowlist of
 * override keys during execute: title, author, subtitle, language,
 * description, genre. Anything outside that raises KeyError. This
 * component edits only the four fields users actually want to tweak
 * during import; the rest stay on the Book and can be edited
 * post-import in the metadata editor.
 *
 * Cover reassignment and per-asset purpose reassignment are NOT
 * wired: the backend handlers do not accept those override keys in
 * CIO-01. A future phase (CIO-03 or PGS-01) can add them.
 */

import { useI18n } from "../../../hooks/useI18n";
import type { Overrides } from "../../../api/import";

const LANGUAGE_CODES = ["de", "en", "es", "fr", "el", "pt", "tr", "ja"] as const;

export function OverrideFields({
    overrides,
    detectedTitle,
    detectedAuthor,
    detectedLanguage,
    onChange,
}: {
    overrides: Overrides;
    detectedTitle: string | null;
    detectedAuthor: string | null;
    detectedLanguage: string | null;
    onChange: (o: Overrides) => void;
}) {
    const { t } = useI18n();

    const valueOrDetected = (key: string, fallback: string | null): string => {
        const v = overrides[key];
        if (typeof v === "string") return v;
        return fallback ?? "";
    };

    const setField = (key: string, value: string) => {
        const next = { ...overrides };
        if (value === "" || value === null) {
            delete next[key];
        } else {
            next[key] = value;
        }
        onChange(next);
    };

    return (
        <div
            data-testid="override-fields"
            style={{
                display: "grid",
                gridTemplateColumns: "120px minmax(0, 1fr)",
                gap: "8px 12px",
                alignItems: "center",
                marginTop: 16,
                paddingTop: 16,
                borderTop: "1px solid var(--border)",
            }}
        >
            <label
                htmlFor="override-title"
                style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}
            >
                {t("ui.import_wizard.override_title_label", "Title")}
            </label>
            <input
                id="override-title"
                data-testid="override-title"
                className="input"
                type="text"
                value={valueOrDetected("title", detectedTitle)}
                placeholder={
                    detectedTitle ??
                    t("ui.import_wizard.override_title_placeholder", "Book title")
                }
                onChange={(e) => setField("title", e.target.value)}
            />

            <label
                htmlFor="override-author"
                style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}
            >
                {t("ui.import_wizard.override_author_label", "Author")}
            </label>
            <input
                id="override-author"
                data-testid="override-author"
                className="input"
                type="text"
                value={valueOrDetected("author", detectedAuthor)}
                placeholder={
                    detectedAuthor ??
                    t(
                        "ui.import_wizard.override_author_placeholder",
                        "Author name",
                    )
                }
                onChange={(e) => setField("author", e.target.value)}
            />

            <label
                htmlFor="override-language"
                style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}
            >
                {t("ui.import_wizard.override_language_label", "Language")}
            </label>
            <select
                id="override-language"
                data-testid="override-language"
                className="input"
                value={valueOrDetected("language", detectedLanguage) || "de"}
                onChange={(e) => setField("language", e.target.value)}
            >
                {LANGUAGE_CODES.map((code) => (
                    <option key={code} value={code}>
                        {code}
                    </option>
                ))}
            </select>

            <label
                htmlFor="override-subtitle"
                style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}
            >
                {t("ui.import_wizard.override_subtitle_label", "Subtitle")}
            </label>
            <input
                id="override-subtitle"
                data-testid="override-subtitle"
                className="input"
                type="text"
                value={
                    typeof overrides.subtitle === "string" ? overrides.subtitle : ""
                }
                placeholder={t(
                    "ui.import_wizard.override_subtitle_placeholder",
                    "Optional",
                )}
                onChange={(e) => setField("subtitle", e.target.value)}
            />
        </div>
    );
}
