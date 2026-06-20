/** Per-chapter status + label controls (CHAPTER-STATUS-LABELS-01).
 *
 *  Chapter-only (pages have no status/label), so these live outside the
 *  shared StoryboardAnnotations module — they are imported by the prose
 *  ChapterCard only. The selects mirror BeatSelect's RadixSelect shape
 *  for visual consistency; the chips render in the card meta row.
 *
 *  Status colors are semantic theme tokens (CSS module, audited by
 *  verify-theme). Label colors are user data applied inline (the
 *  data-color exemption, same class as the mood palette). */
import React from "react"

import type {ChapterLabel, ChapterStatus} from "../../api/client"
import {useI18n} from "../../hooks/useI18n"
import {RadixSelect} from "../shared/RadixSelect"
import styles from "../ChapterStatusLabel.module.css"

/** Canonical status order (matches the backend ChapterStatus Literal):
 *  the drafting arc, not alphabetical. */
export const CHAPTER_STATUSES: readonly ChapterStatus[] = [
    "todo",
    "first_draft",
    "revised",
    "final",
] as const

const STATUS_DOT_CLASS: Record<ChapterStatus, string> = {
    todo: styles.dotTodo,
    first_draft: styles.dotFirstDraft,
    revised: styles.dotRevised,
    final: styles.dotFinal,
}

const stop = (e: React.SyntheticEvent) => e.stopPropagation()

/** Pick a readable (black/white) text color for a label-color
 *  background via relative luminance. Pure data math, no theme token. */
export function readableTextColor(hex: string): string {
    const m = /^#([0-9a-fA-F]{6})$/.exec(hex)
    if (!m) return "#000000"
    const n = parseInt(m[1], 16)
    const r = (n >> 16) & 0xff
    const g = (n >> 8) & 0xff
    const b = n & 0xff
    // Perceived luminance (sRGB coefficients).
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return luminance > 0.6 ? "#1a1a1a" : "#ffffff"
}

interface StatusLabelIds {
    namespace: string
    idSuffix: string
}

/** Status dropdown: 4 drafting values + a "no status" clear option. */
export function StatusSelect({
    value,
    onSave,
    namespace,
    idSuffix,
}: {value: string | null; onSave: (status: ChapterStatus | null) => void} & StatusLabelIds) {
    const {t} = useI18n()
    const current = value ?? ""

    const handleValueChange = (next: string) => {
        const normalised: ChapterStatus | null = next === "" ? null : (next as ChapterStatus)
        if (normalised === (value ?? null)) return
        onSave(normalised)
    }

    return (
        <span onClick={stop} onMouseDown={stop} onKeyDown={stop}>
            <RadixSelect
                className="is-narrow"
                value={current}
                onValueChange={handleValueChange}
                testId={`${namespace}-status-select-${idSuffix}`}
                ariaLabel={t("ui.chapter_status.label", "Status")}
                allOption={{label: t("ui.chapter_status.none", "— no status —")}}
                options={CHAPTER_STATUSES.map((s) => ({
                    value: s,
                    label: t(`ui.chapter_status.${s}`, s),
                }))}
            />
        </span>
    )
}

/** Label dropdown over the book's chapter labels + a "no label" clear. */
export function LabelSelect({
    value,
    labels,
    onSave,
    namespace,
    idSuffix,
}: {
    value: string | null
    labels: ChapterLabel[]
    onSave: (labelId: string | null) => void
} & StatusLabelIds) {
    const {t} = useI18n()
    const current = value ?? ""

    const handleValueChange = (next: string) => {
        const normalised = next === "" ? null : next
        if (normalised === (value ?? null)) return
        onSave(normalised)
    }

    return (
        <span onClick={stop} onMouseDown={stop} onKeyDown={stop}>
            <RadixSelect
                className="is-narrow"
                value={current}
                onValueChange={handleValueChange}
                testId={`${namespace}-label-select-${idSuffix}`}
                ariaLabel={t("ui.chapter_label.label", "Label")}
                allOption={{label: t("ui.chapter_label.none", "— no label —")}}
                options={labels.map((lbl) => ({value: lbl.id, label: lbl.name}))}
            />
        </span>
    )
}

/** Small colored chip for the card meta row. */
export function StatusChip({status, namespace, idSuffix}: {status: ChapterStatus} & StatusLabelIds) {
    const {t} = useI18n()
    return (
        <span
            className={styles.statusChip}
            data-testid={`${namespace}-status-chip-${idSuffix}`}
            data-status={status}
        >
            <span className={`${styles.statusDot} ${STATUS_DOT_CLASS[status]}`} aria-hidden />
            {t(`ui.chapter_status.${status}`, status)}
        </span>
    )
}

export function LabelChip({label, namespace, idSuffix}: {label: ChapterLabel} & StatusLabelIds) {
    return (
        <span
            className={styles.labelChip}
            style={{background: label.color, color: readableTextColor(label.color)}}
            data-testid={`${namespace}-label-chip-${idSuffix}`}
        >
            {label.name}
        </span>
    )
}
