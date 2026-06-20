/**
 * Floating badge for an active Medium-import async job.
 *
 * Mounted at the App root. Reads ``useMediumImportJob()`` and
 * renders a bottom-left badge whenever a job is in flight AND
 * the user is NOT on the /articles/import/medium page (where
 * the in-line progress UI is already visible).
 *
 * Mirrors the AudioExportGate pattern: badge during background
 * runtime, click navigates back to the page, terminal phases
 * auto-dismiss after 10 s (success) or wait for user click
 * (failure / cancelled).
 *
 * Distinct from AudioExportGate because medium-import has NO
 * modal-vs-page split: the page IS the progress surface, and
 * "minimize" just means "navigate away with the SSE-driven
 * context still running". So this gate ONLY renders the badge
 * (no dialog branch).
 */

import {useEffect, useRef, useState} from "react";
import {useLocation, useNavigate} from "react-router-dom";
import {AlertCircle, CheckCircle, Download, Loader} from "lucide-react";

import {useMediumImportJob} from "../../contexts/MediumImportJobContext";
import {useI18n} from "../../hooks/useI18n";

const PAGE_PATH = "/articles/import/medium";
const AUTO_DISMISS_MS = 10_000;

function badgeBackground(phase: string): string {
    if (phase === "completed") return "var(--success, #2e7d32)";
    if (phase === "failed") return "var(--danger, #c62828)";
    if (phase === "cancelled") return "var(--text-muted, #6b7280)";
    return "var(--accent, #1976d2)";
}

function badgeIcon(phase: string) {
    if (phase === "completed") return <CheckCircle size={16} />;
    if (phase === "failed") return <AlertCircle size={16} />;
    if (phase === "cancelled") return <AlertCircle size={16} />;
    return <Loader size={16} className="medium-import-gate-spin" />;
}

export default function MediumImportGate() {
    const job = useMediumImportJob();
    const navigate = useNavigate();
    const location = useLocation();
    const {t} = useI18n();
    const dismissTimer = useRef<number | null>(null);
    const lastPhase = useRef(job.phase);
    // ``badgeDismissed`` hides the badge after the 10 s auto-dismiss
    // window without clearing the underlying job — the result panel
    // on the page must still render when the user navigates back.
    // The Page's handleReset is the only thing that calls job.clear().
    const [badgeDismissed, setBadgeDismissed] = useState(false);

    // Auto-dismiss the BADGE on successful completion (mirrors
    // AudioExportGate timing). Failures / cancellations keep the
    // badge until the user clicks it. The job.result stays in
    // context regardless so the result panel persists across
    // navigation.
    useEffect(() => {
        // Reset the dismissed flag whenever a new running phase
        // begins (a new job displaced an old one).
        if (lastPhase.current !== "running" && job.phase === "running") {
            setBadgeDismissed(false);
        }
        if (lastPhase.current !== "completed" && job.phase === "completed") {
            dismissTimer.current = window.setTimeout(() => {
                setBadgeDismissed(true);
            }, AUTO_DISMISS_MS);
        }
        lastPhase.current = job.phase;
        return () => {
            if (dismissTimer.current !== null) {
                window.clearTimeout(dismissTimer.current);
                dismissTimer.current = null;
            }
        };
    }, [job.phase]);

    // Suppress the badge while the user is already on the import
    // page (the in-line progress UI is the surface there). Also
    // suppress after the auto-dismiss timer flipped the local flag.
    if (!job.active) return null;
    if (badgeDismissed) return null;
    if (location.pathname === PAGE_PATH) return null;

    const handleClick = () => {
        // Any click cancels a pending auto-dismiss and navigates
        // back to the page. The page reads job.result for the
        // result panel; the badge disappears next render because
        // pathname now matches PAGE_PATH.
        if (dismissTimer.current !== null) {
            window.clearTimeout(dismissTimer.current);
            dismissTimer.current = null;
        }
        navigate(PAGE_PATH);
    };

    const percent =
        job.total > 0
            ? Math.min(100, Math.round((job.current / job.total) * 100))
            : 0;
    const progressLabel = job.total > 0 ? `${job.current}/${job.total}` : "…";
    const fallbackText =
        job.phase === "completed"
            ? t(
                  "ui.medium_import.gate.completed",
                  "Medium-Import fertig",
              )
            : job.phase === "failed"
              ? t("ui.medium_import.gate.failed", "Medium-Import fehlgeschlagen")
              : job.phase === "cancelled"
                ? t(
                      "ui.medium_import.gate.cancelled",
                      "Medium-Import abgebrochen",
                  )
                : t(
                      "ui.medium_import.gate.running",
                      "Medium-Import läuft …",
                  );

    return (
        <div
            style={{
                position: "fixed",
                bottom: 16,
                left: 16,
                zIndex: 9000,
            }}
            data-testid="medium-import-gate-badge"
        >
            <button
                type="button"
                onClick={handleClick}
                title={t(
                    "ui.medium_import.gate.expand_hint",
                    "Klicken, um zur Medium-Import-Seite zurückzukehren",
                )}
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 16px",
                    background: badgeBackground(job.phase),
                    color: "var(--text-inverse, #fff)",
                    border: "none",
                    borderRadius: "var(--radius-md, 8px)",
                    boxShadow:
                        "0 4px 12px rgba(0, 0, 0, 0.18)",
                    cursor: "pointer",
                    fontWeight: 500,
                    fontSize: "0.875rem",
                    opacity: 1,
                }}
            >
                <Download size={14} aria-hidden="true" />
                {badgeIcon(job.phase)}
                <span>{fallbackText}</span>
                {job.phase === "running" && (
                    <span data-testid="medium-import-gate-progress">
                        {progressLabel} ({percent}%)
                    </span>
                )}
            </button>
        </div>
    );
}
