import { useMemo, useState } from "react";
import { BookOpen, ChevronRight, ImageOff, Plus, X } from "lucide-react";
import { useI18n } from "../../../hooks/useI18n";
import { useAuthorChoices } from "../../../hooks/useAuthorChoices";
import type {
    BookImportOverrideKey,
    DetectedAsset,
    DetectedChapter,
    DetectedGitRepo,
    DetectedProject,
    GitAdoption,
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
    // cover_image is NOT user-editable in the wizard. The detected
    // value is a metadata.yaml hint like "cover.png" which would
    // OVERWRITE the full uploads/<id>/cover/<file> path the handler
    // wrote via _maybe_set_cover_from_assets. Force include=false so
    // the override comes through as null (skip) and the handler-set
    // path survives. Multi-cover selection flows through the
    // primary_cover meta-override instead.
    state.cover_image = { include: false, value: "" };
    // Title and author are always included (mandatory).
    state.title = { include: true, value: state.title.value || (detected.title ?? "") };
    state.author = { include: true, value: state.author.value || (detected.author ?? "") };
    // Language default "de" if detected was empty.
    if (!state.language.value) state.language = { include: true, value: "de" };
    return state;
}

function overridesFromState(
    state: Record<BookImportOverrideKey, FieldState>,
    primaryCover: string | null = null,
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
    // primary_cover is a meta-override (not a Book column). Only set
    // when a cover is actually chosen; backend skips null meta-overrides.
    if (primaryCover) {
        out.primary_cover = primaryCover;
    }
    return out;
}

export function PreviewPanel({
    detected,
    overrides: _overrides,
    onOverridesChange,
    tempRef,
    gitAdoption = "start_fresh",
    onGitAdoptionChange,
}: {
    detected: DetectedProject;
    overrides: Overrides;
    onOverridesChange: (o: Overrides) => void;
    /** Staging handle from detect; CoverThumbnail uses it to build
     * the ``/api/import/staged/{tempRef}/file?path=...`` URL for
     * the cover image preview. Undefined in tests that mount
     * PreviewPanel standalone; renders the filename placeholder
     * in that case. */
    tempRef?: string;
    /** Current user choice for .git/ adoption. Ignored (section not
     * rendered) when ``detected.git_repo`` is null or present=false. */
    gitAdoption?: GitAdoption;
    onGitAdoptionChange?: (choice: GitAdoption) => void;
}) {
    const { t } = useI18n();
    const authorChoices = useAuthorChoices();
    const [state, setStateRaw] = useState<
        Record<BookImportOverrideKey, FieldState>
    >(() => buildInitialFormState(detected));

    const assetGroups = groupAssetsByPurpose(detected.assets);
    const coverAssets = useMemo(
        () => [
            ...(assetGroups["cover"] ?? []),
            ...(assetGroups["covers"] ?? []),
        ],
        [assetGroups],
    );

    // Default primary cover: match detected.cover_image when set and
    // present in the cover list; otherwise pick the first cover. When
    // a project ships only one (or zero) covers this is null and the
    // backend falls back to its handler-level default.
    const [primaryCover, setPrimaryCover] = useState<string | null>(() => {
        if (coverAssets.length === 0) return null;
        const hinted = detected.cover_image
            ? coverAssets.find(
                  (a) =>
                      a.filename === detected.cover_image ||
                      a.path.endsWith(detected.cover_image as string),
              )
            : undefined;
        return (hinted ?? coverAssets[0]).filename;
    });

    // Meta-override only makes sense when the user actually has a
    // choice. A single cover becomes book.cover_image via the handler
    // default and does not need an override.
    const primaryCoverForOverride =
        coverAssets.length > 1 ? primaryCover : null;

    const setState = (
        updater: (
            prev: Record<BookImportOverrideKey, FieldState>,
        ) => Record<BookImportOverrideKey, FieldState>,
    ) => {
        setStateRaw((prev) => {
            const next = updater(prev);
            onOverridesChange(
                overridesFromState(next, primaryCoverForOverride),
            );
            return next;
        });
    };

    const updateField = (
        key: BookImportOverrideKey,
        patch: Partial<FieldState>,
    ) => {
        setState((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
    };

    const selectPrimaryCover = (filename: string) => {
        setPrimaryCover(filename);
        // Re-emit overrides so the parent sees the new primary_cover.
        onOverridesChange(
            overridesFromState(
                state,
                coverAssets.length > 1 ? filename : null,
            ),
        );
    };

    // Propagate initial overrides on mount so the parent's submit
    // button reflects required-field validity on the first render.
    useMemo(
        () =>
            onOverridesChange(
                overridesFromState(state, primaryCoverForOverride),
            ),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    );

    const primaryCoverAsset =
        coverAssets.find((a) => a.filename === primaryCover) ??
        coverAssets[0] ??
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
                    <CoverThumbnail cover={primaryCoverAsset} tempRef={tempRef} />
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
                            list={
                                authorChoices.length > 0
                                    ? "preview-author-options"
                                    : undefined
                            }
                            style={{
                                ...inputStyle,
                                borderColor: authorEmpty
                                    ? "var(--danger)"
                                    : "var(--border)",
                            }}
                        />
                        {authorChoices.length > 0 && (
                            <datalist
                                id="preview-author-options"
                                data-testid="preview-author-datalist"
                            >
                                {authorChoices.map((name) => (
                                    <option key={name} value={name} />
                                ))}
                            </datalist>
                        )}
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

            {/* Section: covers (multi-cover selector, only when >1) */}
            {coverAssets.length > 1 && (
                <CoverGridSection
                    covers={coverAssets}
                    primaryCover={primaryCover}
                    onSelect={selectPrimaryCover}
                    tempRef={tempRef}
                />
            )}

            {/* Section: author assets (portrait, signature, bio images) */}
            {(assetGroups["author-asset"] ?? []).length > 0 && (
                <AuthorAssetsSection
                    assets={assetGroups["author-asset"] ?? []}
                    tempRef={tempRef}
                />
            )}

            {/* Section: git adoption (only when source ships a .git/) */}
            {detected.git_repo && detected.git_repo.present && (
                <GitAdoptionSection
                    info={detected.git_repo}
                    choice={gitAdoption}
                    onChange={
                        onGitAdoptionChange ?? (() => undefined)
                    }
                />
            )}

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
    const order = [
        "cover",
        "covers",
        "author-asset",
        "figure",
        "css",
        "font",
        "other",
    ];
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

function CoverThumbnail({
    cover,
    tempRef,
}: {
    cover: DetectedAsset | null;
    tempRef?: string;
}) {
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
    // Render the actual image when we have a temp_ref to fetch from
    // the staging endpoint; otherwise fall back to the filename-as-
    // label placeholder. Filename fallback also shows when the
    // server refuses the asset (stale temp_ref, path rejected).
    if (tempRef) {
        const src = `/api/import/staged/${encodeURIComponent(tempRef)}/file?path=${encodeURIComponent(cover.path)}`;
        return (
            <img
                data-testid="preview-cover-thumbnail"
                src={src}
                alt={cover.filename}
                style={{
                    width: 80,
                    aspectRatio: "3/4",
                    background: "var(--bg-hover)",
                    borderRadius: 6,
                    objectFit: "cover",
                    flexShrink: 0,
                }}
            />
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

/**
 * Multi-cover selector: one radio per cover asset with a thumbnail.
 *
 * Rendered only when the source project ships more than one file
 * under ``assets/cover`` or ``assets/covers``. Picking a cover sends
 * the meta-override ``primary_cover: <filename>`` to the backend, which
 * promotes it onto ``book.cover_image`` and imports the rest as
 * ``asset_type="cover"`` rows for later swapping in the metadata editor.
 */
function CoverGridSection({
    covers,
    primaryCover,
    onSelect,
    tempRef,
}: {
    covers: DetectedAsset[];
    primaryCover: string | null;
    onSelect: (filename: string) => void;
    tempRef?: string;
}) {
    const { t } = useI18n();
    return (
        <section
            data-testid="preview-section-covers"
            style={sectionStyle}
        >
            <h4 style={sectionHeadingStyle}>
                {t("ui.import_wizard.section_covers", "Covers")}
            </h4>
            <p style={{ ...muteStyle, margin: "4px 0 8px 0" }}>
                {t(
                    "ui.import_wizard.covers_hint",
                    "Multiple covers detected. Pick the primary cover for book.cover_image. All files are imported as cover assets and can be swapped later in the metadata editor.",
                )}
            </p>
            <div
                data-testid="preview-cover-grid"
                role="radiogroup"
                aria-label={t(
                    "ui.import_wizard.section_covers",
                    "Covers",
                )}
                style={{
                    display: "grid",
                    gridTemplateColumns:
                        "repeat(auto-fill, minmax(88px, 1fr))",
                    gap: 10,
                }}
            >
                {covers.map((cover) => {
                    const selected = cover.filename === primaryCover;
                    return (
                        <label
                            key={cover.filename}
                            data-testid={`preview-cover-option-${cover.filename}`}
                            data-selected={selected ? "true" : "false"}
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                cursor: "pointer",
                                padding: 6,
                                border: selected
                                    ? "2px solid var(--accent)"
                                    : "1px solid var(--border)",
                                borderRadius: 6,
                                background: selected
                                    ? "var(--bg-hover)"
                                    : "var(--bg-primary)",
                                gap: 4,
                            }}
                        >
                            <input
                                type="radio"
                                name="preview-primary-cover"
                                value={cover.filename}
                                checked={selected}
                                onChange={() => onSelect(cover.filename)}
                                data-testid={`preview-cover-radio-${cover.filename}`}
                                style={{ position: "absolute", opacity: 0 }}
                                aria-label={cover.filename}
                            />
                            <CoverThumbnail cover={cover} tempRef={tempRef} />
                            <span
                                style={{
                                    fontSize: "0.6875rem",
                                    color: "var(--text-secondary)",
                                    textAlign: "center",
                                    wordBreak: "break-all",
                                    maxWidth: "100%",
                                }}
                                title={cover.path}
                            >
                                {cover.filename}
                            </span>
                        </label>
                    );
                })}
            </div>
        </section>
    );
}

/**
 * Author assets section: portraits, signatures, bio images.
 *
 * Read-only preview. All files classified with purpose="author-asset"
 * (``assets/author/``, ``assets/authors/``, ``assets/about-author/``)
 * are imported verbatim with asset_type="author-asset" so the metadata
 * editor Design tab can surface them separately from chapter figures.
 * The user cannot deselect here; imports track source fidelity.
 */
function AuthorAssetsSection({
    assets,
    tempRef,
}: {
    assets: DetectedAsset[];
    tempRef?: string;
}) {
    const { t } = useI18n();
    return (
        <section
            data-testid="preview-section-author-assets"
            style={sectionStyle}
        >
            <h4 style={sectionHeadingStyle}>
                {t(
                    "ui.import_wizard.section_author_assets",
                    "Author assets",
                )}{" "}
                <span
                    data-testid="preview-author-assets-count"
                    style={muteStyle}
                >
                    ({assets.length})
                </span>
            </h4>
            <p style={{ ...muteStyle, margin: "4px 0 8px 0" }}>
                {t(
                    "ui.import_wizard.author_assets_hint",
                    "Portrait, signature, or bio images imported for the Design tab of the metadata editor.",
                )}
            </p>
            <div
                data-testid="preview-author-assets-grid"
                style={{
                    display: "grid",
                    gridTemplateColumns:
                        "repeat(auto-fill, minmax(88px, 1fr))",
                    gap: 10,
                }}
            >
                {assets.map((asset) => (
                    <div
                        key={asset.filename}
                        data-testid={`preview-author-asset-${asset.filename}`}
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            padding: 6,
                            border: "1px solid var(--border)",
                            borderRadius: 6,
                            background: "var(--bg-primary)",
                            gap: 4,
                        }}
                    >
                        <CoverThumbnail cover={asset} tempRef={tempRef} />
                        <span
                            style={{
                                fontSize: "0.6875rem",
                                color: "var(--text-secondary)",
                                textAlign: "center",
                                wordBreak: "break-all",
                                maxWidth: "100%",
                            }}
                            title={asset.path}
                        >
                            {asset.filename}
                        </span>
                        <span
                            style={{
                                fontSize: "0.625rem",
                                color: "var(--text-muted)",
                            }}
                        >
                            {humanSize(asset.size_bytes)}
                        </span>
                    </div>
                ))}
            </div>
        </section>
    );
}

/**
 * Git adoption selector: 3-way radio for a ``.git/`` found in the source.
 *
 * Backend values per protocol.py:
 * - ``start_fresh``: default; the .git/ is ignored; a fresh repo is
 *   created on the first local edit.
 * - ``adopt_with_remote``: copy .git/ and keep its remote URL.
 * - ``adopt_without_remote``: copy .git/ and strip the remote
 *   (sanitized already on the backend; this choice only confirms it).
 *
 * Surfaces security warnings from the inspect pass so the user knows
 * what sanitization will happen (credential helper stripped, custom
 * hooks dropped, etc.) before confirming adoption.
 */
function GitAdoptionSection({
    info,
    choice,
    onChange,
}: {
    info: DetectedGitRepo;
    choice: GitAdoption;
    onChange: (c: GitAdoption) => void;
}) {
    const { t } = useI18n();
    const options: {
        value: GitAdoption;
        labelKey: string;
        fallback: string;
        descKey: string;
        descFallback: string;
        disabled?: boolean;
    }[] = [
        {
            value: "start_fresh",
            labelKey: "ui.import_wizard.git_start_fresh",
            fallback: "Start fresh",
            descKey: "ui.import_wizard.git_start_fresh_desc",
            descFallback:
                "Ignore the imported .git/ directory. A new repo will be created on the first local edit.",
        },
        {
            value: "adopt_with_remote",
            labelKey: "ui.import_wizard.git_adopt_with_remote",
            fallback: "Adopt history + remote",
            descKey: "ui.import_wizard.git_adopt_with_remote_desc",
            descFallback:
                "Keep commits, branches and the remote URL. Credentials are stripped before adoption.",
            disabled: !info.remote_url,
        },
        {
            value: "adopt_without_remote",
            labelKey: "ui.import_wizard.git_adopt_without_remote",
            fallback: "Adopt history only",
            descKey: "ui.import_wizard.git_adopt_without_remote_desc",
            descFallback:
                "Keep commits and branches. Discard the remote URL so you can wire up a fresh one.",
        },
    ];

    return (
        <section
            data-testid="preview-section-git-adoption"
            style={sectionStyle}
        >
            <h4 style={sectionHeadingStyle}>
                {t("ui.import_wizard.section_git", "Git history")}
            </h4>
            <p style={{ ...muteStyle, margin: "4px 0 8px 0" }}>
                {t(
                    "ui.import_wizard.git_detected_hint",
                    "The import source contains a .git/ directory. Pick whether to adopt its history into the new book.",
                )}
            </p>
            <ul
                data-testid="preview-git-summary"
                style={{
                    listStyle: "none",
                    padding: 0,
                    margin: "0 0 10px 0",
                    fontSize: "0.75rem",
                    color: "var(--text-secondary)",
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                    gap: 4,
                }}
            >
                {info.current_branch && (
                    <li data-testid="preview-git-branch">
                        {t("ui.import_wizard.git_branch", "Branch")}:{" "}
                        <span style={{ fontFamily: "var(--font-mono)" }}>
                            {info.current_branch}
                        </span>
                    </li>
                )}
                {info.commit_count !== null && (
                    <li data-testid="preview-git-commits">
                        {t("ui.import_wizard.git_commits", "Commits")}:{" "}
                        {info.commit_count}
                    </li>
                )}
                {info.head_sha && (
                    <li data-testid="preview-git-head">
                        HEAD:{" "}
                        <span
                            style={{ fontFamily: "var(--font-mono)" }}
                            title={info.head_sha}
                        >
                            {info.head_sha.slice(0, 10)}
                        </span>
                    </li>
                )}
                {info.remote_url && (
                    <li data-testid="preview-git-remote">
                        {t("ui.import_wizard.git_remote", "Remote")}:{" "}
                        <span
                            style={{
                                fontFamily: "var(--font-mono)",
                                wordBreak: "break-all",
                            }}
                            title={info.remote_url}
                        >
                            {info.remote_url}
                        </span>
                    </li>
                )}
                <li data-testid="preview-git-size">
                    {t("ui.import_wizard.git_size", "Size")}:{" "}
                    {humanSize(info.size_bytes)}
                </li>
                {info.has_lfs && (
                    <li data-testid="preview-git-lfs">
                        {t("ui.import_wizard.git_has_lfs", "LFS detected")}
                    </li>
                )}
                {info.has_submodules && (
                    <li data-testid="preview-git-submodules">
                        {t(
                            "ui.import_wizard.git_has_submodules",
                            "Submodules present (not adopted)",
                        )}
                    </li>
                )}
                {info.is_shallow && (
                    <li data-testid="preview-git-shallow">
                        {t("ui.import_wizard.git_is_shallow", "Shallow clone")}
                    </li>
                )}
                {info.is_corrupted && (
                    <li
                        data-testid="preview-git-corrupted"
                        style={{ color: "var(--danger)" }}
                    >
                        {t(
                            "ui.import_wizard.git_is_corrupted",
                            "Repository appears corrupted (fsck failed)",
                        )}
                    </li>
                )}
            </ul>
            {info.security_warnings.length > 0 && (
                <ul
                    data-testid="preview-git-security-warnings"
                    style={{
                        listStyle: "disc",
                        padding: "4px 8px 4px 20px",
                        margin: "0 0 10px 0",
                        background: "var(--bg-warning, var(--bg-hover))",
                        border: "1px solid var(--warning, var(--border))",
                        borderRadius: 4,
                        fontSize: "0.75rem",
                    }}
                >
                    {info.security_warnings.map((warning, i) => (
                        <li key={i} data-testid="preview-git-security-warning">
                            {warning}
                        </li>
                    ))}
                </ul>
            )}
            <div
                role="radiogroup"
                aria-label={t(
                    "ui.import_wizard.section_git",
                    "Git history",
                )}
                style={{ display: "flex", flexDirection: "column", gap: 6 }}
            >
                {options.map((opt) => {
                    const selected = choice === opt.value;
                    return (
                        <label
                            key={opt.value}
                            data-testid={`preview-git-option-${opt.value}`}
                            data-selected={selected ? "true" : "false"}
                            style={{
                                display: "flex",
                                gap: 8,
                                padding: 8,
                                border: selected
                                    ? "2px solid var(--accent)"
                                    : "1px solid var(--border)",
                                borderRadius: 6,
                                background: selected
                                    ? "var(--bg-hover)"
                                    : "var(--bg-primary)",
                                cursor: opt.disabled ? "not-allowed" : "pointer",
                                opacity: opt.disabled ? 0.55 : 1,
                            }}
                        >
                            <input
                                type="radio"
                                name="preview-git-adoption"
                                value={opt.value}
                                checked={selected}
                                disabled={opt.disabled}
                                onChange={() => onChange(opt.value)}
                                data-testid={`preview-git-radio-${opt.value}`}
                                style={{ marginTop: 3 }}
                            />
                            <span>
                                <span
                                    style={{
                                        fontWeight: 500,
                                        fontSize: "0.875rem",
                                    }}
                                >
                                    {t(opt.labelKey, opt.fallback)}
                                </span>
                                <span
                                    style={{
                                        display: "block",
                                        fontSize: "0.75rem",
                                        color: "var(--text-muted)",
                                        marginTop: 2,
                                    }}
                                >
                                    {t(opt.descKey, opt.descFallback)}
                                </span>
                            </span>
                        </label>
                    );
                })}
            </div>
        </section>
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
