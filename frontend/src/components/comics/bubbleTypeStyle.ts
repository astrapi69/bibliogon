/**
 * Helper to pick the CSS-module class for a comic bubble_type.
 *
 * Comics-Session-2 C4 (plugin-comics). Mirrors the walker's
 * ``_bubble_type_style`` gamma-shim default-on-read: unknown
 * values fall back to ``speech`` (the canonical default).
 */

import styles from "./bubble-types.module.css";

export type BubbleType =
    | "speech"
    | "thought"
    | "narration"
    | "shout"
    | "whisper"
    | "sound_effect";

const BUBBLE_TYPE_CLASS: Record<BubbleType, string> = {
    speech: styles.speech,
    thought: styles.thought,
    narration: styles.narration,
    shout: styles.shout,
    whisper: styles.whisper,
    sound_effect: styles.soundEffect,
};

export function bubbleTypeClassName(bubbleType: string): string {
    const key = bubbleType as BubbleType;
    return BUBBLE_TYPE_CLASS[key] ?? styles.speech;
}

export const BUBBLE_BASE_CLASS = styles.bubble;
