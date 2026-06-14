import { useMemo, useState } from "react";
import { useI18n } from "../../../hooks/useI18n";
import { useAllowBooksWithoutAuthor } from "../../../hooks/useAllowBooksWithoutAuthor";
import {
    useAuthorProfile,
    type AuthorProfile,
} from "../../../hooks/useAuthorProfile";
import type {
    BookImportOverrideKey,
    DetectedProject,
    GitAdoption,
    Overrides,
} from "../../../api/import";
import { AuthorPicker } from "./AuthorPicker";
import { CoverThumbnail } from "./preview/CoverThumbnail";
import { FieldRow, FieldSection } from "./preview/FieldSection";
import { ChapterAndAssetOverview } from "./preview/ContentOverview";
import {
    AuthorAssetsSection,
    CoverGridSection,
} from "./preview/AssetSections";
import { GitAdoptionSection } from "./preview/GitAdoptionSection";
import {
    buildInitialFormState,
    type FieldState,
    formValueEmpty,
    groupAssetsByPurpose,
    overridesFromState,
    SECTIONS,
} from "./preview/model";
import {
    errorStyle,
    idStyle,
    inputStyle,
    labelStyle,
    muteStyle,
    sectionHeadingStyle,
    sectionStyle,
} from "./preview/styles";

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
    const fetchedProfile = useAuthorProfile();
    const [profileOverride, setProfileOverride] = useState<
        AuthorProfile | null
    >(null);
    const authorProfile = profileOverride ?? fetchedProfile;
    const allowDeferAuthor = useAllowBooksWithoutAuthor();
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
    const authorBlank = formValueEmpty(state.author.value);
    // Only flag as "empty -> error" when the toggle is off; when on,
    // a deliberately empty author is the defer path.
    const authorEmpty = authorBlank && !allowDeferAuthor;

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
                        <div data-testid="preview-field-author">
                            <AuthorPicker
                                value={state.author.value}
                                detectedName={detected.author ?? ""}
                                profile={authorProfile}
                                onChange={(v) =>
                                    updateField("author", { value: v })
                                }
                                onProfileRefresh={(next) =>
                                    setProfileOverride(next)
                                }
                                invalid={authorEmpty}
                            />
                        </div>
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
