/**
 * Settings > Data > Wartung (maintenance) card.
 *
 * Extracted from DataManagementSettings so the diagnostic-log + image-cache
 * "show what will be deleted BEFORE clearing" previews live in their own
 * cohesive unit. Two collapsible previews:
 *
 * - **Event log:** the last 100 recorded diagnostic events (timestamp +
 *   formatted summary) in a scrollable `<pre>`, with copy-to-clipboard and
 *   download-as-JSON for bug reports, then the clear button.
 * - **Image cache:** the cached image filenames + per-file size and the
 *   total (names only, the bytes are never rendered), then the clear button.
 *
 * The actual wipes are delegated to the parent's confirmed handlers
 * (`onClearEventLog` / `onClearImageCache`).
 */

import { useState } from "react";
import { Trash2, Image as ImageIcon, Eye, Copy, FileDown } from "lucide-react";

import {
    readEventLog,
    listImageCache,
    formatBytes,
    type ImageCacheListing,
} from "../../storage/storageStats";
import { formatEventLog, type RecordedEvent } from "../../utils/eventRecorder/eventRecorder";
import { downloadText } from "../../export/download";
import { notify } from "../../utils/notify";

type Translate = (key: string, fallback: string) => string;

interface Props {
    t: Translate;
    busy: boolean;
    onClearEventLog: () => void;
    onClearImageCache: () => void;
    cardClass: string;
    cardTitleClass: string;
    cardDescClass: string;
}

export default function DataMaintenanceCard({
    t,
    busy,
    onClearEventLog,
    onClearImageCache,
    cardClass,
    cardTitleClass,
    cardDescClass,
}: Props) {
    const [events, setEvents] = useState<RecordedEvent[] | null>(null);
    const [cache, setCache] = useState<ImageCacheListing | null>(null);

    const handleShowEvents = async () => {
        setEvents(await readEventLog(100));
    };

    const handleCopyEvents = async () => {
        const text = formatEventLog(events ?? []);
        try {
            await navigator.clipboard.writeText(text);
            notify.success(t("ui.data.event_log_copied", "Event-Log kopiert"));
        } catch {
            notify.error(
                t("ui.data.event_log_copy_error", "Kopieren fehlgeschlagen"),
            );
        }
    };

    const handleDownloadEvents = () => {
        downloadText(
            JSON.stringify(events ?? [], null, 2),
            "bibliogon-event-log.json",
            "application/json",
        );
    };

    const handleShowImages = async () => {
        setCache(await listImageCache());
    };

    return (
        <div className={cardClass} data-testid="data-maintenance-section">
            <h3 className={cardTitleClass}>
                {t("ui.data.maintenance_title", "Wartung")}
            </h3>
            <p className={cardDescClass}>
                {t(
                    "ui.data.maintenance_description",
                    "Lokale Hilfsdaten aufräumen. Bücher, Artikel und Kapitel bleiben unberührt.",
                )}
            </p>

            {/* --- Event log: show, then clear --- */}
            <section className="mb-4" data-testid="data-event-log-block">
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm min-h-[44px]"
                        style={{ gap: 6 }}
                        onClick={handleShowEvents}
                        data-testid="data-show-event-log"
                    >
                        <Eye size={14} />
                        {t("ui.data.show_event_log", "Event-Log anzeigen")}
                    </button>
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm min-h-[44px]"
                        style={{ gap: 6 }}
                        onClick={onClearEventLog}
                        disabled={busy}
                        data-testid="data-clear-event-log"
                    >
                        <Trash2 size={14} />
                        {t("ui.data.clear_event_log", "Event-Log leeren")}
                    </button>
                </div>
                {events !== null && (
                    <div className="mt-2" data-testid="data-event-log-preview">
                        <p
                            className="mb-1 text-xs"
                            style={{ color: "var(--text-muted)" }}
                        >
                            {t(
                                "ui.data.event_log_warning",
                                "Dieser Log kann groß sein.",
                            )}{" "}
                            {events.length}{" "}
                            {t("ui.data.event_log_count", "Einträge")}
                        </p>
                        {events.length > 0 ? (
                            <>
                                <div className="mb-2 flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        className="btn btn-ghost btn-sm min-h-[44px]"
                                        style={{ gap: 6 }}
                                        onClick={handleCopyEvents}
                                        data-testid="data-event-log-copy"
                                    >
                                        <Copy size={14} />
                                        {t("ui.data.copy_clipboard", "In die Zwischenablage kopieren")}
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-ghost btn-sm min-h-[44px]"
                                        style={{ gap: 6 }}
                                        onClick={handleDownloadEvents}
                                        data-testid="data-event-log-download"
                                    >
                                        <FileDown size={14} />
                                        {t("ui.data.download_json", "Als JSON herunterladen")}
                                    </button>
                                </div>
                                <pre
                                    className="max-h-60 overflow-auto rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-secondary)] p-2 text-xs"
                                    data-testid="data-event-log-text"
                                >
                                    {formatEventLog(events)}
                                </pre>
                            </>
                        ) : (
                            <p
                                className="text-xs"
                                style={{ color: "var(--text-muted)" }}
                                data-testid="data-event-log-empty"
                            >
                                {t("ui.data.event_log_empty", "Keine Einträge.")}
                            </p>
                        )}
                    </div>
                )}
            </section>

            {/* --- Image cache: show, then clear --- */}
            <section data-testid="data-image-cache-block">
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm min-h-[44px]"
                        style={{ gap: 6 }}
                        onClick={handleShowImages}
                        data-testid="data-show-image-cache"
                    >
                        <Eye size={14} />
                        {t("ui.data.show_image_cache", "Bilder anzeigen")}
                    </button>
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm min-h-[44px]"
                        style={{ gap: 6 }}
                        onClick={onClearImageCache}
                        disabled={busy}
                        data-testid="data-clear-image-cache"
                    >
                        <ImageIcon size={14} />
                        {t("ui.data.clear_image_cache", "Bild-Cache leeren")}
                    </button>
                </div>
                {cache !== null && (
                    <div className="mt-2" data-testid="data-image-cache-preview">
                        <p
                            className="mb-1 text-xs"
                            style={{ color: "var(--text-muted)" }}
                        >
                            {cache.count}{" "}
                            {t("ui.data.image_cache_count", "Bilder")} ·{" "}
                            {formatBytes(cache.totalBytes)}
                        </p>
                        {cache.count > 0 ? (
                            <ul
                                className="max-h-60 list-none overflow-auto rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-secondary)] p-0 text-xs"
                                data-testid="data-image-cache-list"
                            >
                                {cache.entries.map((entry, i) => (
                                    <li
                                        key={`${entry.scope}-${entry.name}-${i}`}
                                        className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-2 py-1 last:border-b-0"
                                    >
                                        <span className="truncate">{entry.name}</span>
                                        <span style={{ color: "var(--text-muted)" }}>
                                            {formatBytes(entry.sizeBytes)}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p
                                className="text-xs"
                                style={{ color: "var(--text-muted)" }}
                                data-testid="data-image-cache-empty"
                            >
                                {t("ui.data.image_cache_empty", "Keine Bilder im Cache.")}
                            </p>
                        )}
                    </div>
                )}
            </section>
        </div>
    );
}
