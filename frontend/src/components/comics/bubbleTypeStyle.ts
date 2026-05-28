/**
 * Helper to pick the text-styling CSS-module class for a comic
 * ``bubble_type``.
 *
 * Approach A (2026-05-27 → 2026-05-28) moved shape rendering off
 * CSS classes onto a single SVG ``<path>`` per bubble. The only
 * remaining per-type CSS rule is ``sound_effect``'s
 * typography-as-illustration block in ``bubble-types.module.css``;
 * the other five types render their text with the bubble's
 * default typography and return an empty class.
 */

import styles from "./bubble-types.module.css";

export type BubbleType =
    | "speech"
    | "thought"
    | "narration"
    | "shout"
    | "whisper"
    | "sound_effect";

/** Returns the CSS-module class for the given bubble_type, or an
 *  empty string when no text-styling CSS applies. */
export function bubbleTypeClassName(bubbleType: string): string {
    return bubbleType === "sound_effect" ? (styles.soundEffect ?? "") : "";
}
