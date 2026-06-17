/**
 * AI Story Bible / Storyboard extraction button + preview dialog (#374).
 *
 * One component drives both surfaces via the `target` prop: the Story Bible
 * sidebar (`target="story-bible"`) and the prose Storyboard
 * (`target="storyboard"`). Clicking the trigger runs the AI extraction with a
 * per-request progress indicator, then opens a checklist the user reviews
 * before anything is persisted. Existing Story Bible entries are shown but
 * locked (augment, never overwrite). The feature gate (`AI_STORY_EXTRACTION`)
 * disables the trigger offline or without a configured AI key, with the
 * matching reason as a tooltip.
 */

import {useState} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {Loader2, Wand2, X} from "lucide-react";
import {useFeature} from "@astrapi69/feature-strategy-react";

import {useI18n} from "../hooks/useI18n";
import {notify} from "../utils/notify";
import {FEATURES} from "../features/featureConfig";
import {
    AiClientError,
    StoryExtractionError,
    applyStoryBible,
    applyStoryboard,
    extractStoryBible,
    extractStoryboard,
    type Extraction,
    type ExtractionTarget,
} from "../ai/storyExtraction";

interface Props {
    bookId: string;
    target: ExtractionTarget;
    /** Called after proposals are persisted, so the host can reload its data. */
    onApplied: () => void;
    /** Trigger button styling (matches the host surface). */
    triggerClassName?: string;
    /** Visible label; when omitted the trigger is icon-only (sidebar header). */
    triggerLabel?: string;
}

export default function AiStoryExtraction({
    bookId,
    target,
    onApplied,
    triggerClassName = "btn btn-secondary btn-sm",
    triggerLabel,
}: Props) {
    const {t} = useI18n();
    const feature = useFeature(FEATURES.AI_STORY_EXTRACTION);
    const [open, setOpen] = useState(false);
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState<{current: number; total: number} | null>(null);
    const [extraction, setExtraction] = useState<Extraction | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [applying, setApplying] = useState(false);

    const buttonLabel =
        triggerLabel ??
        (target === "story-bible"
            ? t("ui.ai_extraction.story_bible_button", "Aus Buchtext generieren")
            : t("ui.ai_extraction.storyboard_button", "Aus Buchtext generieren"));

    const disabledReason = feature.isDisabled
        ? t(feature.reason ?? "ui.feature.requires_ai_key", "AI is unavailable")
        : undefined;

    const errorMessage = (err: unknown): string => {
        if (err instanceof StoryExtractionError) {
            return t(`ui.ai_extraction.error.${err.code}`, "Generierung fehlgeschlagen.");
        }
        if (err instanceof AiClientError) return err.message;
        return t("ui.ai_extraction.error.generic", "Generierung fehlgeschlagen.");
    };

    const handleStart = async (): Promise<void> => {
        setOpen(true);
        setRunning(true);
        setExtraction(null);
        setProgress(null);
        const onProgress = (current: number, total: number): void => setProgress({current, total});
        try {
            const result =
                target === "story-bible"
                    ? await extractStoryBible(bookId, {onProgress})
                    : await extractStoryboard(bookId, {onProgress});
            setExtraction(result);
            setSelected(
                new Set(result.items.filter((item) => !item.existing).map((item) => item.key)),
            );
        } catch (err) {
            notify.error(errorMessage(err), err);
            setOpen(false);
        } finally {
            setRunning(false);
            setProgress(null);
        }
    };

    const toggle = (key: string): void => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const persist = async (keys: Set<string>): Promise<void> => {
        if (!extraction) return;
        setApplying(true);
        try {
            const count =
                extraction.kind === "story-bible"
                    ? await applyStoryBible(bookId, extraction, keys)
                    : await applyStoryboard(bookId, extraction, keys);
            notify.success(
                count > 0
                    ? t("ui.ai_extraction.applied", "{count} Einträge übernommen.").replace(
                          "{count}",
                          String(count),
                      )
                    : t("ui.ai_extraction.applied_none", "Nichts übernommen."),
            );
            onApplied();
            setOpen(false);
            setExtraction(null);
        } catch (err) {
            notify.error(errorMessage(err), err);
        } finally {
            setApplying(false);
        }
    };

    const applyAllKeys = (): Set<string> =>
        new Set((extraction?.items ?? []).filter((item) => !item.existing).map((item) => item.key));

    const title =
        target === "story-bible"
            ? t("ui.ai_extraction.title.story_bible", "Story-Bibel aus Buchtext")
            : t("ui.ai_extraction.title.storyboard", "Storyboard aus Buchtext");

    return (
        <>
            <button
                type="button"
                className={triggerClassName}
                onClick={() => void handleStart()}
                disabled={feature.isDisabled || running || applying}
                title={disabledReason ?? buttonLabel}
                aria-label={buttonLabel}
                data-testid="ai-story-extraction-trigger"
            >
                <Wand2 size={16} />
                {triggerLabel !== undefined && <span>{buttonLabel}</span>}
            </button>

            <Dialog.Root
                open={open}
                onOpenChange={(next) => {
                    if (!next && !applying && !running) {
                        setOpen(false);
                        setExtraction(null);
                    }
                }}
            >
                <Dialog.Portal>
                    <Dialog.Overlay className="dialog-overlay" />
                    <Dialog.Content
                        className="dialog-content dialog-content-wide"
                        data-testid="ai-story-extraction-dialog"
                        onEscapeKeyDown={(event) => (applying || running) && event.preventDefault()}
                    >
                        <div className="dialog-header">
                            <Dialog.Title className="dialog-title">{title}</Dialog.Title>
                            <Dialog.Close asChild>
                                <button
                                    type="button"
                                    className="btn-icon"
                                    onClick={() => {
                                        if (!applying && !running) {
                                            setOpen(false);
                                            setExtraction(null);
                                        }
                                    }}
                                    aria-label={t("ui.common.close", "Schließen")}
                                    disabled={applying || running}
                                >
                                    <X size={16} />
                                </button>
                            </Dialog.Close>
                        </div>
                        <Dialog.Description className="dialog-message">
                            {t(
                                "ui.ai_extraction.description",
                                "Die KI analysiert den Buchtext. Prüfe die Vorschläge, bevor du sie übernimmst.",
                            )}
                        </Dialog.Description>

                        {running && (
                            <div
                                className="mt-3 flex items-center justify-center gap-2 p-4 text-muted-foreground"
                                data-testid="ai-story-extraction-progress"
                            >
                                <Loader2 size={16} className="spin" />
                                <span>
                                    {progress
                                        ? t(
                                              "ui.ai_extraction.progress",
                                              "Analysiere Kapitel {current}/{total}…",
                                          )
                                              .replace("{current}", String(progress.current))
                                              .replace("{total}", String(progress.total))
                                        : t(
                                              "ui.ai_extraction.analyzing",
                                              "Buchtext wird analysiert…",
                                          )}
                                </span>
                            </div>
                        )}

                        {!running && extraction && extraction.items.length === 0 && (
                            <div
                                className="mt-3 p-4 text-center text-muted-foreground"
                                data-testid="ai-story-extraction-empty"
                            >
                                {t("ui.ai_extraction.empty", "Keine Vorschläge gefunden.")}
                            </div>
                        )}

                        {!running && extraction && extraction.items.length > 0 && (
                            <>
                                <ul
                                    className="mt-3 flex max-h-[50vh] flex-col gap-1 overflow-y-auto"
                                    data-testid="ai-story-extraction-list"
                                >
                                    {extraction.items.map((item) => (
                                        <li
                                            key={item.key}
                                            className="flex items-start gap-2 rounded-md p-2 hover:bg-secondary"
                                            data-testid={`ai-story-extraction-item-${item.key}`}
                                        >
                                            <input
                                                type="checkbox"
                                                className="mt-1"
                                                checked={selected.has(item.key)}
                                                disabled={item.existing}
                                                onChange={() => toggle(item.key)}
                                                aria-label={item.title}
                                                data-testid={`ai-story-extraction-checkbox-${item.key}`}
                                            />
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">
                                                        {t(item.badgeKey, item.badgeKey)}
                                                    </span>
                                                    <span className="truncate font-medium">
                                                        {item.title}
                                                    </span>
                                                    {item.existing && (
                                                        <span className="text-xs text-muted-foreground">
                                                            {t(
                                                                "ui.ai_extraction.existing_hint",
                                                                "Bereits vorhanden",
                                                            )}
                                                        </span>
                                                    )}
                                                </div>
                                                {item.detail && (
                                                    <p className="mt-0.5 text-sm text-muted-foreground">
                                                        {item.detail}
                                                    </p>
                                                )}
                                            </div>
                                        </li>
                                    ))}
                                </ul>

                                {extraction.notes.length > 0 && (
                                    <div className="mt-3" data-testid="ai-story-extraction-notes">
                                        <h3 className="text-sm font-medium">
                                            {t("ui.ai_extraction.notes_title", "Hinweise")}
                                        </h3>
                                        <ul className="mt-1 flex flex-col gap-1 text-sm text-muted-foreground">
                                            {extraction.notes.map((note, idx) => (
                                                <li key={idx}>{note}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                <div className="dialog-footer mt-4 flex justify-end gap-2">
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={() => {
                                            setOpen(false);
                                            setExtraction(null);
                                        }}
                                        disabled={applying}
                                        data-testid="ai-story-extraction-cancel"
                                    >
                                        {t("ui.ai_extraction.cancel", "Abbrechen")}
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={() => void persist(applyAllKeys())}
                                        disabled={applying}
                                        data-testid="ai-story-extraction-apply-all"
                                    >
                                        {t("ui.ai_extraction.apply_all", "Alle übernehmen")}
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        onClick={() => void persist(selected)}
                                        disabled={applying || selected.size === 0}
                                        data-testid="ai-story-extraction-apply"
                                    >
                                        {applying && <Loader2 size={14} className="spin" />}
                                        {t(
                                            "ui.ai_extraction.apply_selected",
                                            "Ausgewählte übernehmen",
                                        )}
                                    </button>
                                </div>
                            </>
                        )}
                    </Dialog.Content>
                </Dialog.Portal>
            </Dialog.Root>
        </>
    );
}
