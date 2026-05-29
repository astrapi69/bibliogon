/**
 * ComicGridTemplatePicker — page-level layout picker for comic
 * pages.
 *
 * Phase 1 of PLUGIN-COMICS-PHASE-1-MULTI-PANEL-LAYOUTS-01
 * (2026-05-20). Header-level dropdown surfacing the 6 user-facing
 * Standard Layouts (single_panel + grid_1x2 + grid_2x1 + grid_2x2
 * + grid_2x3 + grid_3x2). grid_3x3 is intentionally excluded
 * (legacy / advanced).
 *
 * Picker placement is the header per Q3 (a) → may absorb into
 * LayoutConfigComicPage side-pane in Phase 2 (Q3 b).
 *
 * The picker only writes ``Page.layout_config.comic_grid_template``;
 * it doesn't touch panels or other layout_config keys (e.g. future
 * Phase 3 #6 panel-gutter). Caller (ComicBookEditor) handles the
 * merge with the existing layout_config to preserve sibling keys.
 */

import {useI18n} from "../../hooks/useI18n";

import {
    COMIC_GRID_TEMPLATE_PICKER_OPTIONS,
    DEFAULT_COMIC_GRID_TEMPLATE,
    type ComicGridTemplate,
} from "./ComicPanelGrid";
import {COMIC_HEADER_SELECT_STYLE} from "./headerSelectStyle";

interface ComicGridTemplatePickerProps {
    value: ComicGridTemplate | null;
    onChange: (next: ComicGridTemplate) => void;
    disabled?: boolean;
}

const FALLBACK_LABELS: Record<ComicGridTemplate, string> = {
    single_panel: "Splash (1 panel)",
    grid_1x2: "Side-by-side (2 panels)",
    grid_2x1: "Stacked (2 panels)",
    grid_2x2: "Standard grid (4 panels)",
    grid_2x3: "Two-tier (6 panels)",
    grid_3x2: "Three-tier (6 panels)",
    grid_3x3: "Advanced grid (9 panels)",
};

export function ComicGridTemplatePicker({
    value,
    onChange,
    disabled,
}: ComicGridTemplatePickerProps) {
    const {t} = useI18n();
    const resolved = value ?? DEFAULT_COMIC_GRID_TEMPLATE;

    return (
        <label
            data-testid="comic-grid-template-picker"
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: "0.85rem",
            }}
        >
            <span>
                {t("ui.comic_book_editor.layout_picker.heading", "Layout")}
            </span>
            <select
                value={resolved}
                onChange={(e) =>
                    onChange(e.target.value as ComicGridTemplate)
                }
                disabled={disabled}
                data-testid="comic-grid-template-picker-select"
                aria-label={t(
                    "ui.comic_book_editor.layout_picker.heading",
                    "Layout",
                )}
                style={COMIC_HEADER_SELECT_STYLE}
            >
                {COMIC_GRID_TEMPLATE_PICKER_OPTIONS.map((template) => (
                    <option
                        key={template}
                        value={template}
                        data-testid={`comic-grid-template-option-${template}`}
                    >
                        {t(
                            `ui.comic_book_editor.layout_picker.${template}`,
                            FALLBACK_LABELS[template],
                        )}
                    </option>
                ))}
            </select>
        </label>
    );
}

export default ComicGridTemplatePicker;
