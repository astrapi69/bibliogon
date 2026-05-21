/**
 * LayoutConfigComicPanel — per-panel config pane for a comic panel.
 *
 * PLUGIN-COMICS-PHASE-2-PANEL-CONFIG-01 C1 (plugin-comics). Comic-
 * book panel-side counterpart to ``LayoutConfigComicBubble``. Differs
 * in:
 *
 * 1. Operates on a SINGLE panel's row (NOT a layout_config dict).
 *    The active panel's full row is passed in; ``onChange`` carries
 *    a partial update merged at the API layer
 *    (``api.comics.updatePanel``).
 * 2. Reuses ``Tier1Section`` for visual-style knobs (RCU canonical
 *    3rd-site application, after picture-book single-bubble +
 *    comic-book bubble).
 * 3. C3 adds the image-upload UI (file input + delete-image button).
 *    C1 scope is the scaffold + Tier1Section integration only.
 *
 * The Tier1Section receives ``testidPrefix="comic-panel"`` +
 * ``i18nKeyPrefix="ui.page_editor.config.comic_panel"`` so its
 * testids + i18n keys are namespace-scoped to comic-book-panel.
 */

import {Tier1Section} from "./Tier1Section";
import {useI18n} from "../../hooks/useI18n";
import type {ComicPanelData} from "./ComicPanel";

interface LayoutConfigComicPanelProps {
    panel: ComicPanelData;
    onChange: (partial: Partial<ComicPanelData>) => void;
}

export function LayoutConfigComicPanel({
    panel,
    onChange,
}: LayoutConfigComicPanelProps) {
    const {t} = useI18n();

    const writePanelConfig = (partial: Record<string, unknown>): void => {
        const prior = panel.panel_config ?? {};
        onChange({panel_config: {...prior, ...partial}});
    };

    return (
        <div
            data-testid="layout-config-comic-panel"
            style={{
                display: "flex",
                flexDirection: "column",
                gap: "14px",
                padding: "14px",
            }}
        >
            <h4 style={{margin: 0}}>
                {t(
                    "ui.page_editor.config.comic_panel.heading",
                    "Panel",
                )}
            </h4>

            <Tier1Section
                config={panel.panel_config ?? null}
                onChange={writePanelConfig}
                testidPrefix="comic-panel"
                i18nKeyPrefix="ui.page_editor.config.comic_panel"
            />
        </div>
    );
}

export default LayoutConfigComicPanel;
