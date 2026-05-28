import React from "react"
import {Check} from "lucide-react"
import type {PageLayout} from "../api/client"
import {useI18n} from "../hooks/useI18n"
import styles from "./LayoutPicker.module.css"

interface Props {
    selected: PageLayout
    onChange: (layout: PageLayout) => void
    disabled?: boolean
}

// Picture-Book Layout Expansion Phase 1 C4 (2026-05-28). The
// 5 historical layouts + the 3 new Phase 1 entries are grouped
// into 4 user-facing categories per the adjudicated Q3. Two more
// categories ("Mehrere Bilder", further "Spezial" entries) arrive
// with Phase 2 + Phase 3. The pre-C4 ``DEFAULT_LAYOUTS`` /
// ``ADDITIONAL_LAYOUTS`` + ``More layouts`` disclosure is gone:
// 8 grouped entries fit comfortably without a disclosure.
//
// ``comic_panel_grid`` stays out of the picture-book picker
// entirely; it's the comic-book canvas's own discriminator and
// has its own picker (``ComicGridTemplatePicker``).
interface LayoutCategory {
    id: string
    labelKey: string
    labelFallback: string
    layouts: PageLayout[]
}

const LAYOUT_CATEGORIES: ReadonlyArray<LayoutCategory> = [
    {
        id: "bild_mit_text",
        labelKey: "ui.page_editor.layout_category.bild_mit_text",
        labelFallback: "Bild mit Text",
        layouts: [
            "image_top_text_bottom",
            "image_bottom_text_top",
            "image_left_text_right",
            "image_right_text_left",
            "image_full_text_overlay",
        ],
    },
    {
        id: "nur_bild",
        labelKey: "ui.page_editor.layout_category.nur_bild",
        labelFallback: "Nur Bild",
        layouts: ["image_full_no_text"],
    },
    {
        id: "nur_text",
        labelKey: "ui.page_editor.layout_category.nur_text",
        labelFallback: "Nur Text",
        layouts: ["text_only"],
    },
    {
        id: "spezial",
        labelKey: "ui.page_editor.layout_category.spezial",
        labelFallback: "Spezial",
        layouts: ["speech_bubble"],
    },
]

const LAYOUT_LABEL_FALLBACKS: Record<PageLayout, string> = {
    speech_bubble: "Speech bubble",
    image_top_text_bottom: "Image top, text bottom",
    image_left_text_right: "Image left, text right",
    image_full_text_overlay: "Full image with text overlay",
    text_only: "Text only",
    // Comic-book layout. Picture-book authors do not pick this
    // from LayoutPicker; present only for the exhaustive Record
    // type. Filtered out of every category above.
    comic_panel_grid: "Comic panel grid",
    // Phase 1 (2026-05-28). Labels for the new single-image
    // layouts. Mirrors keep parents' field semantics (split-
    // ratio, image-position) — only the visual orientation
    // flips. The label strings reflect the user-facing
    // orientation per the adjudicated Q3 category grouping.
    image_bottom_text_top: "Image bottom, text top",
    image_right_text_left: "Image right, text left",
    image_full_no_text: "Full image (no text)",
}

export default function LayoutPicker({selected, onChange, disabled}: Props) {
    const {t} = useI18n()

    const renderOption = (layout: PageLayout) => {
        const isSelected = layout === selected
        return (
            <button
                key={layout}
                type="button"
                className={[styles.option, isSelected ? styles.optionSelected : ""]
                    .filter(Boolean)
                    .join(" ")}
                data-testid={`page-editor-layout-option-${layout}`}
                data-selected={isSelected ? "true" : "false"}
                onClick={() => {
                    if (!isSelected) onChange(layout)
                }}
                disabled={disabled}
                aria-pressed={isSelected}
            >
                <span className={styles.optionCheck}>
                    {isSelected && <Check size={14} />}
                </span>
                <span className={styles.optionLabel}>
                    {t(`ui.page_editor.layout.${layout}`, LAYOUT_LABEL_FALLBACKS[layout])}
                </span>
            </button>
        )
    }

    return (
        <div
            data-testid="page-editor-layout-picker"
            className={styles.container}
        >
            <h3 className={styles.heading}>
                {t("ui.page_editor.layout_heading", "Layout")}
            </h3>
            {LAYOUT_CATEGORIES.map((category) => (
                <div
                    key={category.id}
                    className={styles.category}
                    data-testid={`page-editor-layout-category-${category.id}`}
                >
                    <h4
                        className={styles.categoryHeading}
                        data-testid={`page-editor-layout-category-heading-${category.id}`}
                    >
                        {t(category.labelKey, category.labelFallback)}
                    </h4>
                    <div className={styles.options}>
                        {category.layouts.map(renderOption)}
                    </div>
                </div>
            ))}
        </div>
    )
}
