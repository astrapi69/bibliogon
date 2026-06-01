/** Shared storyboard annotation editors (STORY-BIBLE-STORYBOARD-
 *  INTEGRATION-01 C3).
 *
 *  Four inline auto-save editors for the four storyboard annotation
 *  fields (story_beat / mood_color / act_group / notes). Extracted
 *  from Storyboard.tsx per the Recurring-Component-Unification Rule:
 *  the picture/comic page Storyboard (StoryboardCard) AND the prose
 *  chapter Storyboard (ProseStoryboard ChapterCard) are two surfaces
 *  that edit the SAME four fields with the SAME UX. The editors are
 *  generic over the entity (page or chapter) — they take the current
 *  persisted ``value`` + an ``onSave`` callback that performs the
 *  PATCH, plus a ``namespace`` + ``idSuffix`` pair so each surface
 *  keeps its own stable data-testid scheme.
 *
 *  All four share the ``Storyboard.module.css`` classes so the two
 *  surfaces look identical (CSS-first discipline). ``stopPropagation``
 *  on click / mousedown / keydown keeps interactions on the controls
 *  from bubbling into a draggable card. */
import React, {useEffect, useState} from "react"
import {X} from "lucide-react"

import type {StoryBeat} from "../api/client"
import {useI18n} from "../hooks/useI18n"
import {RadixSelect} from "./RadixSelect"
import styles from "./Storyboard.module.css"

/** 6 story-beat values per PICTURE-BOOK-STORYBOARD-VIEW-01 A2 (Setup /
 *  Inciting / Rising / Climax / Falling / Resolution). The order
 *  follows the canonical dramatic-structure arc, not alphabetical. */
export const STORY_BEATS: readonly StoryBeat[] = [
    "setup",
    "inciting",
    "rising",
    "climax",
    "falling",
    "resolution",
] as const

/** Mood-color preset palette (PICTURE-BOOK-STORYBOARD-VIEW-01 Session 2
 *  C3). 10 curated colors; ``value`` is the hex code that round-trips
 *  into mood_color (MOOD_COLOR_RE-validated), ``key`` is the i18n key
 *  segment for the localised label. */
export const MOOD_PALETTE: readonly {value: string; key: string}[] = [
    {value: "#FFC857", key: "sunny"},
    {value: "#FF6B6B", key: "passionate"},
    {value: "#4ECDC4", key: "calm"},
    {value: "#C7B8EA", key: "dreamy"},
    {value: "#7FB069", key: "peaceful"},
    {value: "#F18A07", key: "adventurous"},
    {value: "#F4A6CD", key: "tender"},
    {value: "#6C7A89", key: "somber"},
    {value: "#2E4057", key: "mysterious"},
    {value: "#F4ECD8", key: "gentle"},
] as const

interface AnnotationIds {
    /** testid prefix shared with the card (e.g. "storyboard" or
     *  "prose-storyboard"). */
    namespace: string
    /** the page or chapter id, appended to each control's testid. */
    idSuffix: string
}

const stop = (e: React.SyntheticEvent) => {
    e.stopPropagation()
}

/** Beat dropdown. 6 dramatic-structure values + an empty "no beat"
 *  option for clearing. Uses the canonical RadixSelect. */
export function BeatSelect({
    value,
    onSave,
    namespace,
    idSuffix,
}: {value: string | null; onSave: (beat: StoryBeat | null) => void} & AnnotationIds) {
    const {t} = useI18n()
    const current = value ?? ""

    const handleValueChange = (next: string) => {
        const normalised: StoryBeat | null = next === "" ? null : (next as StoryBeat)
        if (normalised === (value ?? null)) return
        onSave(normalised)
    }

    return (
        <span className={styles.beatSelect} onClick={stop} onMouseDown={stop} onKeyDown={stop}>
            <RadixSelect
                className="is-narrow"
                value={current}
                onValueChange={handleValueChange}
                testId={`${namespace}-beat-select-${idSuffix}`}
                ariaLabel={t("ui.storyboard.beat_label", "Story beat")}
                allOption={{label: t("ui.storyboard.beat_none", "— no beat —")}}
                options={STORY_BEATS.map((beat) => ({
                    value: beat,
                    label: t(`ui.storyboard.beat.${beat}`, beat),
                }))}
            />
        </span>
    )
}

/** Preset mood-color swatches. Clicking a swatch sets it; clicking the
 *  selected swatch clears it (toggle). Drives the card's left border. */
export function MoodColorPicker({
    value,
    onSave,
    namespace,
    idSuffix,
}: {value: string | null; onSave: (color: string | null) => void} & AnnotationIds) {
    const {t} = useI18n()
    const current = value ?? null

    const setColor = (next: string | null) => {
        if (next === current) return
        onSave(next)
    }

    return (
        <div
            className={styles.moodPalette}
            data-testid={`${namespace}-mood-palette-${idSuffix}`}
            onClick={stop}
            onMouseDown={stop}
            onKeyDown={stop}
            role="group"
            aria-label={t("ui.storyboard.mood_label", "Mood color")}
        >
            {MOOD_PALETTE.map(({value: hex, key}) => {
                const selected = current?.toUpperCase() === hex.toUpperCase()
                const label = t(`ui.storyboard.mood.${key}`, key)
                return (
                    <button
                        key={hex}
                        type="button"
                        className={[styles.moodSwatch, selected ? styles.moodSwatchSelected : ""]
                            .filter(Boolean)
                            .join(" ")}
                        style={{backgroundColor: hex}}
                        onClick={(e) => {
                            stop(e)
                            setColor(selected ? null : hex)
                        }}
                        data-testid={`${namespace}-mood-swatch-${key}-${idSuffix}`}
                        data-selected={selected ? "true" : "false"}
                        title={label}
                        aria-label={label}
                        aria-pressed={selected ? "true" : "false"}
                    />
                )
            })}
            {current && (
                <button
                    type="button"
                    className={styles.moodClear}
                    onClick={(e) => {
                        stop(e)
                        setColor(null)
                    }}
                    data-testid={`${namespace}-mood-clear-${idSuffix}`}
                    title={t("ui.storyboard.mood_clear", "Clear color")}
                    aria-label={t("ui.storyboard.mood_clear", "Clear color")}
                >
                    <X size={10} aria-hidden />
                </button>
            )}
        </div>
    )
}

/** Inline editable act-group label. Drives the grouping headers in the
 *  storyboard grid. Empty normalises to null. */
export function ActGroupInput({
    value,
    onSave,
    namespace,
    idSuffix,
}: {value: string | null; onSave: (label: string | null) => void} & AnnotationIds) {
    const {t} = useI18n()
    const [local, setLocal] = useState<string>(value ?? "")

    useEffect(() => {
        setLocal(value ?? "")
    }, [idSuffix, value])

    const handleBlur = () => {
        const normalised = local.trim() === "" ? null : local.trim()
        if (normalised === (value ?? null)) return
        onSave(normalised)
    }

    return (
        <input
            type="text"
            className={styles.actGroupInput}
            value={local}
            placeholder={t("ui.storyboard.act_group_placeholder", "Act / chapter (optional)")}
            onChange={(e) => setLocal(e.target.value)}
            onBlur={handleBlur}
            onClick={stop}
            onMouseDown={stop}
            onKeyDown={(e) => {
                stop(e)
                if (e.key === "Enter") {
                    e.preventDefault()
                    ;(e.target as HTMLInputElement).blur()
                }
            }}
            data-testid={`${namespace}-act-group-${idSuffix}`}
            aria-label={t("ui.storyboard.act_group_label", "Act group")}
            maxLength={100}
        />
    )
}

/** Auto-saving notes textarea. Local state mirrors the value; onBlur
 *  fires onSave only when changed. Empty normalises to null. */
export function NotesEditor({
    value,
    onSave,
    namespace,
    idSuffix,
    ariaLabel,
}: {
    value: string | null
    onSave: (notes: string | null) => void
    ariaLabel?: string
} & AnnotationIds) {
    const {t} = useI18n()
    const [local, setLocal] = useState<string>(value ?? "")

    useEffect(() => {
        setLocal(value ?? "")
    }, [idSuffix, value])

    const handleBlur = () => {
        const normalised = local.trim() === "" ? null : local
        if (normalised === (value ?? null)) return
        onSave(normalised)
    }

    return (
        <textarea
            className={styles.notesEditor}
            value={local}
            placeholder={t("ui.storyboard.notes_placeholder", "Add notes...")}
            onChange={(e) => setLocal(e.target.value)}
            onBlur={handleBlur}
            onClick={stop}
            onMouseDown={stop}
            onKeyDown={stop}
            data-testid={`${namespace}-notes-${idSuffix}`}
            aria-label={ariaLabel ?? t("ui.storyboard.notes_label", "Page notes")}
            rows={2}
        />
    )
}
