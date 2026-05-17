import React, {useState} from "react"
import {ChevronDown, ChevronRight, Check} from "lucide-react"
import type {PageLayout} from "../api/client"
import {useI18n} from "../hooks/useI18n"
import styles from "./LayoutPicker.module.css"

interface Props {
    selected: PageLayout
    onChange: (layout: PageLayout) => void
    disabled?: boolean
}

// Layout A + Layout B are the two default-visible options. The
// remaining three sit behind the "More layouts" disclosure to keep
// the properties pane lean for the common case.
const DEFAULT_LAYOUTS: PageLayout[] = ["speech_bubble", "image_top_text_bottom"]
const ADDITIONAL_LAYOUTS: PageLayout[] = [
    "image_left_text_right",
    "image_full_text_overlay",
    "text_only",
]

const LAYOUT_LABEL_FALLBACKS: Record<PageLayout, string> = {
    speech_bubble: "Speech bubble",
    image_top_text_bottom: "Image top, text bottom",
    image_left_text_right: "Image left, text right",
    image_full_text_overlay: "Full image with text overlay",
    text_only: "Text only",
}

export default function LayoutPicker({selected, onChange, disabled}: Props) {
    const {t} = useI18n()
    const [expanded, setExpanded] = useState(false)

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
            <div className={styles.options} data-testid="page-editor-layout-options-default">
                {DEFAULT_LAYOUTS.map(renderOption)}
            </div>
            <button
                type="button"
                className={styles.moreToggle}
                onClick={() => setExpanded((prev) => !prev)}
                data-testid="page-editor-layout-more-toggle"
                data-expanded={expanded ? "true" : "false"}
                aria-expanded={expanded}
                aria-controls="page-editor-layout-more-options"
            >
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span>{t("ui.page_editor.more_layouts", "More layouts")}</span>
            </button>
            {expanded && (
                <div
                    id="page-editor-layout-more-options"
                    className={styles.options}
                    data-testid="page-editor-layout-options-more"
                >
                    {ADDITIONAL_LAYOUTS.map(renderOption)}
                </div>
            )}
        </div>
    )
}
