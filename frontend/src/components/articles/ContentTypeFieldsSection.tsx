/**
 * ARTICLE-TYPES-SSOT-01 C6 (2026-05-29). Renders the
 * type-specific extra_fields section in the ArticleEditor
 * sidebar.
 *
 * For each entry in the article-type's ``extra_fields`` from
 * article-types.yaml, picks the right input component based on
 * the field's ``type`` (text / number / enum / date) and writes
 * the value into the article's ``article_metadata`` dict, keyed
 * by ``field.name``.
 *
 * Surface contract: when the user picks an article-type whose
 * extra_fields list is empty (blogpost, essay), the component
 * renders ``null`` so the sidebar doesn't grow a useless empty
 * section. When the type has extra_fields, the section heading
 * is rendered above the inputs.
 */

import {useCallback, type ChangeEvent} from "react";

import type {ContentType, ContentTypeExtraField} from "../../api/client";
import {useContentTypes} from "../../hooks/useContentTypes";
import {useI18n} from "../../hooks/useI18n";
import {RadixSelect} from "../RadixSelect";

interface ContentTypeFieldsSectionProps {
    contentType: string;
    metadata: Record<string, unknown>;
    onChange: (
        contentType: ContentType,
        nextMetadata: Record<string, unknown>,
    ) => void;
    /** Disable every input (e.g. during persist-in-flight). */
    disabled?: boolean;
    /** Optional testid for the section wrapper. */
    testId?: string;
}

export function ContentTypeFieldsSection({
    contentType,
    metadata,
    onChange,
    disabled = false,
    testId = "article-type-fields-section",
}: ContentTypeFieldsSectionProps) {
    const {t} = useI18n();
    const snapshot = useContentTypes();

    const at = snapshot.types[contentType];
    const fields = at?.extra_fields ?? [];

    const handleFieldChange = useCallback(
        (fieldName: string, nextValue: unknown) => {
            const nextMetadata = {...metadata, [fieldName]: nextValue};
            onChange(contentType as ContentType, nextMetadata);
        },
        [contentType, metadata, onChange],
    );

    if (fields.length === 0) return null;

    return (
        <div data-testid={testId} style={{marginTop: 16}}>
            <h3 style={{fontSize: 14, fontWeight: 600, marginBottom: 8}}>
                {t(
                    "ui.content_types.fields_section_heading",
                    "Typ-spezifische Felder",
                )}
            </h3>
            {fields.map((field) => (
                <FieldInput
                    key={field.name}
                    field={field}
                    value={metadata[field.name]}
                    onChange={(v) => handleFieldChange(field.name, v)}
                    disabled={disabled}
                />
            ))}
        </div>
    );
}

interface FieldInputProps {
    field: ContentTypeExtraField;
    value: unknown;
    onChange: (next: unknown) => void;
    disabled: boolean;
}

function FieldInput({field, value, onChange, disabled}: FieldInputProps) {
    const {t} = useI18n();
    const label = t(field.label_key, field.name);
    const inputId = `article-type-field-${field.name}`;
    const testId = `article-type-field-${field.name}`;

    return (
        <div style={{marginBottom: 12}}>
            <label
                htmlFor={inputId}
                style={{display: "block", fontSize: 13, marginBottom: 4}}
            >
                {label}
            </label>
            {field.type === "text" && (
                <input
                    id={inputId}
                    type="text"
                    className="form-input"
                    value={typeof value === "string" ? value : ""}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        onChange(e.target.value || null)
                    }
                    disabled={disabled}
                    data-testid={testId}
                />
            )}
            {field.type === "number" && (
                <input
                    id={inputId}
                    type="number"
                    className="form-input"
                    value={
                        typeof value === "number"
                            ? String(value)
                            : typeof value === "string"
                              ? value
                              : ""
                    }
                    min={field.min}
                    max={field.max}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                        const raw = e.target.value;
                        if (raw === "") {
                            onChange(null);
                            return;
                        }
                        const n = Number(raw);
                        onChange(Number.isFinite(n) ? n : null);
                    }}
                    disabled={disabled}
                    data-testid={testId}
                />
            )}
            {field.type === "enum" && (
                <RadixSelect
                    id={inputId}
                    className="is-block"
                    value={typeof value === "string" ? value : ""}
                    onValueChange={(next) => onChange(next || null)}
                    disabled={disabled}
                    testId={testId}
                    allOption={{label: "—"}}
                    options={(field.values ?? []).map((v) => ({
                        value: v,
                        label: v,
                    }))}
                />
            )}
            {field.type === "date" && (
                <input
                    id={inputId}
                    type="date"
                    className="form-input"
                    value={typeof value === "string" ? value : ""}
                    onChange={(e) => onChange(e.target.value || null)}
                    disabled={disabled}
                    data-testid={testId}
                />
            )}
        </div>
    );
}

export default ContentTypeFieldsSection;
