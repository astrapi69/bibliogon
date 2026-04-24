import { useMemo, useState } from "react";
import { BookOpen, ChevronRight, ImageOff, Plus, X } from "lucide-react";
import { useI18n } from "../../../hooks/useI18n";
import type {
    BookImportOverrideKey,
    DetectedAsset,
    DetectedChapter,
    DetectedProject,
    Overrides,
} from "../../../api/import";

/**
 * Step 3 Preview — sectioned field selection.
 *
 * Each user-editable Book column appears as a row with an
 * include/exclude checkbox + a value editor. Title and author are
 * mandatory: always shown, always included, import disabled if
 * blank. All other fields default to included when the source
 * provided a value and hidden (collapsed into an "add field"
 * dropdown) when it did not.
 *
 * The component keeps a local ``formState`` map keyed by the Book
 * column name. On confirm the parent converts it into the flat
 * ``Overrides`` dict (null for deselected fields). Per-section
 * structure makes the dense 24-field form navigable without a
 * designed layout.
 */

function humanSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function groupAssetsByPurpose(
    assets: DetectedAsset[],
): Record<string, DetectedAsset[]> {
    const groups: Record<string, DetectedAsset[]> = {};
    for (const a of assets) {
        const key = a.purpose || "other";
        groups[key] = groups[key] || [];
        groups[key].push(a);
    }
    return groups;
}

// Section layout: ordered, stable. Keys match DetectedProject
// columns. "longform" flag drives the textarea vs input choice.
interface FieldSpec {
    key: BookImportOverrideKey;
    labelKey: string;
    fallback: string;
    longform?: boolean;
    mono?: boolean;
}

const SECTIONS: { titleKey: string; fallback: string; fields: FieldSpec[] }[] = [
    {
        titleKey: "ui.import_wizard.section_metadata",
        fallback: "Metadata",
        fields: [
            {
                key: "subtitle",
                labelKey: "ui.metadata.subtitle",
                fallback: "Subtitle",
            },
            {
                key: "series",
                labelKey: "ui.metadata.series",
                fallback: "Series",
            },
            {
                key: "series_index",
                labelKey: "ui.metadata.series_index",
                fallback: "Series index",
            },
            {
                key: "genre",
                labelKey: "ui.metadata.genre",
                fallback: "Genre",
            },
            {
                key: "edition",
                labelKey: "ui.metadata.edition",
                fallback: "Edition",
            },
        ],
    },
    {
        titleKey: "ui.import_wizard.section_publishing",
        fallback: "Publishing",
        fields: [
            {
                key: "publisher",
                labelKey: "ui.metadata.publisher",
                fallback: "Publisher",
            },
            {
                key: "publisher_city",
                labelKey: "ui.metadata.publisher_city",
                fallback: "Publisher city",
            },
            {
                key: "publish_date",
                labelKey: "ui.metadata.publish_date",
                fallback: "Publish date",
            },
            {
                key: "isbn_ebook",
                labelKey: "ui.metadata.isbn_ebook",
                fallback: "ISBN e-book",
                mono: true,
            },
            {
                key: "isbn_paperback",
                labelKey: "ui.metadata.isbn_paperback",
                fallback: "ISBN paperback",
                mono: true,
            },
            {
                key: "isbn_hardcover",
                labelKey: "ui.metadata.isbn_hardcover",
                fallback: "ISBN hardcover",
                mono: true,
            },
            {
                key: "asin_ebook",
                labelKey: "ui.metadata.asin_ebook",
                fallback: "ASIN e-book",
                mono: true,
            },
            {
                key: "asin_paperback",
                labelKey: "ui.metadata.asin_paperback",
                fallback: "ASIN paperback",
                mono: true,
            },
            {
                key: "asin_hardcover",
                labelKey: "ui.metadata.asin_hardcover",
                fallback: "ASIN hardcover",
                mono: true,
            },
        ],
    },
    {
        titleKey: "ui.import_wizard.section_longform",
        fallback: "Long-form content",
        fields: [
            {
                key: "description",
                labelKey: "ui.metadata.description",
                fallback: "Description",
                longform: true,
            },
            {
                key: "html_description",
                labelKey: "ui.metadata.html_description",
                fallback: "HTML description",
                longform: true,
            },
            {
                key: "backpage_description",
                labelKey: "ui.metadata.backpage_description",
                fallback: "Back-cover description",
                longform: true,
            },
            {
                key: "backpage_author_bio",
                labelKey: "ui.metadata.backpage_author_bio",
                fallback: "About the author",
                longform: true,
            },
        ],
    },
    {
        titleKey: "ui.import_wizard.section_styling",
        fallback: "Styling",
        fields: [
            {
                key: "custom_css",
                labelKey: "ui.metadata.custom_css",
                fallback: "Custom CSS",
                longform: true,
                mono: true,
            },
        ],
    },
];

function detectedStringValue(
    detected: DetectedProject,
    key: BookImportOverrideKey,
): string {
    const raw = (detected as unknown as Record<string, unknown>)[key];
    if (raw === null || raw === undefined) return "";
    if (Array.isArray(raw)) return raw.join(", ");
    return String(raw);
}

function formValueEmpty(v: string): boolean {
    return !v || v.trim().length === 0;
}

interface FieldState {
    include: boolean;
    value: string; // canonical string form; keywords stored as comma-separated, series_index as digits
}

function buildInitialFormState(
    detected: DetectedProject,
): Record<BookImportOverrideKey, FieldState> {
    const state = {} as Record<BookImportOverrideKey, FieldState>;
    const keys: BookImportOverrideKey[] = [
        "title", "subtitle", "author", "language",
        "series", "series_index", "genre",
        "description", "edition", "publisher", "publisher_city", "publish_date",
        "isbn_ebook", "isbn_paperback", "isbn_hardcover",
        "asin_ebook", "asin_paperback", "asin_hardcover",
        "keywords",
        "html_description", "backpage_description", "backpage_author_bio",
        "cover_image", "custom_css",
    ];
    for (const key of keys) {
        const value = detectedStringValue(detected, key);
        state[key] = { include: !formValueEmpty(value), value };
    }
    // Title and author are always included (mandatory).
    state.title = { include: true, value: state.title.value || (detected.title ?? "") };
    state.author = { include: true, value: state.author.value || (detected.author ?? "") };
    // Language default "de" if detected was empty.
    if (!state.language.value) state.language = { include: true, value: "de" };
    return state;
}

function overridesFromState(
    state: Record<BookImportOverrideKey, FieldState>,
): Overrides {
    const out: Overrides = {};
    for (const [key, field] of Object.entries(state) as [
        BookImportOverrideKey,
        FieldState,
    ][]) {
        if (!field.include) {
            out[key] = null;
            continue;
        }
        if (key === "series_index") {
            const n = Number.parseInt(field.value, 10);
            out[key] = Number.isNaN(n) ? null : n;
            continue;
        }
        if (key === "keywords") {
            const parts = field.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
            out[key] = parts.length ? parts : null;
            continue;
        }
        out[key] = field.value;
    }
    return out;
}

export function PreviewPanel({
    detected,
    overrides: _overrides,
    onOverridesChange,
}: {
    detected: DetectedProject;
    overrides: Overrides;
    onOverridesChange: (o: Overrides) => void;
}) {
    const { t } = useI18n();
    const [state, setStateRaw] = useState<
        Record<BookImportOverrideKey, FieldState>
    >(() => buildInitialFormState(detected));

    const setState = (
        updater: (
            prev: Record<BookImportOverrideKey, FieldState>,
        ) => Record<BookImportOverrideKey, FieldState>,
    ) => {
        setStateRaw((prev) => {
            const next = updater(prev);
            onOverridesChange(overridesFromState(next));
            return next;
        });
    };

    const updateField = (
        key: BookImportOverrideKey,
        patch: Partial<FieldState>,
    ) => {
        setState((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
    };

    // Propagate initial overrides on mount so the parent's submit
    // button reflects required-field validity on the first render.
    useMemo(
        () => onOverridesChange(overridesFromState(state)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    );

    const assetGroups = groupAssetsByPurpose(detected.assets);
    const coverAsset =
        (assetGroups["cover"] ?? [])[0] ??
        (assetGroups["covers"] ?? [])[0] ??
        null;

    const titleEmpty = formValueEmpty(state.title.value);
    const authorEmpty = formValueEmpty(state.author.value);

    return (
        <div data-testid="preview-panel" className="preview-panel">
            {/* Section: basics (mandatory) */}
            <section
                data-testid="preview-section-basics"
                style={sectionStyle}
            >
                <h4 style={sectionHeadingStyle}>
                    {t("ui.import_wizard.section_basics", "Basic information")}
                </h4>
                <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
                    <CoverThumbnail cover={coverAsset} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <label style={labelStyle}>
                            {t("ui.metadata.title", "Title")}{" "}
                            <span style={{ color: "var(--danger)" }}>*</span>
                        </label>
                        <input
                            data-testid="preview-field-title"
                            aria-invalid={titleEmpty}
                            value={state.title.value}
                            onChange={(e) =>
                                updateField("title", { value: e.target.value })
                            }
                            style={{
                                ...inputStyle,
                                borderColor: titleEmpty
                                    ? "var(--danger)"
                                    : "var(--border)",
                            }}
                        />
                        {titleEmpty && (
                            <p data-testid="preview-title-error" style={errorStyle}>
                                {t(
                                    "ui.import_wizard.error_title_required",
                                    "Title is required",
                                )}
                            </p>
                        )}
                        <label style={{ ...labelStyle, marginTop: 10 }}>
                            {t("ui.metadata.author", "Author")}{" "}
                            <span style={{ color: "var(--danger)" }}>*</span>
                        </label>
                        <input
                            data-testid="preview-field-author"
                            aria-invalid={authorEmpty}
                            value={state.author.value}
                            onChange={(e) =>
                                updateField("author", { value: e.target.value })
                            }
                            style={{
                                ...inputStyle,
                                borderColor: authorEmpty
                                    ? "var(--danger)"
                                    : "var(--border)",
                            }}
                        />
                        {authorEmpty && (
                            <p data-testid="preview-author-error" style={errorStyle}>
                                {t(
                                    "ui.import_wizard.error_author_required",
                                    "Author is required",
                                )}
                            </p>
                        )}
                        <label style={{ ...labelStyle, marginTop: 10 }}>
                            {t("ui.metadata.language", "Language")}
                        </label>
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                            }}
                        >
                            <input
                                type="checkbox"
                                data-testid="preview-include-language"
                                checked={state.language.include}
                                onChange={(e) =>
                                    updateField("language", {
                                        include: e.target.checked,
                                    })
                                }
                            />
                            <input
                                data-testid="preview-field-language"
                                value={state.language.value}
                                onChange={(e) =>
                                    updateField("language", {
                                        value: e.target.value,
                                    })
                                }
                                style={{
                                    ...inputStyle,
                                    maxWidth: 80,
                                    opacity: state.language.include ? 1 : 0.4,
                                }}
                                disabled={!state.language.include}
                            />
                            <span style={muteStyle}>
                                {state.language.include
                                    ? ""
                                    : t(
                                          "ui.import_wizard.language_default_hint",
                                          "(defaults to 'de')",
                                      )}
                            </span>
                        </div>
                        <p
                            data-testid="preview-source-identifier"
                            style={idStyle}
                        >
                            {detected.source_identifier}
                        </p>
                    </div>
                </div>
            </section>

            {/* Sections: per-field */}
            {SECTIONS.map((section) => (
                <FieldSection
                    key={section.titleKey}
                    titleKey={section.titleKey}
                    fallback={section.fallback}
                    fields={section.fields}
                    state={state}
                    onUpdate={updateField}
                />
            ))}

            {/* Section: keywords (special: list type) */}
            <section
                data-testid="preview-section-keywords"
                style={sectionStyle}
            >
                <h4 style={sectionHeadingStyle}>
                    {t("ui.metadata.keywords", "Keywords")}
                </h4>
                <FieldRow
                    fieldKey="keywords"
                    labelKey="ui.metadata.keywords"
                    fallback="Keywords (comma-separated)"
                    state={state.keywords}
                    onUpdate={(p) => updateField("keywords", p)}
                />
            </section>

            {/* Section: content overview */}
            <section
                data-testid="preview-section-overview"
                style={sectionStyle}
            >
                <h4 style={sectionHeadingStyle}>
                    {t(
                        "ui.import_wizard.section_overview",
                        "Content overview",
                    )}
                </h4>
                <ChapterAndAssetOverview
                    detected={detected}
                    assetGroups={assetGroups}
                />
            </section>

            {/* Warnings from detect */}
            {detected.warnings.length > 0 && (
                <div
                    data-testid="preview-warnings"
                    style={{
                        ...sectionStyle,
                        border: "1px solid var(--accent)",
                        background: "var(--accent-light)",
                    }}
                >
                    <h4
                        style={{
                            ...sectionHeadingStyle,
                            color: "var(--accent-hover)",
                        }}
                    >
                        {t("ui.import_wizard.warnings_heading", "Warnings")}
                    </h4>
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                        {detected.warnings.map((w, i) => (
                            <li
                                key={i}
                                data-testid="preview-warning"
                                style={{ fontSize: "0.8125rem" }}
                            >
                                {w}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

function FieldSection({
    titleKey,
    fallback,
    fields,
    state,
    onUpdate,
}: {
    titleKey: string;
    fallback: string;
    fields: FieldSpec[];
    state: Record<BookImportOverrideKey, FieldState>;
    onUpdate: (key: BookImportOverrideKey, patch: Partial<FieldState>) => void;
}) {
    const { t } = useI18n();
    // Hide the section if every field in it is empty (detected gave us
    // nothing to show). User can still add via an "add field" row.
    const hasAnyValue = fields.some((f) => !formValueEmpty(state[f.key].value));
    const [showAll, setShowAll] = useState(false);
    const effectiveShowAll = showAll || hasAnyValue;
    const testid = `preview-section-${titleKey.split(".").pop()}`;
    return (
        <section data-testid={testid} style={sectionStyle}>
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 6,
                }}
            >
                <h4 style={sectionHeadingStyle}>{t(titleKey, fallback)}</h4>
                {!hasAnyValue && (
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        data-testid={`${testid}-toggle`}
                        onClick={() => setShowAll(!showAll)}
                        style={{ fontSize: "0.75rem" }}
                    >
                        {showAll ? (
                            <>
                                <X size={12} />{" "}
                                {t(
                                    "ui.import_wizard.section_hide_empty",
                                    "Hide empty fields",
                                )}
                            </>
                        ) : (
                            <>
                                <Plus size={12} />{" "}
                                {t(
                                    "ui.import_wizard.section_show_empty",
                                    "Add fields",
                                )}
                            </>
                        )}
                    </button>
                )}
            </div>
            {effectiveShowAll &&
                fields.map((f) => (
                    <FieldRow
                        key={f.key}
                        fieldKey={f.key}
                        labelKey={f.labelKey}
                        fallback={f.fallback}
                        longform={f.longform}
                        mono={f.mono}
                        state={state[f.key]}
                        onUpdate={(p) => onUpdate(f.key, p)}
                    />
                ))}
        </section>
    );
}

function FieldRow({
    fieldKey,
    labelKey,
    fallback,
    longform,
    mono,
    state,
    onUpdate,
}: {
    fieldKey: BookImportOverrideKey;
    labelKey: string;
    fallback: string;
    longform?: boolean;
    mono?: boolean;
    state: FieldState;
    onUpdate: (patch: Partial<FieldState>) => void;
}) {
    const { t } = useI18n();
    const [expanded, setExpanded] = useState(false);
    const isLong = (state.value || "").length > 200;
    const testid = `preview-field-${fieldKey.replace(/_/g, "-")}`;
    return (
        <div
            data-testid={`${testid}-row`}
            style={{ marginTop: 10, opacity: state.include ? 1 : 0.55 }}
        >
            <label
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: "0.8125rem",
                    fontWeight: 500,
                    marginBottom: 4,
                }}
            >
                <input
                    type="checkbox"
                    data-testid={`${testid}-include`}
                    checked={state.include}
                    onChange={(e) =>
                        onUpdate({ include: e.target.checked })
                    }
                />
                {t(labelKey, fallback)}
            </label>
            {longform ? (
                <>
                    <textarea
                        data-testid={testid}
                        value={
                            isLong && !expanded
                                ? state.value.slice(0, 200) + "..."
                                : state.value
                        }
                        onChange={(e) =>
                            onUpdate({ value: e.target.value })
                        }
                        disabled={!state.include || (isLong && !expanded)}
                        style={{
                            ...inputStyle,
                            width: "100%",
                            minHeight: 60,
                            fontFamily: mono ? "var(--font-mono)" : undefined,
                            fontSize: mono ? "0.75rem" : "0.8125rem",
                            resize: "vertical",
                        }}
                    />
                    {isLong && (
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            data-testid={`${testid}-expand`}
                            onClick={() => setExpanded(!expanded)}
                            style={{ fontSize: "0.75rem", marginTop: 2 }}
                        >
                            {expanded
                                ? t(
                                      "ui.import_wizard.field_collapse",
                                      "Collapse",
                                  )
                                : t(
                                      "ui.import_wizard.field_expand",
                                      `Show all (${state.value.length} chars)`,
                                  )}
                        </button>
                    )}
                </>
            ) : (
                <input
                    data-testid={testid}
                    value={state.value}
                    onChange={(e) => onUpdate({ value: e.target.value })}
                    disabled={!state.include}
                    style={{
                        ...inputStyle,
                        width: "100%",
                        fontFamily: mono ? "var(--font-mono)" : undefined,
                        fontSize: mono ? "0.75rem" : "0.875rem",
                    }}
                />
            )}
        </div>
    );
}

function ChapterAndAssetOverview({
    detected,
    assetGroups,
}: {
    detected: DetectedProject;
    assetGroups: Record<string, DetectedAsset[]>;
}) {
    const { t } = useI18n();
    const [expanded, setExpanded] = useState<number | null>(null);
    return (
        <>
            <h5 style={{ margin: "0 0 6px 0", fontSize: "0.875rem" }}>
                <BookOpen size={12} style={{ verticalAlign: "-1px" }} />{" "}
                {t(
                    "ui.import_wizard.chapters_count",
                    "{count} chapters detected",
                ).replace("{count}", String(detected.chapters.length))}
            </h5>
            {detected.chapters.length === 0 ? (
                <p
                    data-testid="preview-no-chapters"
                    style={{
                        fontSize: "0.8125rem",
                        color: "var(--text-muted)",
                        fontStyle: "italic",
                    }}
                >
                    {t(
                        "ui.import_wizard.no_chapters_detected",
                        "No chapters detected.",
                    )}
                </p>
            ) : (
                <ul
                    data-testid="preview-chapter-list"
                    style={{
                        listStyle: "none",
                        padding: 0,
                        margin: 0,
                        maxHeight: 180,
                        overflowY: "auto",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                    }}
                >
                    {detected.chapters.map((ch, idx) => (
                        <ChapterRow
                            key={idx}
                            chapter={ch}
                            expanded={expanded === idx}
                            onToggle={() =>
                                setExpanded(expanded === idx ? null : idx)
                            }
                        />
                    ))}
                </ul>
            )}
            <h5 style={{ margin: "12px 0 6px 0", fontSize: "0.875rem" }}>
                {t(
                    "ui.import_wizard.assets_count",
                    "{count} assets detected",
                ).replace("{count}", String(detected.assets.length))}
            </h5>
            {detected.assets.length === 0 ? (
                <p
                    data-testid="preview-no-assets"
                    style={{
                        fontSize: "0.8125rem",
                        color: "var(--text-muted)",
                        fontStyle: "italic",
                    }}
                >
                    {t(
                        "ui.import_wizard.no_assets_detected",
                        "No assets detected.",
                    )}
                </p>
            ) : (
                <AssetGroups groups={assetGroups} />
            )}
        </>
    );
}

function ChapterRow({
    chapter,
    expanded,
    onToggle,
}: {
    chapter: DetectedChapter;
    expanded: boolean;
    onToggle: () => void;
}) {
    return (
        <li
            data-testid="preview-chapter-row"
            style={{ borderBottom: "1px solid var(--border)", padding: "6px 8px" }}
        >
            <button
                onClick={onToggle}
                style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    width: "100%",
                    textAlign: "left",
                }}
                aria-expanded={expanded}
            >
                <ChevronRight
                    size={10}
                    style={{
                        transform: expanded ? "rotate(90deg)" : "rotate(0)",
                        transition: "transform 120ms",
                    }}
                />
                <span
                    style={{
                        flex: 1,
                        fontSize: "0.8125rem",
                        fontWeight: 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                    }}
                >
                    {chapter.position + 1}. {chapter.title}
                </span>
                <span
                    style={{
                        fontSize: "0.6875rem",
                        color: "var(--text-muted)",
                        flexShrink: 0,
                    }}
                >
                    {chapter.word_count}w
                </span>
            </button>
            {expanded && chapter.content_preview && (
                <p
                    data-testid="preview-chapter-expanded"
                    style={{
                        margin: "6px 0 0 16px",
                        fontSize: "0.75rem",
                        color: "var(--text-secondary)",
                        fontFamily: "var(--font-mono)",
                        whiteSpace: "pre-wrap",
                    }}
                >
                    {chapter.content_preview}
                </p>
            )}
        </li>
    );
}

function AssetGroups({ groups }: { groups: Record<string, DetectedAsset[]> }) {
    const { t } = useI18n();
    const order = ["cover", "covers", "figure", "css", "font", "other"];
    const keys = [
        ...order.filter((k) => groups[k] && groups[k].length),
        ...Object.keys(groups).filter((k) => !order.includes(k)),
    ];
    return (
        <div
            data-testid="preview-asset-groups"
            style={{
                maxHeight: 160,
                overflowY: "auto",
                border: "1px solid var(--border)",
                borderRadius: 6,
            }}
        >
            {keys.map((purpose) => (
                <div key={purpose} style={{ padding: "4px 8px" }}>
                    <div
                        style={{
                            fontSize: "0.6875rem",
                            fontWeight: 600,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            color: "var(--text-muted)",
                            marginBottom: 2,
                        }}
                    >
                        {t(`ui.import_wizard.purpose_${purpose}`, purpose)} (
                        {groups[purpose].length})
                    </div>
                    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        {groups[purpose].map((asset, i) => (
                            <li
                                key={i}
                                data-testid="preview-asset-row"
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    gap: 10,
                                    fontSize: "0.75rem",
                                    padding: "2px 0",
                                }}
                            >
                                <span
                                    style={{
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                    }}
                                    title={asset.path}
                                >
                                    {asset.filename}
                                </span>
                                <span
                                    style={{
                                        color: "var(--text-muted)",
                                        flexShrink: 0,
                                    }}
                                >
                                    {humanSize(asset.size_bytes)}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    );
}

function CoverThumbnail({ cover }: { cover: DetectedAsset | null }) {
    if (!cover || !cover.mime_type.startsWith("image/")) {
        return (
            <div
                data-testid="preview-cover-placeholder"
                style={{
                    width: 80,
                    aspectRatio: "3/4",
                    background: "var(--bg-hover)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 6,
                    color: "var(--text-muted)",
                    flexShrink: 0,
                }}
                aria-label="No cover"
            >
                <ImageOff size={24} strokeWidth={1.25} />
            </div>
        );
    }
    return (
        <div
            data-testid="preview-cover-thumbnail"
            style={{
                width: 80,
                aspectRatio: "3/4",
                background: "var(--bg-hover)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 6,
                textAlign: "center",
                padding: 4,
                fontSize: "0.625rem",
                color: "var(--text-secondary)",
                flexShrink: 0,
            }}
        >
            {cover.filename}
        </div>
    );
}

// --- shared styles ---

const sectionStyle: React.CSSProperties = {
    marginTop: 14,
    padding: 12,
    border: "1px solid var(--border)",
    borderRadius: 6,
    background: "var(--bg-card)",
};

const sectionHeadingStyle: React.CSSProperties = {
    margin: 0,
    fontSize: "0.9375rem",
    fontWeight: 600,
};

const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "0.75rem",
    fontWeight: 500,
    color: "var(--text-secondary)",
    marginBottom: 2,
};

const inputStyle: React.CSSProperties = {
    padding: "4px 8px",
    border: "1px solid var(--border)",
    borderRadius: 4,
    fontSize: "0.875rem",
    background: "var(--bg-primary)",
    color: "var(--text-primary)",
};

const errorStyle: React.CSSProperties = {
    margin: "2px 0 0 0",
    fontSize: "0.75rem",
    color: "var(--danger)",
};

const muteStyle: React.CSSProperties = {
    fontSize: "0.75rem",
    color: "var(--text-muted)",
};

const idStyle: React.CSSProperties = {
    marginTop: 6,
    fontSize: "0.625rem",
    fontFamily: "var(--font-mono)",
    color: "var(--text-muted)",
    wordBreak: "break-all",
};
