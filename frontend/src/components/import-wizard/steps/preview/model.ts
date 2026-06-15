/**
 * Pure helpers, field specs, and form-state model for the Step-3
 * Preview panel. Extracted from PreviewPanel.tsx; logic is
 * byte-identical.
 */

import type {
    BookImportOverrideKey,
    DetectedAsset,
    DetectedProject,
    Overrides,
} from "../../../../api/import";

export function humanSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function groupAssetsByPurpose(
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
export interface FieldSpec {
    key: BookImportOverrideKey;
    labelKey: string;
    fallback: string;
    longform?: boolean;
    mono?: boolean;
}

export const SECTIONS: {
    titleKey: string;
    fallback: string;
    fields: FieldSpec[];
}[] = [
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

export function detectedStringValue(
    detected: DetectedProject,
    key: BookImportOverrideKey,
): string {
    const raw = (detected as unknown as Record<string, unknown>)[key];
    if (raw === null || raw === undefined) return "";
    if (Array.isArray(raw)) return raw.join(", ");
    return String(raw);
}

export function formValueEmpty(v: string): boolean {
    return !v || v.trim().length === 0;
}

export interface FieldState {
    include: boolean;
    value: string; // canonical string form; keywords stored as comma-separated, series_index as digits
}

export function buildInitialFormState(
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

export function overridesFromState(
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
