/** Inline per-book chapter-label manager (CHAPTER-STATUS-LABELS-01).
 *
 *  An inline panel (not a modal — the storyboard is already a full
 *  surface) for the full label lifecycle: list existing labels with
 *  rename + recolor + delete, plus an add row. Colors come from the
 *  shared 10-preset mood palette (consistent with the storyboard, no
 *  free-hex picker dependency). Every mutation refetches via onChanged
 *  so the cards' label selects/chips stay in sync. */
import {useState} from "react"
import {Plus, Trash2} from "lucide-react"

import {type ChapterLabel} from "../api/client"
import {getStorage} from "../storage"
import {useI18n} from "../hooks/useI18n"
import {notify} from "../utils/notify"
import {MOOD_PALETTE} from "./StoryboardAnnotations"
import styles from "./ChapterStatusLabel.module.css"

const DEFAULT_COLOR = MOOD_PALETTE[0].value

function SwatchRow({
    value,
    onPick,
    testid,
}: {value: string; onPick: (hex: string) => void; testid: string}) {
    const {t} = useI18n()
    return (
        <span className={styles.swatchRow} data-testid={testid}>
            {MOOD_PALETTE.map(({value: hex, key}) => {
                const selected = value.toUpperCase() === hex.toUpperCase()
                return (
                    <button
                        key={hex}
                        type="button"
                        className={`${styles.swatch} ${selected ? styles.swatchSelected : ""}`}
                        style={{background: hex}}
                        onClick={() => onPick(hex)}
                        aria-label={t(`ui.storyboard.mood.${key}`, key)}
                        aria-pressed={selected ? "true" : "false"}
                        title={t(`ui.storyboard.mood.${key}`, key)}
                    />
                )
            })}
        </span>
    )
}

export default function ChapterLabelManager({
    bookId,
    labels,
    onChanged,
    namespace = "chapter-labels",
}: {
    bookId: string
    labels: ChapterLabel[]
    onChanged: () => void
    namespace?: string
}) {
    const {t} = useI18n()
    const [newName, setNewName] = useState("")
    const [newColor, setNewColor] = useState<string>(DEFAULT_COLOR)
    const [busy, setBusy] = useState(false)

    const run = async (fn: () => Promise<unknown>) => {
        setBusy(true)
        try {
            await fn()
            onChanged()
        } catch (err: unknown) {
            notify.error(t("ui.chapter_label.save_failed", "Could not save label"), err)
        } finally {
            setBusy(false)
        }
    }

    const handleAdd = () => {
        const name = newName.trim()
        if (!name) return
        void run(async () => {
            await getStorage().chapterLabels.create(bookId, {name, color: newColor})
            setNewName("")
            setNewColor(DEFAULT_COLOR)
        })
    }

    return (
        <div className={styles.manager} data-testid={`${namespace}-manager`}>
            {labels.map((label) => (
                <div className={styles.managerRow} key={label.id} data-testid={`${namespace}-row-${label.id}`}>
                    <input
                        type="text"
                        className={`input ${styles.managerName}`}
                        defaultValue={label.name}
                        maxLength={100}
                        aria-label={t("ui.chapter_label.name", "Label name")}
                        data-testid={`${namespace}-name-${label.id}`}
                        onBlur={(e) => {
                            const name = e.target.value.trim()
                            if (!name || name === label.name) return
                            void run(() => getStorage().chapterLabels.update(bookId, label.id, {name}))
                        }}
                    />
                    <SwatchRow
                        value={label.color}
                        onPick={(hex) => {
                            if (hex === label.color) return
                            void run(() => getStorage().chapterLabels.update(bookId, label.id, {color: hex}))
                        }}
                        testid={`${namespace}-swatches-${label.id}`}
                    />
                    <button
                        type="button"
                        className="btn-icon"
                        disabled={busy}
                        onClick={() => void run(() => getStorage().chapterLabels.remove(bookId, label.id))}
                        aria-label={t("ui.chapter_label.delete", "Delete label")}
                        title={t("ui.chapter_label.delete", "Delete label")}
                        data-testid={`${namespace}-delete-${label.id}`}
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            ))}

            <div className={styles.managerRow} data-testid={`${namespace}-add-row`}>
                <input
                    type="text"
                    className={`input ${styles.managerName}`}
                    value={newName}
                    maxLength={100}
                    placeholder={t("ui.chapter_label.new_placeholder", "New label name")}
                    aria-label={t("ui.chapter_label.new_placeholder", "New label name")}
                    data-testid={`${namespace}-new-name`}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault()
                            handleAdd()
                        }
                    }}
                />
                <SwatchRow value={newColor} onPick={setNewColor} testid={`${namespace}-new-swatches`} />
                <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    disabled={busy || !newName.trim()}
                    onClick={handleAdd}
                    data-testid={`${namespace}-add`}
                >
                    <Plus size={14} /> {t("ui.chapter_label.add", "Add")}
                </button>
            </div>
        </div>
    )
}
