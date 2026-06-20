/**
 * LayoutConfigComicBubble — per-bubble config pane for a comic
 * bubble.
 *
 * Comics-Session-2 C5 (plugin-comics). Comic-book counterpart to
 * ``LayoutConfigSpeechBubble``. Differs in:
 *
 * 1. Operates on a SINGLE bubble's row (NOT a layout_config dict).
 *    The active bubble's full row is passed in; ``onChange`` carries
 *    a partial update merged at the API layer.
 * 2. Adds a bubble-type radio (6 canonical types).
 * 3. Adds tail-direction radio (10 values) + tail position + tail
 *    length sliders.
 * 4. Reuses ``Tier1Section`` + ``Tier2Section`` for visual-style +
 *    typography knobs (RCU canonical 2-site application).
 *
 * Anchor + width + height knobs live HERE rather than delegating to
 * the picture-book parent because the comic-book context needs
 * x_pct + y_pct (free anchoring within a panel), not the picture-
 * book preset grid.
 *
 * The two Tier sections receive ``testidPrefix="comic-bubble"`` +
 * ``i18nKeyPrefix="ui.page_editor.config.comic_bubble"`` so their
 * testids + i18n keys are namespace-scoped to comic-book.
 */

import {useState} from "react";

import {useDebouncedCallback} from "../../hooks/useDebouncedCallback";
import {useI18n} from "../../hooks/useI18n";

import {CollapsibleConfigSection} from "../shared/CollapsibleConfigSection";
import {Tier1Section} from "./Tier1Section";
import {Tier2Section} from "./Tier2Section";
import type {ComicBubbleData} from "./ComicBubble";

const BUBBLE_TYPES = [
    "speech",
    "thought",
    "narration",
    "shout",
    "whisper",
    "sound_effect",
] as const;

const TAIL_DIRECTIONS = [
    "N",
    "NE",
    "E",
    "SE",
    "S",
    "SW",
    "W",
    "NW",
    "none",
    "auto",
] as const;

const ANCHOR_PCT_MIN = 0;
const ANCHOR_PCT_MAX = 100;
const ANCHOR_PCT_STEP = 5;

const WIDTH_PCT_MIN = 10;
const WIDTH_PCT_MAX = 100;
const WIDTH_PCT_STEP = 5;

const HEIGHT_PCT_MIN = 5;
const HEIGHT_PCT_MAX = 100;
const HEIGHT_PCT_STEP = 5;

const TAIL_LENGTH_MIN = 0;
const TAIL_LENGTH_MAX = 64;
const TAIL_LENGTH_STEP = 2;

const TAIL_POSITION_MIN = 0;
const TAIL_POSITION_MAX = 100;
const TAIL_POSITION_STEP = 5;

interface LayoutConfigComicBubbleProps {
    bubble: ComicBubbleData;
    onChange: (partial: Partial<ComicBubbleData>) => void;
}

export function LayoutConfigComicBubble({
    bubble,
    onChange,
}: LayoutConfigComicBubbleProps) {
    const {t} = useI18n();

    const debouncedAnchorX = useDebouncedCallback(
        (value: number) =>
            onChange({anchor: {...(bubble.anchor ?? {}), x_pct: value}}),
        300,
    );
    const debouncedAnchorY = useDebouncedCallback(
        (value: number) =>
            onChange({anchor: {...(bubble.anchor ?? {}), y_pct: value}}),
        300,
    );
    const debouncedWidth = useDebouncedCallback(
        (value: number) => onChange({width_pct: value}),
        300,
    );
    const debouncedHeight = useDebouncedCallback(
        (value: number) => onChange({height_pct: value}),
        300,
    );
    const debouncedTailLength = useDebouncedCallback(
        (value: number) => onChange({tail_length_px: value}),
        300,
    );
    const debouncedTailPosition = useDebouncedCallback(
        (value: number) => onChange({tail_position_pct: value}),
        300,
    );

    const writeBubbleConfig = (partial: Record<string, unknown>): void => {
        const prior = bubble.bubble_config ?? {};
        onChange({bubble_config: {...prior, ...partial}});
    };

    const [textDraft, setTextDraft] = useState(bubble.text_content ?? "");
    const debouncedTextChange = useDebouncedCallback(
        (value: string) => onChange({text_content: value}),
        300,
    );

    const anchorX = bubble.anchor?.x_pct ?? 0;
    const anchorY = bubble.anchor?.y_pct ?? 0;

    return (
        <div
            data-testid="layout-config-comic-bubble"
            style={{
                display: "flex",
                flexDirection: "column",
                gap: "14px",
                padding: "14px",
            }}
        >
            <CollapsibleConfigSection
                storageKey="bibliogon-collapsible-comic-bubble-config"
                heading={t( "ui.page_editor.config.comic_bubble.heading", "Sprechblase", )}
                testidPrefix="layout-config-comic-bubble"
            >

            {/* Bubble-type radio (6 canonical) */}
            <fieldset
                data-testid="comic-bubble-type-fieldset"
                style={{border: "none", margin: 0, padding: 0}}
            >
                <legend>
                    {t(
                        "ui.page_editor.config.comic_bubble.bubble_type",
                        "Blasentyp",
                    )}
                </legend>
                <div style={{display: "flex", flexWrap: "wrap", gap: "8px"}}>
                    {BUBBLE_TYPES.map((bt) => (
                        <label key={bt}>
                            <input
                                type="radio"
                                name="comic_bubble_type"
                                value={bt}
                                checked={bubble.bubble_type === bt}
                                onChange={() => onChange({bubble_type: bt})}
                                data-testid={`comic-bubble-type-${bt}`}
                            />{" "}
                            {t(
                                `ui.page_editor.config.comic_bubble.bubble_type_${bt}`,
                                bt,
                            )}
                        </label>
                    ))}
                </div>
            </fieldset>

            {/* Text content (plain text per Q2 a) */}
            <label>
                <span>
                    {t(
                        "ui.page_editor.config.comic_bubble.text_content",
                        "Text",
                    )}
                </span>
                <textarea
                    value={textDraft}
                    onChange={(e) => {
                        setTextDraft(e.target.value);
                        debouncedTextChange(e.target.value);
                    }}
                    data-testid="comic-bubble-text-content"
                    rows={3}
                    style={{width: "100%", boxSizing: "border-box"}}
                />
            </label>

            {/* Anchor x/y */}
            <label>
                <span>
                    {t(
                        "ui.page_editor.config.comic_bubble.anchor_x",
                        "Position X",
                    )}
                </span>
                <input
                    type="range"
                    className="slider"
                    min={ANCHOR_PCT_MIN}
                    max={ANCHOR_PCT_MAX}
                    step={ANCHOR_PCT_STEP}
                    value={anchorX}
                    onChange={(e) =>
                        debouncedAnchorX(parseInt(e.target.value, 10))
                    }
                    data-testid="comic-bubble-anchor-x-slider"
                />
                <span data-testid="comic-bubble-anchor-x-value">
                    {anchorX}%
                </span>
            </label>

            <label>
                <span>
                    {t(
                        "ui.page_editor.config.comic_bubble.anchor_y",
                        "Position Y",
                    )}
                </span>
                <input
                    type="range"
                    className="slider"
                    min={ANCHOR_PCT_MIN}
                    max={ANCHOR_PCT_MAX}
                    step={ANCHOR_PCT_STEP}
                    value={anchorY}
                    onChange={(e) =>
                        debouncedAnchorY(parseInt(e.target.value, 10))
                    }
                    data-testid="comic-bubble-anchor-y-slider"
                />
                <span data-testid="comic-bubble-anchor-y-value">
                    {anchorY}%
                </span>
            </label>

            {/* Width / Height */}
            <label>
                <span>
                    {t(
                        "ui.page_editor.config.comic_bubble.width",
                        "Breite",
                    )}
                </span>
                <input
                    type="range"
                    className="slider"
                    min={WIDTH_PCT_MIN}
                    max={WIDTH_PCT_MAX}
                    step={WIDTH_PCT_STEP}
                    value={bubble.width_pct}
                    onChange={(e) =>
                        debouncedWidth(parseInt(e.target.value, 10))
                    }
                    data-testid="comic-bubble-width-slider"
                />
                <span data-testid="comic-bubble-width-value">
                    {bubble.width_pct}%
                </span>
            </label>

            <label>
                <span>
                    {t(
                        "ui.page_editor.config.comic_bubble.height",
                        "Höhe",
                    )}
                </span>
                <input
                    type="range"
                    className="slider"
                    min={HEIGHT_PCT_MIN}
                    max={HEIGHT_PCT_MAX}
                    step={HEIGHT_PCT_STEP}
                    value={bubble.height_pct}
                    onChange={(e) =>
                        debouncedHeight(parseInt(e.target.value, 10))
                    }
                    data-testid="comic-bubble-height-slider"
                />
                <span data-testid="comic-bubble-height-value">
                    {bubble.height_pct}%
                </span>
            </label>

            {/* Tail direction radio (10 values) */}
            <fieldset
                data-testid="comic-bubble-tail-direction-fieldset"
                style={{border: "none", margin: 0, padding: 0}}
            >
                <legend>
                    {t(
                        "ui.page_editor.config.comic_bubble.tail_direction",
                        "Schwanzrichtung",
                    )}
                </legend>
                <div style={{display: "flex", flexWrap: "wrap", gap: "6px"}}>
                    {TAIL_DIRECTIONS.map((d) => (
                        <label key={d}>
                            <input
                                type="radio"
                                name="comic_bubble_tail_direction"
                                value={d}
                                checked={bubble.tail_direction === d}
                                onChange={() => onChange({tail_direction: d})}
                                data-testid={`comic-bubble-tail-direction-${d}`}
                            />{" "}
                            {t(
                                `ui.page_editor.config.comic_bubble.tail_direction_${d}`,
                                d,
                            )}
                        </label>
                    ))}
                </div>
            </fieldset>

            {/* Tail position + length (only meaningful when direction != none) */}
            <label>
                <span>
                    {t(
                        "ui.page_editor.config.comic_bubble.tail_position",
                        "Schwanzposition",
                    )}
                </span>
                <input
                    type="range"
                    className="slider"
                    min={TAIL_POSITION_MIN}
                    max={TAIL_POSITION_MAX}
                    step={TAIL_POSITION_STEP}
                    value={bubble.tail_position_pct}
                    disabled={bubble.tail_direction === "none"}
                    onChange={(e) =>
                        debouncedTailPosition(parseInt(e.target.value, 10))
                    }
                    data-testid="comic-bubble-tail-position-slider"
                />
                <span data-testid="comic-bubble-tail-position-value">
                    {bubble.tail_position_pct}%
                </span>
            </label>

            <label>
                <span>
                    {t(
                        "ui.page_editor.config.comic_bubble.tail_length",
                        "Schwanzlänge",
                    )}
                </span>
                <input
                    type="range"
                    className="slider"
                    min={TAIL_LENGTH_MIN}
                    max={TAIL_LENGTH_MAX}
                    step={TAIL_LENGTH_STEP}
                    value={bubble.tail_length_px}
                    disabled={bubble.tail_direction === "none"}
                    onChange={(e) =>
                        debouncedTailLength(parseInt(e.target.value, 10))
                    }
                    data-testid="comic-bubble-tail-length-slider"
                />
                <span data-testid="comic-bubble-tail-length-value">
                    {bubble.tail_length_px}px
                </span>
            </label>

            <Tier1Section
                config={bubble.bubble_config ?? null}
                onChange={writeBubbleConfig}
                testidPrefix="comic-bubble"
                i18nKeyPrefix="ui.page_editor.config.comic_bubble"
            />
            <Tier2Section
                config={bubble.bubble_config ?? null}
                onChange={writeBubbleConfig}
                testidPrefix="comic-bubble"
                i18nKeyPrefix="ui.page_editor.config.comic_bubble"
            />
        </CollapsibleConfigSection>
        </div>
    );
}

export default LayoutConfigComicBubble;
