import {useEffect, useRef, useState} from "react";
import {useNavigate} from "react-router-dom";
import {AlertCircle, CheckCircle, Headphones, Loader, X} from "lucide-react";

import {api, ApiError} from "../api/client";
import {useAudiobookJob, formatChapterPrefix} from "../contexts/AudiobookJobContext";
import {useI18n} from "../hooks/useI18n";
import {notify} from "../utils/notify";
import AudioExportProgress from "./AudioExportProgress";

/**
 * Mounted at the App root. Reads the active audiobook job from
 * AudiobookJobContext and renders BOTH the dialog (when expanded)
 * and a persistent floating badge in the bottom-left corner.
 *
 * The badge is the user's hand-off point when they minimize the
 * dialog: it shows live progress (current/total) and clicks open
 * a popover with the current chapter, "Dialog oeffnen" and
 * "Abbrechen" buttons. After completion the badge stays around
 * for 10 seconds with a green/red status, then auto-dismisses;
 * a click on the completed badge navigates to the metadata tab.
 */
export default function AudioExportGate() {
    const job = useAudiobookJob();
    const navigate = useNavigate();
    const {t} = useI18n();
    const [popoverOpen, setPopoverOpen] = useState(false);
    const [autoDismiss, setAutoDismiss] = useState(false);
    const dismissTimer = useRef<number | null>(null);
    const lastPhase = useRef(job.phase);
    const popoverRef = useRef<HTMLDivElement | null>(null);

    // When phase transitions into "completed", show a toast and start
    // a 10-second auto-dismiss timer for the badge.
    useEffect(() => {
        if (lastPhase.current !== "completed" && job.phase === "completed") {
            const message = t(
                "ui.audio_progress.completion_toast",
                "Audiobook fertig. Jetzt unter Metadaten > Audiobook verfuegbar.",
            );
            // Toast that, on click, jumps the user to the metadata tab.
            notify.success(message);
            setAutoDismiss(true);
            dismissTimer.current = window.setTimeout(() => {
                job.clear();
            }, 10000);
        }
        if (lastPhase.current !== "failed" && job.phase === "failed") {
            // Failures stay until the user dismisses them - no auto-clear.
            setAutoDismiss(false);
        }
        lastPhase.current = job.phase;
        return () => {
            if (dismissTimer.current !== null) {
                window.clearTimeout(dismissTimer.current);
                dismissTimer.current = null;
            }
        };
    }, [job.phase]);

    // Close the popover on outside click.
    useEffect(() => {
        if (!popoverOpen) return;
        const onDown = (e: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                setPopoverOpen(false);
            }
        };
        window.addEventListener("mousedown", onDown);
        return () => window.removeEventListener("mousedown", onDown);
    }, [popoverOpen]);

    if (!job.active) return null;

    // The dialog is mounted whenever the user has it open. SSE state
    // lives in context, so opening/closing the dialog never drops events.
    if (job.modalOpen) {
        return <AudioExportProgress />;
    }

    const handleCancel = async () => {
        if (!job.jobId) return;
        try {
            await api.exportJobs.cancel(job.jobId);
            notify.info(t("ui.audio_progress.cancelled_toast", "Export abgebrochen"));
            job.clear();
        } catch (err) {
            if (err instanceof ApiError && err.status === 409) {
                job.clear();
                return;
            }
            const detail = err instanceof ApiError ? err.detail : String(err);
            notify.error(
                t("ui.audio_progress.cancel_failed", "Abbruch fehlgeschlagen") + ": " + detail,
                err,
            );
        }
    };

    const handleBadgeClick = () => {
        // Completed badge: jump to metadata tab and clear.
        if (job.phase === "completed" && job.bookId) {
            navigate(`/book/${job.bookId}?view=metadata`);
            job.clear();
            return;
        }
        // Failed badge: same idea, just no navigation.
        if (job.phase === "failed") {
            job.clear();
            return;
        }
        // Running badge: toggle popover.
        setPopoverOpen((v) => !v);
    };

    const percent = job.total > 0
        ? Math.min(100, Math.round((job.current / job.total) * 100))
        : 0;
    const progressLabel = job.total > 0
        ? `${formatChapterPrefix(job.current, job.total)}/${formatChapterPrefix(job.total, job.total)}`
        : "...";

    return (
        <div style={{position: "fixed", bottom: 16, left: 16, zIndex: 9000}}>
            <button
                type="button"
                onClick={handleBadgeClick}
                title={
                    job.phase === "completed"
                        ? t("ui.audio_progress.completed_hint", "Audiobook fertig - klicken oeffnet Metadaten")
                        : t("ui.audio_progress.expand_hint", "Audiobook-Export anzeigen")
                }
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 16px",
                    background: badgeBackground(job.phase),
                    color: "var(--text-inverse, #fff)",
                    border: "none",
                    borderRadius: 999,
                    boxShadow: "var(--shadow-md, 0 4px 12px rgba(0,0,0,0.15))",
                    cursor: "pointer",
                    fontFamily: "var(--font-body)",
                    fontSize: "0.875rem",
                    fontWeight: 500,
                    transition: "background 0.3s ease",
                }}
                data-testid="audiobook-badge"
            >
                <PhaseDot phase={job.phase} />
                <Headphones size={16} />
                <span>{badgeLabel(job, t, progressLabel)}</span>
            </button>

            {popoverOpen && (
                <div
                    ref={popoverRef}
                    role="dialog"
                    aria-label="Audiobook export progress"
                    style={{
                        position: "absolute",
                        bottom: "calc(100% + 8px)",
                        left: 0,
                        minWidth: 320,
                        padding: 16,
                        background: "var(--bg-card)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-md)",
                        boxShadow: "var(--shadow-md, 0 4px 12px rgba(0,0,0,0.15))",
                        fontFamily: "var(--font-body)",
                    }}
                >
                    <div style={{
                        fontSize: "0.875rem", fontWeight: 600,
                        color: "var(--text-primary)", marginBottom: 8,
                    }}>
                        {t("ui.audio_progress.popover_title", "Audiobook Export")}
                    </div>
                    <div style={{
                        height: 8,
                        background: "var(--bg-secondary)",
                        borderRadius: 4,
                        overflow: "hidden",
                        border: "1px solid var(--border)",
                        marginBottom: 6,
                    }}>
                        <div style={{
                            width: `${percent}%`,
                            height: "100%",
                            background: "var(--accent)",
                            transition: "width 0.3s ease",
                        }} />
                    </div>
                    <div style={{
                        fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 8,
                    }}>
                        {percent}% &middot;{" "}
                        {t("ui.audio_progress.popover_chapter_count", "{current} von {total} Kapiteln")
                            .replace("{current}", String(job.current))
                            .replace("{total}", String(job.total))}
                    </div>
                    {job.currentTitle && (
                        <div style={{
                            fontSize: "0.8125rem", color: "var(--text-secondary)",
                            marginBottom: 12, fontFamily: "var(--font-mono)",
                        }}>
                            {t("ui.audio_progress.popover_current", "Aktuell")}:{" "}
                            {formatChapterPrefix(job.current, job.total)} | {job.currentTitle}
                        </div>
                    )}
                    <div style={{display: "flex", gap: 8, flexWrap: "wrap"}}>
                        <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => {
                                setPopoverOpen(false);
                                job.expand();
                            }}
                        >
                            {t("ui.audio_progress.popover_open", "Dialog oeffnen")}
                        </button>
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                                setPopoverOpen(false);
                                handleCancel();
                            }}
                            style={{color: "var(--danger, #c0392b)"}}
                        >
                            <X size={12}/> {t("ui.audio_progress.cancel", "Abbrechen")}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function PhaseDot({phase}: {phase: ReturnType<typeof useAudiobookJob>["phase"]}) {
    if (phase === "completed") return <CheckCircle size={16} />;
    if (phase === "failed") return <AlertCircle size={16} />;
    return <Loader size={16} style={{animation: "spin 1s linear infinite"}} />;
}

function badgeBackground(phase: ReturnType<typeof useAudiobookJob>["phase"]): string {
    if (phase === "completed") return "#16a34a";
    if (phase === "failed") return "#ef4444";
    return "var(--accent)";
}

function badgeLabel(
    job: ReturnType<typeof useAudiobookJob>,
    t: (key: string, fb: string) => string,
    progressLabel: string,
): string {
    if (job.phase === "completed") {
        return t("ui.audio_progress.badge_done", "Audiobook fertig");
    }
    if (job.phase === "failed") {
        return t("ui.audio_progress.badge_failed", "Audiobook fehlgeschlagen");
    }
    return progressLabel;
}
