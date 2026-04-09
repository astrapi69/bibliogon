import {useEffect, useMemo, useRef, useState} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {AlertCircle, CheckCircle, Download, Loader, Minimize2, X} from "lucide-react";

import {ApiError, api} from "../api/client";
import {useI18n} from "../hooks/useI18n";
import {notify} from "../utils/notify";

interface Props {
    jobId: string;
    bookTitle: string;
    /** Closes the dialog and clears the active job from context. */
    onClose: () => void;
    /** Hides the dialog but keeps the job tracked (badge takes over). */
    onMinimize: () => void;
}

type EventType =
    | "start"
    | "chapter_start"
    | "chapter_done"
    | "chapter_skipped"
    | "chapter_error"
    | "merge_start"
    | "merge_done"
    | "merge_error"
    | "ready"
    | "done"
    | "stream_end";

interface SseEvent {
    type: EventType;
    data: Record<string, unknown>;
}

type Phase = "connecting" | "running" | "completed" | "failed" | "cancelled";

interface ChapterFile {
    filename: string;
    url: string;
}

/**
 * Live progress modal for audiobook exports.
 *
 * The dialog cannot be dismissed by clicking outside or pressing Escape -
 * audiobook generation can take minutes and a stray escape press should
 * not orphan the job. The user picks one of three explicit exits:
 *
 *   - Minimize: hand off to the badge, keep the job running
 *   - Cancel:   call DELETE /api/export/jobs/{id} and close
 *   - Close:    only available after the job reaches a terminal state
 */
export default function AudioExportProgress({jobId, bookTitle, onClose, onMinimize}: Props) {
    const {t} = useI18n();
    const [events, setEvents] = useState<SseEvent[]>([]);
    const [phase, setPhase] = useState<Phase>("connecting");
    const [total, setTotal] = useState<number>(0);
    const [current, setCurrent] = useState<number>(0);
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const [downloadFilename, setDownloadFilename] = useState<string | null>(null);
    const [chapterFiles, setChapterFiles] = useState<ChapterFile[]>([]);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [cancelling, setCancelling] = useState(false);
    const eventSourceRef = useRef<EventSource | null>(null);

    useEffect(() => {
        const es = new EventSource(`/api/export/jobs/${jobId}/stream`);
        eventSourceRef.current = es;

        es.onopen = () => setPhase((p) => (p === "connecting" ? "running" : p));

        es.onmessage = (e) => {
            let ev: SseEvent;
            try {
                ev = JSON.parse(e.data) as SseEvent;
            } catch {
                return;
            }
            setEvents((prev) => [...prev, ev]);

            switch (ev.type) {
                case "start":
                    setTotal(Number(ev.data.total) || 0);
                    setPhase("running");
                    break;
                case "chapter_done":
                case "chapter_skipped":
                case "chapter_error":
                    if (typeof ev.data.index === "number") setCurrent(ev.data.index);
                    break;
                case "ready": {
                    setDownloadUrl(api.exportJobs.downloadUrl(jobId));
                    setDownloadFilename(String(ev.data.filename || ""));
                    const files = Array.isArray(ev.data.chapter_files)
                        ? (ev.data.chapter_files as string[])
                        : [];
                    setChapterFiles(files.map((fn) => ({
                        filename: fn,
                        url: api.exportJobs.chapterFileUrl(jobId, fn),
                    })));
                    break;
                }
                case "stream_end": {
                    const status = String(ev.data.status || "");
                    const err = ev.data.error;
                    if (status === "failed") {
                        setPhase("failed");
                        if (typeof err === "string") setErrorMessage(err);
                    } else if (status === "cancelled") {
                        setPhase("cancelled");
                    } else {
                        setPhase("completed");
                    }
                    es.close();
                    break;
                }
            }
        };

        es.onerror = () => {
            setPhase((p) => (p === "connecting" ? "failed" : p));
        };

        return () => {
            es.close();
            eventSourceRef.current = null;
        };
    }, [jobId]);

    const handleCancel = async () => {
        setCancelling(true);
        try {
            await api.exportJobs.cancel(jobId);
            notify.info(t("ui.audio_progress.cancelled_toast", "Export abgebrochen"));
            onClose();
        } catch (err) {
            // 409 means it already finished - treat as success
            if (err instanceof ApiError && err.status === 409) {
                onClose();
                return;
            }
            const detail = err instanceof ApiError ? err.detail : String(err);
            notify.error(
                t("ui.audio_progress.cancel_failed", "Abbruch fehlgeschlagen") + ": " + detail,
                err,
            );
        } finally {
            setCancelling(false);
        }
    };

    const closable = phase === "completed" || phase === "failed" || phase === "cancelled";
    const cancellable = phase === "running" || phase === "connecting";
    const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

    const recentEvents = useMemo(
        () => events.filter((e) => e.type !== "stream_end").slice(-12),
        [events],
    );

    return (
        <Dialog.Root open={true} modal={true}>
            <Dialog.Portal>
                <Dialog.Overlay className="dialog-overlay" />
                <Dialog.Content
                    className="dialog-content dialog-content-wide"
                    onPointerDownOutside={(e) => e.preventDefault()}
                    onEscapeKeyDown={(e) => e.preventDefault()}
                    onInteractOutside={(e) => e.preventDefault()}
                >
                    <div className="dialog-header" style={{display: "flex", alignItems: "center", gap: 10}}>
                        <PhaseIcon phase={phase} />
                        <Dialog.Title className="dialog-title">
                            {t("ui.audio_progress.title", "Audiobook wird generiert")}: {bookTitle}
                        </Dialog.Title>
                    </div>

                    <ProgressBar percent={percent} phase={phase} />

                    <div style={{marginTop: 6, color: "var(--text-muted)", fontSize: "0.875rem"}}>
                        {phase === "connecting" && t("ui.audio_progress.connecting", "Verbinde...")}
                        {phase === "running" && (total > 0
                            ? t("ui.audio_progress.chapter_x_of_y", "Kapitel {current} von {total}")
                                .replace("{current}", String(current))
                                .replace("{total}", String(total))
                            : t("ui.audio_progress.starting", "Starte Generierung..."))}
                        {phase === "completed" && t("ui.audio_progress.completed", "Audiobook fertig")}
                        {phase === "cancelled" && t("ui.audio_progress.cancelled", "Export abgebrochen")}
                        {phase === "failed" && (errorMessage || t("ui.audio_progress.failed", "Generierung fehlgeschlagen"))}
                    </div>

                    <EventLog events={recentEvents} />

                    {chapterFiles.length > 0 && phase === "completed" && (
                        <ChapterFileList files={chapterFiles} />
                    )}

                    <div style={{display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16, flexWrap: "wrap"}}>
                        {downloadUrl && phase === "completed" && (
                            <a
                                className="btn btn-primary"
                                href={downloadUrl}
                                download={downloadFilename || true}
                            >
                                <Download size={16} /> {t("ui.audio_progress.download_zip", "ZIP herunterladen")}
                            </a>
                        )}
                        {cancellable && (
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={onMinimize}
                                title={t("ui.audio_progress.minimize_hint", "Im Hintergrund weiterlaufen lassen")}
                            >
                                <Minimize2 size={14} /> {t("ui.audio_progress.minimize", "Im Hintergrund fortsetzen")}
                            </button>
                        )}
                        {cancellable && (
                            <button
                                type="button"
                                className="btn btn-danger"
                                onClick={handleCancel}
                                disabled={cancelling}
                            >
                                <X size={14} /> {cancelling
                                    ? t("ui.audio_progress.cancelling", "Wird abgebrochen...")
                                    : t("ui.audio_progress.cancel", "Abbrechen")}
                            </button>
                        )}
                        {closable && (
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => {
                                    // After a successful run, remind the user
                                    // that the files are still reachable from
                                    // the metadata tab even if they close the
                                    // download buttons here.
                                    if (phase === "completed") {
                                        notify.info(
                                            t(
                                                "ui.audio_progress.saved_hint",
                                                "Audiobook erfolgreich generiert. Die Dateien sind jetzt unter Metadaten > Audiobook verfuegbar.",
                                            ),
                                        );
                                    }
                                    onClose();
                                }}
                            >
                                <X size={14} /> {t("ui.common.close", "Schliessen")}
                            </button>
                        )}
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

function PhaseIcon({phase}: {phase: Phase}) {
    if (phase === "completed") return <CheckCircle size={20} style={{color: "#16a34a"}} />;
    if (phase === "failed") return <AlertCircle size={20} style={{color: "#ef4444"}} />;
    if (phase === "cancelled") return <X size={20} style={{color: "var(--text-muted)"}} />;
    return <Loader size={20} style={{animation: "spin 1s linear infinite", color: "var(--accent)"}} />;
}

function ProgressBar({percent, phase}: {percent: number; phase: Phase}) {
    const fill =
        phase === "failed" ? "#ef4444" :
        phase === "cancelled" ? "var(--text-muted)" :
        phase === "completed" ? "#16a34a" :
        "var(--accent)";
    return (
        <div style={{marginTop: 16}}>
            <div style={{
                height: 10,
                background: "var(--bg-secondary)",
                borderRadius: 5,
                overflow: "hidden",
                border: "1px solid var(--border)",
            }}>
                <div style={{
                    width: `${percent}%`,
                    height: "100%",
                    background: fill,
                    transition: "width 0.3s ease",
                }} />
            </div>
            <div style={{textAlign: "right", fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2}}>
                {percent}%
            </div>
        </div>
    );
}

function EventLog({events}: {events: SseEvent[]}) {
    const {t} = useI18n();
    if (events.length === 0) return null;
    return (
        <div style={{
            marginTop: 16,
            padding: 10,
            background: "var(--bg-secondary)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            maxHeight: 220,
            overflowY: "auto",
            fontSize: "0.8125rem",
            fontFamily: "var(--font-mono)",
        }}>
            {events.map((ev, i) => (
                <div key={i} style={{padding: "2px 0", color: eventColor(ev.type)}}>
                    {eventLabel(ev, t)}
                </div>
            ))}
        </div>
    );
}

function ChapterFileList({files}: {files: ChapterFile[]}) {
    const {t} = useI18n();
    return (
        <details style={{marginTop: 16}}>
            <summary style={{cursor: "pointer", fontSize: "0.875rem", color: "var(--text-secondary)"}}>
                {t("ui.audio_progress.individual_files", "Einzelne Kapitel")} ({files.length})
            </summary>
            <ul style={{
                listStyle: "none",
                padding: "8px 0 0 0",
                margin: 0,
                maxHeight: 200,
                overflowY: "auto",
            }}>
                {files.map((f) => (
                    <li key={f.filename} style={{padding: "3px 0", fontSize: "0.8125rem"}}>
                        <a href={f.url} download={f.filename} style={{color: "var(--accent)"}}>
                            <Download size={12} style={{verticalAlign: "middle", marginRight: 4}} />
                            {f.filename}
                        </a>
                    </li>
                ))}
            </ul>
        </details>
    );
}

function eventColor(type: EventType): string {
    if (type === "chapter_done" || type === "merge_done" || type === "done") return "var(--text-secondary)";
    if (type === "chapter_error" || type === "merge_error") return "#ef4444";
    if (type === "chapter_skipped") return "var(--text-muted)";
    return "var(--text-primary)";
}

function eventLabel(ev: SseEvent, t: (key: string, fb: string) => string): string {
    const d = ev.data;
    const title = typeof d.title === "string" ? d.title : "";
    const idx = typeof d.index === "number" ? d.index : "";
    switch (ev.type) {
        case "start":
            return `${t("ui.audio_progress.event_start", "Start")} (${d.total} ${t("ui.audio_progress.chapters", "Kapitel")})`;
        case "chapter_start":
            return `${t("ui.audio_progress.event_chapter", "Kapitel")} ${idx}: ${title}`;
        case "chapter_done":
            return `  -> ${t("ui.audio_progress.event_done", "fertig")}`;
        case "chapter_skipped":
            return `  -> ${t("ui.audio_progress.event_skipped", "uebersprungen")} (${d.reason || ""})`;
        case "chapter_error":
            return `  -> ${t("ui.audio_progress.event_error", "Fehler")}: ${d.error || ""}`;
        case "merge_start":
            return t("ui.audio_progress.event_merge_start", "Kapitel werden zusammengefuegt...");
        case "merge_done":
            return `${t("ui.audio_progress.event_merge_done", "Zusammenfuegen fertig")}: ${d.filename || ""}`;
        case "merge_error":
            return `${t("ui.audio_progress.event_merge_error", "Fehler beim Zusammenfuegen")}: ${d.error || ""}`;
        case "ready":
            return t("ui.audio_progress.event_ready", "Datei bereit zum Download");
        case "done":
            return t("ui.audio_progress.event_finished", "Generierung abgeschlossen");
        default:
            return ev.type;
    }
}
